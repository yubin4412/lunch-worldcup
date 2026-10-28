-- 애니고 급식 월드컵 DB 설정
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run 하면 끝.

-- 메뉴별 전적: 1:1 대결 승/패, 우승 횟수
create table if not exists public.menu_stats (
  menu        text primary key,
  wins        int  not null default 0,
  matches     int  not null default 0,
  champions   int  not null default 0,
  updated_at  timestamptz not null default now()
);

-- 한 판 끝날 때마다 쌓이는 기록 (누가 뭘 골랐는지)
create table if not exists public.games (
  id          bigint generated always as identity primary key,
  player      text check (char_length(player) <= 12),
  round_size  int  not null check (round_size in (4, 8, 16, 32, 64, 128, 256)),
  champion    text not null check (char_length(champion) <= 60),
  created_at  timestamptz not null default now()
);

-- 메뉴별 댓글
create table if not exists public.comments (
  id          bigint generated always as identity primary key,
  nickname    text not null check (char_length(nickname) between 1 and 12),
  body        text not null check (char_length(body) between 1 and 200),
  menu        text not null check (char_length(menu) <= 60),
  created_at  timestamptz not null default now()
);
create index if not exists comments_menu_idx on public.comments (menu, created_at desc);

alter table public.menu_stats enable row level security;
alter table public.games      enable row level security;
alter table public.comments   enable row level security;

-- 누구나 읽기 가능
drop policy if exists "read stats" on public.menu_stats;
create policy "read stats" on public.menu_stats for select using (true);
drop policy if exists "read games" on public.games;
create policy "read games" on public.games for select using (true);
drop policy if exists "read comments" on public.comments;
create policy "read comments" on public.comments for select using (true);

-- 댓글은 누구나 쓰기 가능 (수정/삭제는 대시보드에서만)
drop policy if exists "write comments" on public.comments;
create policy "write comments" on public.comments for insert with check (true);

-- 전적은 아래 함수로만 기록 (표를 직접 고치는 건 막음)
-- results: [{"w":"이긴 메뉴","l":"진 메뉴"}, ...]  한 판의 모든 대결
drop function if exists public.record_game(int, text, jsonb);
create or replace function public.record_game(round_size int, champion text, results jsonb, player text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
begin
  if jsonb_typeof(results) <> 'array' or jsonb_array_length(results) <> round_size - 1 then
    raise exception 'bad results';
  end if;

  insert into games(player, round_size, champion) values (left(player, 12), round_size, champion);

  for r in select * from jsonb_array_elements(results) loop
    insert into menu_stats(menu, wins, matches) values (left(r->>'w', 60), 1, 1)
      on conflict (menu) do update set wins = menu_stats.wins + 1, matches = menu_stats.matches + 1, updated_at = now();
    insert into menu_stats(menu, wins, matches) values (left(r->>'l', 60), 0, 1)
      on conflict (menu) do update set matches = menu_stats.matches + 1, updated_at = now();
  end loop;

  insert into menu_stats(menu, champions) values (left(champion, 60), 1)
    on conflict (menu) do update set champions = menu_stats.champions + 1, updated_at = now();
end;
$$;

revoke all on function public.record_game(int, text, jsonb, text) from public;
grant execute on function public.record_game(int, text, jsonb, text) to anon, authenticated;
