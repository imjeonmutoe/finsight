# Step 0: migration-rename

## 배경

이 phase는 Supabase Branching(GitHub 연동, PR마다 프리뷰 DB)을 도입한다. Branching은 `supabase/migrations/`의
파일 버전(파일명 앞의 숫자)을 원격 `supabase_migrations.schema_migrations`의 `version`과 비교해 "아직 적용되지
않은 마이그레이션"을 고른다.

지금 로컬 파일은 `0001_init.sql` ~ `0008_…sql`인데, 원격 이력은 MCP `apply_migration`이 찍은 14자리 타임스탬프다.
이대로 연동을 켜면 원격은 로컬 버전 `0001`~`0008`을 미적용으로 보고 이미 실데이터에 적용된 마이그레이션을
다시 돌리려 한다. 이 step은 로컬 파일명을 원격 이력에 맞춘다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` — CRITICAL 규칙, 특히 "에이전트는 프로덕션 DB에 쓰지 않는다"
- `/docs/ARCHITECTURE.md` — 디렉토리 구조, 205행 근처의 `0002_analytics.sql` 언급
- `/.claude/skills/supabase-advisor/SKILL.md` — 72행 근처의 마이그레이션 파일명 규칙
- `src/lib/migration-sql.test.ts`, `src/lib/queries.test.ts`, `src/lib/demo/dataset.test.ts` — 파일 경로를 하드코딩한 테스트

## 작업

### 1. 파일명 변경 — `git mv`로만

원격 이력(2026-10-12 MCP `list_migrations`로 확인)과 정확히 이 대응으로 바꾼다:

| 지금 | 바꿀 이름 |
|---|---|
| `0001_init.sql` | `20260916045636_init.sql` |
| `0002_analytics.sql` | `20260916045651_analytics.sql` |
| `0003_upload_confirm.sql` | `20260916084517_upload_confirm.sql` |
| `0004_upload_column_grants.sql` | `20261001070154_upload_column_grants.sql` |
| `0005_rls_initplan.sql` | `20261007053655_rls_initplan.sql` |
| `0006_statements_size_limit.sql` | `20261007063340_statements_size_limit.sql` |
| `0007_close_client_cost_paths.sql` | `20261007064500_close_client_cost_paths.sql` |
| `0008_keep_count_after_upload_delete.sql` | `20261007082023_keep_count_after_upload_delete.sql` |

작업 전에 Supabase MCP `list_migrations`(읽기 전용)로 원격 이력이 위 표와 같은지 다시 확인한다. 다르면 고치지 말고
`blocked`로 두고 차이를 `blocked_reason`에 적는다.

### 2. 회귀 테스트 — 먼저 쓴다

`src/lib/migration-files.test.ts`를 만든다. `supabase/migrations/`를 읽어:

- 모든 `.sql` 파일명이 `^\d{14}_[a-z0-9_]+\.sql$`인지
- 버전이 중복 없이 오름차순인지
- 위 표의 8개 `(version, name)` 쌍이 앞에서부터 그대로 들어 있는지 (9번째 이후 파일은 허용)

를 확인한다. 실패 메시지는 한국어로, "원격 schema_migrations와 버전이 어긋나면 Branching이 마이그레이션을 다시
돌린다"는 이유를 담는다.

### 3. 참조 갱신

- 테스트의 하드코딩 경로 7곳(`migration-sql.test.ts` 5곳, `queries.test.ts` 1곳, `dataset.test.ts` 1곳)
- `docs/ARCHITECTURE.md`의 `0002_analytics.sql` 언급
- `.claude/skills/supabase-advisor/SKILL.md`의 `<다음 번호>_<snake_case>.sql` 규칙 → `<YYYYMMDDHHMMSS>_<snake_case>.sql`
  (UTC 14자리 타임스탬프. `supabase migration new`와 MCP `apply_migration`이 쓰는 형식)

`grep -rn "000[1-8]_" src docs .claude scripts`의 결과가 비어야 한다. (`.claude/skills/owasp-scan/scripts/test_scan.py`의
`supabase/migrations/0001.sql`은 임시 디렉터리 fixture라 실제 파일과 무관하다 — 건드리지 않는다.)

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
git diff --cached -M --stat main -- supabase/migrations   # 8개 모두 rename 100%로 보여야 한다
```

## 검증 절차

1. 위 AC 커맨드를 실행한다. rename 유사도가 100%가 아닌 파일이 있으면 내용이 바뀐 것이다 — 되돌린다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/4-branching/index.json`의 step 0을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 원격 이력이 표와 다름 → `"status": "blocked"`, `"blocked_reason": "차이 내용"` 후 즉시 중단

## 금지사항

- 마이그레이션 파일의 **내용**을 한 글자도 바꾸지 마라(공백·주석 포함). 이유: 원격에는 이 내용이 이미 적용됐고, 프리뷰 브랜치는 이 파일을 처음부터 돌려 스키마를 만든다. 내용이 바뀌면 프리뷰와 프로덕션 스키마가 갈라진다.
- `apply_migration`이나 원격에 쓰는 어떤 도구도 호출하지 마라. 이유: 이 step은 로컬 파일명만 맞춘다. 원격 이력은 이미 맞다.
- 원격 이력을 로컬에 맞추려고 `schema_migrations`를 고치는 방향으로 가지 마라. 이유: 실데이터 DB다. 바뀌어야 할 쪽은 로컬이다.
- 기존 테스트를 깨뜨리지 마라
