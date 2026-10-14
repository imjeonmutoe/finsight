# Step 1: docs-rules

## 배경

phase `4-branching`(ADR-016)은 Supabase Branching(Pro)을 전제로 문서와 규칙을 고쳤다. Pro 비용 때문에 Branching을
쓰지 않기로 바꿨고, 대신:

- Free 조직의 두 번째 프로젝트 `finsight-staging`이 프리뷰 DB다. 합성 데이터(`supabase/seed.sql`)만 둔다
- Vercel **Preview** 환경변수는 언제나 스테이징을 가리킨다. 앱이 이미 쓰는 이름(`NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_ANON_KEY`·`SUPABASE_SERVICE_ROLE_KEY`)을 그대로 쓴다
- `.github/workflows/staging-db.yml`(이전 step)이 `supabase/`를 건드린 PR·main 푸시·수동 실행 때 스테이징을 초기화하고 마이그레이션·시드를 다시 넣는다. 비밀은 `STAGING_DB_URL` 하나다
- **프로덕션 마이그레이션은 사람이 CLI나 대시보드로 적용한다** (PR #26 이전 규칙으로 되돌림)
- 그대로 두는 것: 14자리 마이그레이션 파일명, `seed.sql` 생성기, 프리뷰 전용 로그인(`VERCEL_ENV=preview`), `supabase/` PR 자동 머지 금지 게이트

이 step은 문서·주석·규칙을 이 결정에 맞춘다.

## 읽어야 할 파일

- `/CLAUDE.md`, `/AGENTS.md` — 두 파일은 같은 규칙을 담는다. **반드시 둘 다 같은 내용으로 고친다**
- `/docs/ADR.md` — ADR-016 전체와 ADR 형식
- `/docs/ARCHITECTURE.md` — 디렉토리 트리의 `supabase/` 부분
- `.github/workflows/staging-db.yml`, `scripts/test_staging_workflow.py` — 이전 step 산출물
- `phases/5-staging/index.json` — step 0의 `summary`(CLI 버전, 시드 적용 방식)
- `supabase/config.toml`, `src/lib/supabase-config.test.ts`
- `scripts/merge_gate.py`(13행·44행 근처), `.github/workflows/review-code.yml`(222행 근처) — Branching을 이유로 든 주석

## 작업

### 1. `docs/ADR.md`

- ADR-016 제목 아래에 `**상태: ADR-017로 대체됨**` 한 줄을 넣는다. 본문은 지우지 않는다 (왜 시도했고 왜 접었는지가 기록이다)
- `### ADR-017: Branching 대신 무료 스테이징 프로젝트를 프리뷰 DB로 쓰고, 프로덕션 마이그레이션은 사람이 적용한다`
  - 결정·이유(Pro 월 요금 + 브랜치 컴퓨트 요금이 이 프로젝트 규모에 비해 크다)·트레이드오프(모든 PR이 스테이징 하나를 공유한다, 7일 동안 쓰지 않으면 일시정지되어 사람이 복구한다, 프로덕션 적용은 수동이다)
  - ADR-016에서 이어받는 것과 버리는 것을 표로 정리한다
  - CI가 액세스 토큰 없이 `STAGING_DB_URL`만 쓰는 이유, 프로덕션 ref 가드
  - **사람이 할 설정 체크리스트**:
    1. Supabase에서 `finsight-staging` 프로젝트 생성 (Free, 프로덕션과 같은 리전)
    2. 스테이징 Connect → **Session pooler** 접속 문자열을 GitHub 리포 시크릿 `STAGING_DB_URL`에 등록 (Direct는 IPv6 전용이라 GitHub 러너에서 붙지 않는다)
    3. Actions → `staging-db` → Run workflow로 첫 초기화. 로그에서 마이그레이션 8개와 시드 통과 확인 (마이그레이션의 `begin; … commit;`이 첫 실패 지점일 수 있다)
    4. 스테이징 Auth: 이메일 로그인 켜기, 가입 막기, Redirect URL에 `https://*-jpjeon87-9303s-projects.vercel.app/**` 추가 (`config.toml`은 원격에 자동 적용되지 않는다)
    5. Vercel → Settings → Environment Variables에서 **Preview** 범위의 Supabase 변수 3개를 스테이징 값으로 교체. 지금 Preview에 프로덕션 키가 있으면 프리뷰 앱이 실데이터 DB에 붙어 있는 것이다
    6. Supabase 대시보드의 GitHub·Vercel 연동은 켜지 않는다

### 2. `CLAUDE.md`와 `AGENTS.md` — 같은 내용으로

- 기술 스택의 Supabase 줄: `+ Branching(GitHub 연동, PR별 프리뷰) (ADR-016)` → `+ 프리뷰용 무료 스테이징 프로젝트 (ADR-017)`
- "에이전트는 프로덕션 DB에 쓰지 않는다" 규칙의 `마이그레이션은 사람이 \`supabase/\`를 건드린 PR을 머지할 때 Supabase GitHub 연동이 적용한다`를
  `마이그레이션은 사람이 CLI나 대시보드로 적용한다`로 되돌린다. 나머지 문장(`read_only`, deny, 이유)은 그대로
- 마이그레이션 파일명 규칙: 형식·불변 규칙은 유지하고, 이유를 "원격 `schema_migrations`의 버전과 대조된다(CLI `db push`·스테이징 초기화 모두)"로 고친다
- `config.toml`에 버킷·함수를 선언하지 말라는 CRITICAL 규칙은 **지운다** (이유였던 Branching 프로덕션 배포가 없어졌다). `src/lib/supabase-config.test.ts`의 해당 두 단언과 Branching을 언급한 메시지도 같이 지운다/고친다
- 새 CRITICAL 규칙: "CI는 스테이징에만 붙는다. 워크플로우 비밀은 `STAGING_DB_URL` 하나이고, Supabase 액세스 토큰·프로덕션 접속 정보를 CI에 두지 않는다. 이유: PR 코드가 도는 잡에서 실데이터 DB까지 손이 닿는다. `scripts/test_staging_workflow.py`가 고정한다"
- 게이트 표 아래 `supabase/` 문단의 이유를 "머지가 곧 프로덕션 적용이다(ADR-016)" → "마이그레이션 PR은 머지와 프로덕션 적용을 사람이 함께 한다. 머지만 되고 적용이 안 되면 앱 코드와 DB가 어긋난다(ADR-017)"로 고친다
- `## 명령어`의 하네스 테스트 목록은 그대로 두되, 스테이징 수동 초기화 방법(Actions → `staging-db` → Run workflow) 한 줄을 추가한다

### 3. 주석

- `supabase/config.toml` 맨 위 주석: Branching 설명을 "로컬 `supabase start`와 CLI가 읽는 설정. 원격(스테이징·프로덕션)에는 자동 적용되지 않으며, 스테이징 Auth는 대시보드에서 맞춘다(ADR-017)"로 고친다. 값은 바꾸지 않는다
- `scripts/merge_gate.py` docstring과 `DB_PATH_PREFIX` 주석, `review-code.yml`의 해당 주석: Branching 이유를 위 게이트 이유로 바꾼다. **코드 동작은 바꾸지 않는다**

### 4. `docs/ARCHITECTURE.md`

디렉토리 트리의 `config.toml`·`seed.sql` 설명에서 Branching을 스테이징으로 바꾼다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
uv run --with pytest python -m pytest scripts/ -q
diff <(sed -n '/^## 아키텍처 규칙/,/^## 개발 프로세스/p' CLAUDE.md) <(sed -n '/^## 아키텍처 규칙/,/^## 개발 프로세스/p' AGENTS.md)   # 차이가 없어야 한다
grep -rn "Branching" CLAUDE.md AGENTS.md supabase/config.toml scripts/merge_gate.py .github/workflows/review-code.yml src/lib/supabase-config.test.ts   # 결과가 비어야 한다 (ADR.md·phases는 기록이라 제외)
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 문서가 실제 코드와 맞는지 대조한다: 워크플로우 파일명·시크릿 이름·트리거가 `staging-db.yml`과 같은가?
3. 결과에 따라 `phases/5-staging/index.json`의 step 1을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`

## 금지사항

- CLAUDE.md와 AGENTS.md 중 한쪽만 고치지 마라. 이유: 에이전트마다 다른 규칙으로 움직인다.
- ADR-016 본문을 지우지 마라. 이유: 결정을 뒤집은 기록이 남아야 같은 시도를 반복하지 않는다.
- `merge_gate.py`의 판정 로직, `seed-sql.ts`, `preview-accounts.ts`, 로그인 코드를 고치지 마라. 이유: 이번 결정에서 그대로 두기로 한 것들이다. 이 step은 문서·주석·규칙만 다룬다.
- `.mcp.json`의 `read_only=true`와 `.claude/settings.json`의 `permissions.deny`를 고치지 마라. 이유: 스테이징이 생겨도 에이전트는 원격 DB에 쓰지 않는다.
- 기존 테스트를 깨뜨리지 마라
