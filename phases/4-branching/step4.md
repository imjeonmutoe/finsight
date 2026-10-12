# Step 4: gate-db-guard

## 배경

이 phase는 Supabase Branching(GitHub 연동)을 도입한다. 연동의 "Deploy to production"을 켜면 **PR을 main에 머지하는
순간 `supabase/migrations/`의 새 마이그레이션이 실데이터가 든 프로덕션 DB에 적용된다.** 그런데
`.github/workflows/review-code.yml`의 `gate` 잡은 리뷰 지적이 없거나 nit뿐이면 PR을 **자동 머지**한다.
둘을 그대로 합치면 사람이 한 번도 보지 않은 마이그레이션이 프로덕션에 들어간다.

결정: `supabase/` 아래를 건드린 PR은 게이트가 **승인까지만** 하고 머지는 사람이 한다. 사람이 머지 버튼을 누르는 것이
곧 프로덕션 적용 승인이다. `supabase/` 전체로 잡는 이유: `migrations/`뿐 아니라 `config.toml`의 버킷·함수 선언도
머지하면 프로덕션에 배포된다.

## 읽어야 할 파일

- `/CLAUDE.md` — `### 자동 승인·머지 게이트` 전체. 특히 "틀리는 쪽은 항상 '아무것도 안 함'", "게이트 잡은 main을 체크아웃한다"
- `scripts/merge_gate.py`, `scripts/test_merge_gate.py`
- `.github/workflows/review-code.yml` — `gate` 잡

## 작업

### 1. 테스트 먼저 — `scripts/test_merge_gate.py`

- nit만 있고 바뀐 파일에 `supabase/migrations/x.sql`이 있음 → `approve` (reason에 `supabase/`와 "사람이 머지" 취지)
- 지적 0건 + `supabase/config.toml` → `approve`
- 지적 0건 + `src/app/page.tsx`만 → `merge` (기존 동작 유지)
- minor + `supabase/` → `approve` (그대로. 더 낮추거나 올리지 않는다)
- critical + `supabase/` → `none` (그대로)
- 이름 변경으로 `supabase/` **밖으로** 옮긴 파일(옛 경로가 `supabase/`) → `approve`
- `supabase-docs/x.md`처럼 접두어만 같은 경로 → `merge` (경로 구분자 기준으로 판정)
- `--files` 인자가 없음 → 종료 코드 2
- `--files` 파일이 비어 있음 → 종료 코드 3 (PR에 바뀐 파일이 0개일 수 없다 — 목록을 못 받은 것이다)

### 2. `scripts/merge_gate.py`

```python
DB_PATH_PREFIX = "supabase/"

def touches_db(paths: list[str]) -> bool: ...
def decide(marker, paths) -> tuple[str, str]: ...   # 기존 판정 뒤에 merge → approve로만 낮춘다
```

- `--files`(필수): 바뀐 경로를 한 줄에 하나씩 담은 파일. 이름 변경은 새 경로와 옛 경로를 둘 다 담는다
- 낮추기만 한다: `merge`일 때만 `approve`로 바꾸고, `approve`·`none`은 그대로 둔다
- 출력 JSON에 `"touches_db": true|false`를 추가한다. 기존 키는 바꾸지 않는다
- 모듈 docstring의 판정 표와 사용법에 이 규칙과 `--files`를 추가한다

### 3. `.github/workflows/review-code.yml`의 `gate` 잡

`리뷰 판정 읽기` 스텝에서 파일 목록을 받아 넘긴다:

```bash
gh api "repos/$REPO/pulls/$PR/files" --paginate \
  --jq '.[] | .filename, (.previous_filename // empty)' > files.txt
python3 scripts/merge_gate.py --events events.jsonl --files files.txt --since "$SINCE" --actor "github-actions[bot]" > gate.json
```

`gate` 잡의 `permissions`와 체크아웃 ref(`main`)는 바꾸지 않는다. 바꾼 줄 위에 "왜 `supabase/`면 사람이 머지하는가"를 두 줄 이내 주석으로 단다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
uv run --with pytest python -m pytest scripts/ -q
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 게이트에 LLM 호출이나 리뷰 본문 파싱이 새로 들어가지 않았는가?
   - 판정을 모르는 경우(인자 없음·목록 비어 있음)가 전부 머지하지 않는 쪽으로 떨어지는가?
3. 결과에 따라 `phases/4-branching/index.json`의 step 4를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`

## 금지사항

- `--files`를 선택 인자로 만들지 마라. 이유: 옛 워크플로우나 깨진 스텝이 목록 없이 부르면 `supabase/` PR이 자동 머지된다. 모르면 머지하지 않는다.
- `gate` 잡의 체크아웃을 PR head로 바꾸지 마라. 이유: 마커 계약의 양쪽을 main에 묶어 둔 설계다(CLAUDE.md). 이 PR에서 gate 잡이 빨간불인 것은 정상이다 — PR head 워크플로우는 `--files`를 넘기는데 main의 `merge_gate.py`는 아직 그 인자를 모른다. 머지된 뒤부터 적용된다.
- 리뷰 잡(`review`)에 권한을 더하거나 gate와 합치지 마라. 이유: 리뷰 에이전트는 신뢰할 수 없는 diff를 읽는다.
- 라벨·draft 외의 탈출구를 만들지 마라. 이유: CLAUDE.md가 draft PR만 탈출구로 정했다.
- 기존 테스트를 깨뜨리지 마라
