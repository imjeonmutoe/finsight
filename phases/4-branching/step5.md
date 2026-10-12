# Step 5: docs-rules

## 배경

이 phase의 step 0~4가 Supabase Branching을 위한 코드를 준비했다: 마이그레이션 파일명을 원격 버전에 맞추고,
`supabase/config.toml`·`supabase/seed.sql`(데모 데이터셋 기반, Free·Pro 테스트 계정), 프리뷰 전용 비밀번호 로그인,
`supabase/`를 건드린 PR의 자동 머지 금지 게이트를 만들었다. 이 step은 결정과 새 규칙을 문서에 옮긴다.

기존 규칙 "마이그레이션은 사람이 CLI나 대시보드로 적용한다"는 Branching 연동의 "Deploy to production"이 켜지면 더는
사실이 아니다. 머지하면 Supabase가 적용한다. 규칙이 막던 위험(사람이 보지 않은 변경이 실데이터에 들어감)은
"`supabase/` PR은 사람이 머지한다"로 옮겨 막는다.

## 읽어야 할 파일

- `/CLAUDE.md`, `/AGENTS.md` — 두 파일은 같은 규칙을 담는다. **반드시 둘 다 같은 내용으로 고친다**
- `/docs/ADR.md` — 형식과 마지막 번호(ADR-015)
- `/docs/ARCHITECTURE.md` — 디렉토리 트리
- 이전 step 산출물: `supabase/config.toml`, `supabase/seed.sql`, `src/lib/demo/seed-sql.ts`, `src/lib/preview-accounts.ts`,
  `src/app/login/actions.ts`, `scripts/merge_gate.py`, `.github/workflows/review-code.yml`
- `phases/4-branching/index.json` — 이전 step들의 `summary` (특히 step 1의 Vercel 환경변수 이름 비교 결과)

## 작업

### 1. `docs/ADR.md` — ADR-016 추가

`### ADR-016: Supabase Branching으로 PR마다 프리뷰 DB를 띄우고, DB 변경 PR은 사람이 머지한다`

기존 ADR 형식(결정·이유·트레이드오프)을 따른다. 담을 내용:
- Pro 플랜, GitHub 연동, PR마다 프리뷰 브랜치(머지·닫힘 시 삭제), Supabase–Vercel 연동으로 프리뷰 앱과 한 쌍
- 시드는 데모 데이터셋(샘플 대시보드와 같은 숫자), 실데이터는 복사하지 않는다
- 프리뷰 로그인은 `VERCEL_ENV=preview`에서만 열리는 테스트 계정 비밀번호 로그인. 이유: 브랜치마다 Supabase 콜백 주소가 바뀌어 Google OAuth를 등록할 수 없다
- Polar 결제 흐름은 프리뷰에서 검증하지 않는다. 플랜별 화면은 시드 Pro 계정으로 본다
- `supabase/` 변경 PR은 게이트가 승인만 하고 사람이 머지한다. 머지가 곧 프로덕션 적용
- 대안과 버린 이유: 영구 스테이징 브랜치(상시 과금), Free 유지 + 로컬 스택(PR마다 자동이 아님), 완전 자동 머지(실데이터)
- 마이그레이션 파일명을 14자리 타임스탬프로 바꾼 이유

### 2. `CLAUDE.md`와 `AGENTS.md` — 같은 내용으로

- "에이전트는 프로덕션 DB에 쓰지 않는다" CRITICAL 규칙: "마이그레이션은 사람이 CLI나 대시보드로 적용한다"를
  "마이그레이션은 사람이 `supabase/`를 건드린 PR을 머지할 때 Supabase GitHub 연동이 적용한다"로 바꾼다.
  `read_only=true`·`permissions.deny`(브랜치 쓰기 도구 포함) 유지 문장은 그대로 둔다
