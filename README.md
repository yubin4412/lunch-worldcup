# 애니고 급식 월드컵

한국애니메이션고 점심 급식 중 **1년(3월~다음 해 2월) 안에 두 번 이상 나온 메뉴**를 실제 식판 사진으로 고르는 이상형 월드컵입니다.
결과는 반 친구들 전체 랭킹에 쌓이고, 결과 화면에서 댓글을 남길 수 있어요.

- 메뉴·사진: 학교 홈페이지 급식안내(2023.03 ~ 2026.10), 사진 있는 날만
- 후보: 338개 (밥·김치·요구르트·소스 같은 기본 반찬은 뺌)
- 모바일 세로 화면 기준, 16/32/64/128/256강 선택

## 폴더 구성

| 파일 | 하는 일 |
| --- | --- |
| `index.html`, `style.css`, `app.js` | 사이트 본체 |
| `config.js` | Supabase 주소와 키 (랭킹·댓글 서버) |
| `data/menus.js` | 후보 메뉴 목록 (`data/menus.txt`에서 만듦) |
| `images/` | 식판 사진 (가로 800px로 줄인 것) |
| `assets/` | 마스코트·트로피·공유 미리보기 이미지 |
| `supabase/setup.sql` | 랭킹·댓글 DB 만드는 SQL |
| `tools/fetch-photos.ps1` | 학교 홈페이지에서 사진 다시 받기 |
| `tools/serve.ps1` | 내 컴퓨터에서 미리보기 (http://localhost:8080) |

## 1단계: Supabase (랭킹·댓글 서버, 무료)

1. https://supabase.com 에서 GitHub 계정으로 가입 → **New project** (이름 아무거나, 지역은 Northeast Asia (Seoul))
2. 왼쪽 메뉴 **SQL Editor** → `supabase/setup.sql` 내용을 통째로 붙여넣고 **Run**
3. **Project Settings → API** 에서 두 가지를 복사
   - Project URL (예: `https://abcd1234.supabase.co`)
   - `anon` `public` 키 (긴 문자열. **service_role 키는 절대 쓰면 안 됨**)
4. 복사한 두 값을 Claude에게 알려주거나 `config.js`에 직접 넣기

`anon` 키는 사이트에 공개돼도 괜찮은 키예요. DB는 "읽기 + 댓글 쓰기 + 전적 기록 함수 호출"만 열어놨어요.
이상한 댓글은 Supabase 대시보드 **Table Editor → comments** 에서 지우면 됩니다.

## 2단계: GitHub Pages (사이트 주소 만들기, 무료)

1. https://github.com/new 에서 저장소 만들기 (예: `lunch-worldcup`, Public)
2. 이 폴더를 그 저장소에 올리기 (GitHub Desktop: File → Add local repository → 이 폴더 → Publish)
3. 저장소 **Settings → Pages** → Branch를 `main` / `(root)`로 두고 Save
4. 1~2분 뒤 `https://내아이디.github.io/lunch-worldcup/` 주소가 생겨요. 이 링크를 반 단톡방에 공유!

## 사진 다시 받기

```powershell
powershell -ExecutionPolicy Bypass -File tools/fetch-photos.ps1
```
