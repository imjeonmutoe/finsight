# Step 0: staging-workflow

## 배경

phase `4-branching`은 Supabase Branching(Pro 플랜)을 전제로 마이그레이션 파일명 정렬·`supabase/config.toml`·
`supabase/seed.sql`·프리뷰 전용 로그인·`supabase/` PR 자동 머지 금지 게이트를 만들었다. 그런데 Pro 비용 때문에
**Branching을 쓰지 않기로 바꿨다.** 대신 Free 조직의 두 번째 프로젝트 `finsight-staging`을 프리뷰용 DB로 둔다.

- Vercel **Preview** 환경변수는 언제나 스테이징을 가리킨다 (사람이 설정한다. 이 step의 범위 밖)
- 이 step은 스테이징을 **초기화 → 마이그레이션 → 시드** 순서로 다시 만드는 GitHub Actions 워크플로우를 만든다
- 프로덕션 마이그레이션은 지금처럼 사람이 CLI·대시보드로 적용한다. CI는 프로덕션에 절대 붙지 않는다
- CI에 두는 비밀은 스테이징 DB 접속 문자열 `STAGING_DB_URL` **하나뿐**이다. Supabase 개인 액세스 토큰은 두지 않는다 —
  계정의 모든 프로젝트(실데이터가 든 프로덕션 포함)를 다룰 수 있기 때문이다

## 읽어야 할 파일

- `/CLAUDE.md` — `### CI에 이미 물려 있는 것`(액션 SHA 고정, fork PR 처리, 설치 바이너리 고정 이유), CRITICAL "에이전트는 프로덕션 DB에 쓰지 않는다"
- `/docs/ADR.md` — ADR-016
- `.github/workflows/review-code.yml`, `.github/workflows/owasp-scan.yml` — 액션을 커밋 SHA로 고정하는 방식, fork PR 거르는 `if`, 주석 스타일
- `supabase/config.toml` — `[db.seed]`(시드 경로), `[db] major_version`
- `supabase/seed.sql`, `supabase/migrations/` — 워크플로우가 적용할 파일
- `scripts/test_*.py` — 하네스 스크립트 테스트 관례

## 작업

### 1. 테스트 먼저 — `scripts/test_staging_workflow.py`

워크플로우 YAML의 불변식을 고정한다. PyYAML이 없으면 `uv run --with pyyaml --with pytest`로 돌 수 있게 쓰되,
기존 `uv run --with pytest python -m pytest scripts/ -q` 커맨드로도 실패하지 않게 한다(PyYAML이 없을 때 텍스트 검사로
대체하거나 `pytest.importorskip`을 쓰지 말고 텍스트 검사로 확인한다 — 건너뛴 테스트는 지키지 못한 테스트다).

- 트리거: `pull_request`(`supabase/**` 경로), `push`의 `main`(`supabase/**` 경로), `workflow_dispatch`
- 같은 저장소 PR에서만 돈다(fork PR은 시크릿이 없으니 `if`로 거른다)
- `concurrency` 그룹이 고정 문자열이고 `cancel-in-progress: false`다 (스테이징은 하나이므로 실행을 직렬로)
- 참조하는 시크릿이 `STAGING_DB_URL` 하나뿐이다 (`secrets.` 참조를 전부 모아 집합 비교)
- **프로덕션 ref `qqhffvdkgnmtusvfizhx`가 URL에 들어 있으면 초기화 전에 실패시키는 가드 스텝**이 초기화 스텝보다 앞에 있다
- `SUPABASE_ACCESS_TOKEN`·`supabase link`·`--linked`가 어디에도 없다
- 모든 `uses:`가 40자리 커밋 SHA로 고정돼 있다
- `permissions`가 `contents: read`뿐이다

### 2. `.github/workflows/staging-db.yml`

```yaml
name: staging-db
on: { pull_request: ..., push: ..., workflow_dispatch: {} }
permissions: { contents: read }
concurrency: { group: staging-db, cancel-in-progress: false }
jobs:
  reset:
    # 스텝: checkout → Supabase CLI 설치(버전 고정) → 프로덕션 ref 가드 → db reset → 결과 요약
```

- Supabase CLI는 `supabase/setup-cli` 액션을 **커밋 SHA로 고정**하고 `version`도 정확한 버전으로 고정한다.
  SHA와 버전은 `gh api`로 실제 태그를 조회해 확인한다. 추측한 SHA를 쓰지 마라
- 초기화 명령은 `supabase db reset --db-url "$STAGING_DB_URL"`을 기본으로 한다. 실행 전에 고정한 CLI 버전의
  `supabase db reset --help`(로컬에 CLI가 없으면 `npx supabase@<버전> db reset --help` 또는 공식 문서)로
  `--db-url`에서 마이그레이션과 `[db.seed]` 시드가 모두 적용되는지 확인한다. 시드가 적용되지 않으면
  초기화 뒤에 `psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql` 스텝을 더한다
- 가드 스텝: `STAGING_DB_URL`이 비어 있으면 실패, `qqhffvdkgnmtusvfizhx`를 포함하면 실패. 실패 메시지에 URL을 출력하지 않는다
- 비밀 값은 `env:`로만 넘기고 `${{ secrets.* }}`를 `run:` 문자열 안에 직접 박지 않는다 (review-code.yml과 같은 습관)
- 접속 문자열은 **Session pooler** 주소여야 한다는 것을 워크플로우 상단 주석에 적는다. 이유: Free의 Direct 연결은 IPv6 전용이고 GitHub 러너는 IPv6로 나가지 못한다
- 각 스텝 위에 "왜"를 한두 줄 주석으로 단다 (리포의 워크플로우 주석 스타일)

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
uv run --with pytest python -m pytest scripts/ -q
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 워크플로우를 실제로 돌려 보지는 못한다(시크릿은 사람이 넣는다). 대신 `grep -n "qqhffvdkgnmtusvfizhx" .github/workflows/staging-db.yml`이
   가드 스텝에서만 나오는지 눈으로 확인한다.
3. 아키텍처 체크리스트를 확인한다:
   - CI가 프로덕션 DB에 닿을 경로가 없는가? (액세스 토큰·`link`·프로덕션 URL 없음)
   - 액션이 전부 SHA로 고정돼 있는가?
4. 결과에 따라 `phases/5-staging/index.json`의 step 0을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 CLI 버전·setup-cli SHA·시드 적용 방식(reset 내장 / psql 별도)을 포함
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`

## 금지사항

- `SUPABASE_ACCESS_TOKEN`이나 `supabase link`를 쓰지 마라. 이유: 개인 액세스 토큰은 계정의 모든 프로젝트를 다룬다. PR 코드가 도는 잡에 두면 실데이터 DB까지 손이 닿는다.
- 프로덕션 접속 정보를 어떤 형태로도 워크플로우에 넣지 마라. 이유: 프로덕션 마이그레이션은 사람이 적용한다(이번 결정).
- 가드를 지우거나 초기화 스텝 뒤로 옮기지 마라. 이유: 시크릿을 잘못 넣으면 `db reset`이 실데이터를 지운다. 가드는 그 실수를 잡는 유일한 장치다.
- `cancel-in-progress: true`로 두지 마라. 이유: 초기화 도중 취소되면 스테이징이 반쯤 지워진 상태로 남는다.
- 원격 DB에 쓰는 명령을 로컬에서 실행하지 마라. 이유: 에이전트는 원격 DB에 쓰지 않는다. 스테이징도 마찬가지다.
- 기존 테스트를 깨뜨리지 마라