- 새 CRITICAL 규칙 추가:
  - 마이그레이션 파일명은 `<UTC YYYYMMDDHHMMSS>_<snake_case>.sql`이고, 이미 적용된 파일은 이름도 내용도 바꾸지 않는다. 이유: 원격 `schema_migrations`의 버전과 대조된다
  - `supabase/config.toml`에 `[storage.buckets]`·`[functions]`를 선언하지 않는다. 이유: 머지하면 프로덕션에 배포된다
  - `supabase/seed.sql`은 `src/lib/demo/seed-sql.ts`가 생성한다. 손으로 고치지 않는다. 실데이터를 넣지 않는다
  - 프리뷰 로그인은 서버에서 `VERCEL_ENV === "preview"`일 때만 동작한다. 판정을 `NEXT_PUBLIC_*`·호스트로 바꾸지 않는다
- `### 자동 승인·머지 게이트` 표 아래에 한 줄: `supabase/`(옛 경로 포함)를 건드린 PR은 nit만 있어도 **승인만** 한다. `--files` 목록을 못 받으면 머지하지 않는다
- 기술 스택 목록의 Supabase 줄에 `Branching(GitHub 연동, PR별 프리뷰)`을 덧붙인다

### 3. `docs/ARCHITECTURE.md`

디렉토리 트리의 `supabase/` 아래에 `config.toml`(프리뷰 브랜치 설정)과 `seed.sql`(자동 생성, 프리뷰 전용)을 추가한다.

### 4. 사람이 할 설정 — `docs/ADR.md`의 ADR-016 끝에 체크리스트로

에이전트가 할 수 없는 작업이다. 순서가 중요하다 — **이 phase의 PR이 머지된 뒤에** 한다:
1. Supabase 조직을 Pro로 올린다
2. Supabase 대시보드 → Integrations → GitHub: 리포 연결, Working directory `.`, "Deploy to production" 켜기
3. Supabase–Vercel 연동 설치. step 1이 보고한 환경변수 이름 차이가 있으면 여기서 맞추는 방법을 적는다
4. 아무 PR이나 열어 첫 프리뷰 브랜치의 로그에서 마이그레이션 8개와 시드가 통과하는지 확인한다.
   마이그레이션에 `begin; … commit;`이 직접 들어 있어 여기서 처음 실패할 수 있다
5. 리포 설정 "Allow GitHub Actions to create and approve pull requests"가 켜져 있는지 확인한다

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
diff <(sed -n '/^## 아키텍처 규칙/,/^## 개발 프로세스/p' CLAUDE.md) <(sed -n '/^## 아키텍처 규칙/,/^## 개발 프로세스/p' AGENTS.md)   # 차이가 없어야 한다
```

AGENTS.md의 섹션 제목이 CLAUDE.md와 다르면 위 diff를 해당 제목에 맞춰 돌리고, 아키텍처 규칙 본문이 같은지 확인한다.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 문서가 실제 코드와 맞는지 대조한다: 파일 경로·함수 이름·인자 이름(`--files`, `isPreviewDeployment`, `buildSeedSql`)이 이전 step 산출물과 같은가?
3. 결과에 따라 `phases/4-branching/index.json`의 step 5를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`

## 금지사항

- CLAUDE.md와 AGENTS.md 중 한쪽만 고치지 마라. 이유: 에이전트마다 다른 규칙으로 움직인다.
- `.mcp.json`의 `read_only=true`와 `.claude/settings.json`의 `permissions.deny`를 고치지 마라. 이유: Branching이 들어와도 에이전트는 브랜치를 만들거나 머지하지 않는다. 브랜치는 GitHub 연동이 PR에 맞춰 관리한다.
- 코드 파일을 고치지 마라. 이유: 이 step은 문서만 다룬다. 문서와 코드가 다르면 코드가 아니라 문서를 맞춘다. 코드 버그로 보이면 `error_message`에 적는다.
- 기존 테스트를 깨뜨리지 마라
