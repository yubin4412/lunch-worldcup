(() => {
  const MENUS = window.MENUS;
  const CFG = window.WC_CONFIG || {};
  const ONLINE = Boolean(CFG.supabaseUrl && CFG.supabaseAnonKey);
  const byName = new Map(MENUS.map(m => [m.n, m]));
  const FALLBACK_IMG = 'assets/mascot.png';
  const $ = id => document.getElementById(id);

  // ---------- 저장소: Supabase, 설정 전이면 이 기기(localStorage) ----------
  const local = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  async function api(path, { method = 'GET', body, prefer } = {}) {
    const headers = { apikey: CFG.supabaseAnonKey, 'Content-Type': 'application/json' };
    // 예전 anon 키(JWT)는 Authorization 헤더도 필요, 새 publishable 키는 apikey만
    if (!CFG.supabaseAnonKey.startsWith('sb_')) headers.Authorization = 'Bearer ' + CFG.supabaseAnonKey;
    if (prefer) headers.Prefer = prefer;
    const res = await fetch(`${CFG.supabaseUrl.replace(/\/$/, '')}/rest/v1/${path}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return res.status === 204 ? null : res.json().catch(() => null);
  }

  const store = {
    async recordGame(roundSize, champion, results, player) {
      if (ONLINE) return api('rpc/record_game', { method: 'POST', body: { round_size: roundSize, champion, results, player } });
      const s = local.get('wc_stats', {});
      const row = n => (s[n] ||= { menu: n, wins: 0, matches: 0, champions: 0 });
      results.forEach(r => { row(r.w).wins++; row(r.w).matches++; row(r.l).matches++; });
      row(champion).champions++;
      local.set('wc_stats', s);
      const games = local.get('wc_games', []);
      games.unshift({ player, champion, round_size: roundSize, created_at: new Date().toISOString() });
      local.set('wc_games', games.slice(0, 50));
    },
    async stats() {
      if (ONLINE) return api('menu_stats?select=menu,wins,matches,champions');
      return Object.values(local.get('wc_stats', {}));
    },
    async recentGames(limit = 20) {
      if (ONLINE) return api(`games?select=player,champion,round_size,created_at&order=created_at.desc&limit=${limit}`);
      return local.get('wc_games', []).slice(0, limit);
    },
    // 메뉴 하나에 달린 댓글
    async comments(menu) {
      if (ONLINE) return api(`comments?select=id,nickname,body,menu,created_at&menu=eq.${encodeURIComponent(menu)}&order=created_at.desc&limit=100`);
      return local.get('wc_comments', []).filter(c => c.menu === menu);
    },
    // 메뉴별 댓글 수
    async commentCounts() {
      const list = ONLINE ? await api('comments?select=menu&limit=5000') : local.get('wc_comments', []);
      const counts = {};
      list.forEach(c => { counts[c.menu] = (counts[c.menu] || 0) + 1; });
      return counts;
    },
    async addComment(c) {
      if (ONLINE) return api('comments', { method: 'POST', body: c, prefer: 'return=minimal' });
      const list = local.get('wc_comments', []);
      list.unshift({ ...c, id: Date.now(), created_at: new Date().toISOString() });
      local.set('wc_comments', list.slice(0, 500));
    },
  };

  // ---------- 공통 ----------
  const screens = ['home', 'game', 'result', 'rank'];
  function show(id) {
    screens.forEach(s => { $(s).hidden = s !== id; });
    window.scrollTo(0, 0);
  }

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  // 사진을 못 불러오면 마스코트로 대신 보여줌
  function setPhoto(img, m) {
    img.classList.remove('fallback');
    img.onerror = () => {
      img.onerror = null;
      img.src = FALLBACK_IMG;
      img.classList.add('fallback');
    };
    img.src = m ? m.img : FALLBACK_IMG;
  }

  function timeAgo(iso) {
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 60) return '방금';
    if (s < 3600) return `${Math.floor(s / 60)}분 전`;
    if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
    return `${Math.floor(s / 86400)}일 전`;
  }

  const roundLabel = n => (n === 2 ? '결승' : n === 4 ? '준결승' : `${n}강`);

  // ---------- 이름 ----------
  let player = local.get('wc_nick', '');

  function renderName() {
    const has = Boolean(player);
    $('name-form').hidden = has;
    $('setup').hidden = !has;
    $('who-name').textContent = player;
    $('player-name').value = player;
  }

  $('name-form').onsubmit = e => {
    e.preventDefault();
    const v = $('player-name').value.trim().slice(0, 12);
    if (!v) return;
    player = v;
    local.set('wc_nick', v);
    renderName();
  };
  $('rename-btn').onclick = () => {
    $('name-form').hidden = false;
    $('setup').hidden = true;
    $('player-name').focus();
  };

  // ---------- 시작 화면 ----------
  const SIZES = [16, 32, 64, 128, 256].filter(n => n <= MENUS.length);
  let roundSize = local.get('wc_round', 32);
  if (!SIZES.includes(roundSize)) roundSize = 32;

  function renderRounds() {
    $('rounds').replaceChildren(...SIZES.map(n => {
      const b = document.createElement('button');
      b.className = 'round-chip';
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(n === roundSize));
      b.textContent = `${n}강`;
      b.onclick = () => { roundSize = n; local.set('wc_round', n); renderRounds(); };
      return b;
    }));
    const mins = Math.max(1, Math.round((roundSize - 1) * 3 / 60));
    $('round-hint').textContent = `${MENUS.length}개 메뉴 중 무작위 ${roundSize}개가 대결해요. ${roundSize - 1}번 고르면 끝 (약 ${mins}분)`;
  }

  async function renderLeader() {
    try {
      const top = rankRows(await store.stats())[0];
      if (!top) return;
      $('leader-name').textContent = top.menu;
      $('leader-meta').textContent = `우승 ${top.champions}번 · 승률 ${pct(top)}`;
      setPhoto($('leader-img'), byName.get(top.menu));
      $('leader').hidden = false;
    } catch { /* 랭킹 못 불러오면 그냥 숨김 */ }
  }

  // ---------- 게임 ----------
  let game;

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function startGame() {
    if (!player) { show('home'); renderName(); $('player-name').focus(); return; }
    game = {
      size: roundSize,
      current: shuffle(MENUS.slice()).slice(0, roundSize),
      next: [],
      idx: 0,
      results: [],
      history: [],
      busy: false,
    };
    show('game');
    renderMatch();
  }

  function fillCard(el, m) {
    el.innerHTML = `<img alt="" decoding="async">
      <span class="times"></span>
      <span class="label"><strong></strong><small></small></span>`;
    const img = el.querySelector('img');
    img.alt = `${m.n}이 나온 날 식판 (${m.pd})`;
    setPhoto(img, m);
    el.querySelector('.times').textContent = `${m.c}번 나옴`;
    el.querySelector('strong').textContent = m.n;
    el.querySelector('small').textContent = `${m.pd} 급식`;
    el.className = 'pick';
    el.setAttribute('aria-label', `${m.n} 선택`);
  }

  function renderMatch() {
    const g = game;
    const a = g.current[g.idx], b = g.current[g.idx + 1];
    const total = g.current.length / 2;
    const done = g.size - g.current.length + g.idx / 2;
    $('round-name').textContent = roundLabel(g.current.length);
    $('round-step').textContent = g.current.length === 2 ? '' : `${g.idx / 2 + 1}/${total}`;
    $('progress-bar').style.width = `${(done / (g.size - 1)) * 100}%`;
    $('undo-btn').disabled = g.history.length === 0;
    fillCard($('pick-a'), a);
    fillCard($('pick-b'), b);
    // 다음 대결 사진 미리 받아두기
    [g.current[g.idx + 2], g.current[g.idx + 3]].forEach(m => { if (m) new Image().src = m.img; });
  }

  function choose(side) {
    const g = game;
    if (!g || g.busy) return;
    g.busy = true;
    const a = g.current[g.idx], b = g.current[g.idx + 1];
    const [w, l] = side === 'a' ? [a, b] : [b, a];
    $(side === 'a' ? 'pick-a' : 'pick-b').classList.add('chosen');
    $(side === 'a' ? 'pick-b' : 'pick-a').classList.add('lost');

    g.history.push({ current: g.current, next: g.next.slice(), idx: g.idx });
    g.results.push({ w: w.n, l: l.n });
    g.next.push(w);
    g.idx += 2;

    setTimeout(() => {
      g.busy = false;
      if (g.idx >= g.current.length) {
        if (g.next.length === 1) return finish(g.next[0]);
        g.current = g.next; g.next = []; g.idx = 0;
      }
      renderMatch();
    }, 420);
  }

  function undo() {
    const g = game;
    if (!g || g.busy || !g.history.length) return;
    const h = g.history.pop();
    g.current = h.current; g.next = h.next; g.idx = h.idx;
    g.results.pop();
    renderMatch();
  }

  // ---------- 결과 ----------
  let lastChampion = null;

  async function finish(champ) {
    lastChampion = champ;
    show('result');
    $('win-round').textContent = `${game.size}강 우승`;
    $('win-player').textContent = `${player} 님의 최애 급식`;
    $('win-name').textContent = champ.n;
    $('win-img').alt = `${champ.n}이 나온 날 식판`;
    setPhoto($('win-img'), champ);
    $('win-cap').textContent = `2023년 3월부터 점심에 ${champ.c}번 나왔고, 마지막으로 나온 날은 ${champ.last}예요. (사진: ${champ.pd})`;
    $('sync-msg').textContent = '우리 반 랭킹에 올리는 중…';
    const thread = $('result-thread');
    thread.replaceChildren();
    thread.append(...threadNodes(champ.n, `"${champ.n}"에 한마디`));
    try {
      await store.recordGame(game.size, champ.n, game.results, player);
      $('sync-msg').textContent = ONLINE ? '우리 반 랭킹에 반영됐어요!' : '서버 연결 전이라 이 폰에만 기록됐어요.';
    } catch (e) {
      console.error(e);
      $('sync-msg').textContent = '랭킹에 올리지 못했어요. 인터넷 연결을 확인해 주세요.';
    }
  }

  async function share() {
    const url = location.href.split('#')[0];
    const text = lastChampion
      ? `내 급식 월드컵 우승은 "${lastChampion.n}"! 너는 뭐 골라?`
      : '우리 학교 급식 월드컵 해봐!';
    if (navigator.share) {
      try { await navigator.share({ title: '애니고 급식 월드컵', text, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(`${text} ${url}`); toast('링크를 복사했어요. 카톡에 붙여넣기!'); }
    catch { toast(url); }
  }

  // ---------- 메뉴별 댓글 ----------
  function commentItem(c) {
    const li = document.createElement('li');
    const head = document.createElement('div');
    head.className = 'c-head';
    const nick = document.createElement('b'); nick.textContent = c.nickname;
    const t = document.createElement('span'); t.className = 'c-time'; t.textContent = timeAgo(c.created_at);
    head.append(nick, t);
    const body = document.createElement('p'); body.className = 'c-body'; body.textContent = c.body;
    li.append(head, body);
    return li;
  }

  // 제목 + 댓글 목록 + 입력창. onPosted: 댓글 올린 뒤 호출 (댓글 수 갱신용)
  function threadNodes(menu, title, onPosted) {
    const nodes = [];
    if (title) { const h = document.createElement('h2'); h.textContent = title; nodes.push(h); }

    const form = document.createElement('form');
    form.className = 'comment-form';
    const ta = document.createElement('textarea');
    ta.maxLength = 200; ta.rows = 2; ta.required = true;
    ta.placeholder = player ? `${player}(으)로 댓글 달기` : '댓글 달기';
    ta.setAttribute('aria-label', `${menu} 댓글`);
    const btn = document.createElement('button');
    btn.className = 'btn primary small'; btn.type = 'submit'; btn.textContent = '등록';
    form.append(ta, btn);

    const ul = document.createElement('ul');
    ul.className = 'comment-list';

    async function load() {
      try {
        const list = await store.comments(menu);
        if (!list.length) {
          const li = document.createElement('li'); li.className = 'empty'; li.textContent = '아직 댓글이 없어요. 첫 댓글을 남겨주세요!';
          ul.replaceChildren(li);
        } else ul.replaceChildren(...list.map(commentItem));
      } catch { ul.replaceChildren(); }
    }

    form.onsubmit = async e => {
      e.preventDefault();
      if (!player) { toast('처음 화면에서 이름을 먼저 입력해 주세요'); return; }
      const body = ta.value.trim().slice(0, 200);
      if (!body) return;
      btn.disabled = true;
      try {
        await store.addComment({ nickname: player, body, menu });
        ta.value = '';
        toast('댓글을 남겼어요');
        await load();
        onPosted && onPosted();
      } catch (err) {
        console.error(err);
        toast('댓글을 못 올렸어요. 잠시 후 다시 해주세요.');
      } finally {
        btn.disabled = false;
      }
    };

    load();
    nodes.push(form, ul);
    return nodes;
  }

  // ---------- 랭킹 ----------
  const rate = r => (r.matches ? r.wins / r.matches : 0);
  const pct = r => `${Math.round(rate(r) * 100)}%`;

  function rankRows(stats) {
    return stats
      .filter(r => r.matches > 0 && byName.has(r.menu))
      .sort((a, b) => b.champions - a.champions || rate(b) - rate(a) || b.matches - a.matches);
  }

  function rankItem(r, i, count) {
    const li = document.createElement('li');
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'rank-row';
    row.setAttribute('aria-expanded', 'false');
    row.innerHTML = `<span class="rank-no">${i + 1}</span><img alt="" loading="lazy">
      <span class="rank-body"><span class="rank-name"></span>
      <span class="rank-meta">우승 ${r.champions}번 · 승률 ${pct(r)} (${r.wins}승 ${r.matches - r.wins}패)</span>
      <span class="bar"><span style="width:${pct(r)}"></span></span></span>
      <span class="c-count"></span>`;
    setPhoto(row.querySelector('img'), byName.get(r.menu));
    row.querySelector('.rank-name').textContent = r.menu;
    const badge = row.querySelector('.c-count');
    const setCount = n => { badge.textContent = `💬 ${n}`; };
    setCount(count);

    let thread = null;
    row.onclick = () => {
      const open = row.getAttribute('aria-expanded') !== 'true';
      row.setAttribute('aria-expanded', String(open));
      if (open && !thread) {
        thread = document.createElement('div');
        thread.className = 'thread';
        thread.append(...threadNodes(r.menu, '', () => setCount(++count)));
        li.append(thread);
      }
      if (thread) thread.hidden = !open;
    };
    li.append(row);
    return li;
  }

  async function openRank() {
    show('rank');
    $('rank-sum').textContent = '불러오는 중…';
    loadRecent();
    try {
      const [stats, counts] = await Promise.all([store.stats(), store.commentCounts().catch(() => ({}))]);
      const rows = rankRows(stats);
      const games = rows.reduce((s, r) => s + r.champions, 0);
      $('rank-sum').textContent = `지금까지 ${games}판 · 우승 횟수 순, 같으면 1:1 승률 순 · 메뉴를 누르면 댓글${ONLINE ? '' : ' · 이 기기 기록만 보여요'}`;
      $('rank-empty').hidden = rows.length > 0;
      $('rank-list').replaceChildren(...rows.slice(0, 100).map((r, i) => rankItem(r, i, counts[r.menu] || 0)));
    } catch (e) {
      console.error(e);
      $('rank-sum').textContent = '랭킹을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.';
    }
  }

  async function loadRecent() {
    const ul = $('recent-list');
    try {
      const list = await store.recentGames(20);
      if (!list.length) {
        const li = document.createElement('li'); li.className = 'empty'; li.textContent = '아직 아무도 안 했어요.';
        ul.replaceChildren(li);
        return;
      }
      ul.replaceChildren(...list.map(g => {
        const li = document.createElement('li');
        const who = document.createElement('b'); who.textContent = g.player || '익명';
        const what = document.createElement('span'); what.textContent = ` 님 → ${g.champion} (${g.round_size}강)`;
        const t = document.createElement('span'); t.className = 'c-time'; t.textContent = timeAgo(g.created_at);
        li.append(who, what, t);
        return li;
      }));
    } catch { ul.replaceChildren(); }
  }

  // ---------- 연결 ----------
  $('total-count').textContent = MENUS.length;
  renderName();
  renderRounds();
  renderLeader();

  $('start-btn').onclick = startGame;
  $('rank-btn').onclick = openRank;
  $('pick-a').onclick = () => choose('a');
  $('pick-b').onclick = () => choose('b');
  $('undo-btn').onclick = undo;
  $('quit-btn').onclick = () => { game = null; show('home'); renderLeader(); };
  $('again-btn').onclick = startGame;
  $('result-rank-btn').onclick = openRank;
  $('rank-back').onclick = () => { show('home'); renderLeader(); };
  $('share-btn').onclick = share;
  document.addEventListener('keydown', e => {
    if ($('game').hidden) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') choose('a');
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') choose('b');
    if (e.key === 'Backspace') undo();
  });
})();
