# Step 2: seed-sql

## 배경

Supabase Branching의 프리뷰 브랜치는 **데이터 없이** 만들어지고, `supabase/config.toml`의 `[db.seed]`가 가리키는
`supabase/seed.sql`을 마이그레이션 다음에 실행한다. 시드는 **프로덕션에 머지할 때 실행되지 않는다**(Supabase 문서:
"Data changes in your seed files are not merged to production").

프리뷰 시드는 **샘플 대시보드(S0)의 데모 데이터셋을 그대로 쓴다.** 프리뷰 대시보드와 `/` 샘플 대시보드가 같은
숫자를 보여야 검증하기 쉽다. 실데이터는 절대 복사하지 않는다.

Polar 결제는 프리뷰에서 검증하지 않는다. 플랜별 화면을 보기 위해 시드에 **Free 사용자와 Pro 사용자를 하나씩**
넣는다. 두 계정은 step 3의 프리뷰 전용 비밀번호 로그인이 쓴다.

## 읽어야 할 파일

- `/CLAUDE.md` — CRITICAL 규칙(금액 정수, `kind` NOT NULL, 저장 금액은 절댓값, 카테고리 12개, 금융 데이터 로그 금지)
- `/docs/ARCHITECTURE.md` — 데이터 모델, 중복 판정 규약, `src/lib/demo/` 예외
- `supabase/migrations/20260916045636_init.sql` 이후 전체 — 테이블 컬럼, `handle_new_user` 트리거, `profiles` 권한, 업로드 상태와 `confirm_upload`
- `supabase/config.toml` — 이전 step 산출물. `[db.seed]` 경로
- `src/lib/demo/dataset.ts`, `src/lib/demo/sample-csv.ts` — `buildDemoDataset()`, `SAMPLE_CONTEXT`
- `src/lib/dedupe.ts` — 해시 계산
- 기존 테스트에서 `server-only` 모듈을 어떻게 다루는지 (`vitest.config.*`, `grep -rn "server-only" src`)

## 작업

### 1. 테스트 먼저 — `src/lib/demo/seed-sql.test.ts`

- `expect(buildSeedSql()).toMatchFileSnapshot("../../../supabase/seed.sql")` — 커밋된 `seed.sql`이 생성기 출력과 같아야 한다.
  `seed.sql`을 손으로 고치지 않는다. 다시 만들 때는 `npx vitest run src/lib/demo/seed-sql.test.ts -u`를 쓴다
- `buildDemoDataset().transactions`가 **두 사용자 모두에** 빠짐없이 들어 있다
- 거래 INSERT의 금액이 전부 0 이상 정수이고, `kind`가 전부 null이 아니며, 카테고리는 `CATEGORIES` 또는 null이다
- 이메일은 전부 `@finsight.test` 도메인이다(실제 도메인이 아님)
- 모든 INSERT에 `on conflict ... do nothing`이 있다(시드를 다시 돌려도 같은 결과)
- `begin`/`commit`이 없다(Branching이 시드를 한 트랜잭션으로 돌린다)

### 2. 프리뷰 계정 상수 — `src/lib/preview-accounts.ts`

```ts
export type PreviewAccount = { id: string; email: string; plan: "free" | "pro" };
export const PREVIEW_ACCOUNTS: readonly PreviewAccount[];   // Free 1개, Pro 1개, 고정 UUID
export const PREVIEW_PASSWORD: string;                      // 고정 값. 프리뷰 DB에만 존재하는 계정이다
```

- 이 파일은 step 3의 서버 액션과 이 step의 생성기가 같이 쓴다. **클라이언트 컴포넌트에서 import하지 않는다.**
  기존 리포 관례에 맞춰 `server-only`를 붙이고(테스트에서 이미 처리하는 방식이 있으면 그대로 따른다), 같은 디렉토리에
  `preview-accounts.test.ts`를 먼저 만든다(Free·Pro 각 1개, UUID 형식, `@finsight.test`).

### 3. 생성기 — `src/lib/demo/seed-sql.ts`

```ts
export function buildSeedSql(): string;   // 순수 함수. I/O 없음. 같은 입력이면 같은 문자열
```

- 파일 맨 위에 "자동 생성 — 손으로 고치지 마라. `src/lib/demo/seed-sql.ts`를 고치고 스냅샷을 갱신하라" 주석을 찍는다
- `auth.users`와 `auth.identities`에 두 계정을 만든다. 비밀번호는 `crypt(<PREVIEW_PASSWORD>, gen_salt('bf'))`, 이메일 확인 완료 상태
- `handle_new_user` 트리거가 `profiles`를 만든다. Pro 계정은 그 뒤에 `profiles`의 플랜과 만료일을 Pro로 `update`한다
  (시드는 postgres 역할로 돌므로 클라이언트 권한 철회와 무관하다)
- 사용자마다 출처 → 업로드(확정된 상태) → 거래 순서로 넣는다. 해시는 `src/lib/dedupe.ts`의 함수로 계산하고, 컬럼 값은
  데모 데이터셋에서 가져온다. 데모 쪽이 쓰는 매핑·분류 경로를 새로 만들지 말고 `buildDemoDataset()` 결과를 그대로 쓴다
- 문자열은 SQL 리터럴로 안전하게 이스케이프한다(작은따옴표 이중화). 가맹점명에 따옴표가 들어가도 깨지지 않는다는 테스트를 하나 둔다
- 이 함수는 `src/lib/demo/` 안에서만 쓰인다. `dataset.ts`의 비공개 함수를 export하지 않는다

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
test -f supabase/seed.sql
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. `seed.sql`이 실제로 적용되는지는 로컬에서 확인할 수 없다(Supabase CLI·Docker 없음). 대신 Supabase MCP
   `execute_sql`(읽기 전용)로 `information_schema.columns`를 조회해, 시드가 INSERT하는 모든 테이블·컬럼이 원격 스키마에
   존재하고 NOT NULL 컬럼이 전부 채워지는지 대조한다. 대조 결과를 `summary`에 한 줄로 남긴다.
3. 아키텍처 체크리스트를 확인한다:
   - 금액 정수·절댓값, `kind` NOT NULL, 카테고리 12개를 지키는가?
   - `PREVIEW_PASSWORD`가 클라이언트 번들로 갈 경로가 없는가?
4. 결과에 따라 `phases/4-branching/index.json`의 step 2를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`

## 금지사항

- 원격 DB의 실제 행을 읽어 시드에 넣지 마라. MCP로 조회하는 것은 스키마(`information_schema`)뿐이다. 이유: 실제 금융 데이터다.
- `seed.sql`을 손으로 고치지 마라. 이유: 생성기와 갈라지면 스냅샷 테스트가 깨지고, 데모 화면과 프리뷰 숫자도 갈라진다.
- 시드 SQL로 `insert`/`update` 외의 DDL(테이블·정책·권한 변경)을 하지 마라. 이유: 스키마는 마이그레이션의 몫이다. 시드에서 바꾸면 프리뷰 스키마가 프로덕션과 달라진다.
- 시드 내용을 `console.log`하지 마라. 이유: 가짜여도 금융 데이터 로깅 금지 규칙에 예외를 만들지 않는다.
- 기존 테스트를 깨뜨리지 마라
