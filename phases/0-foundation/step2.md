# Step 2: db-schema

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — `## 데이터 모델`(스키마·인덱스·불변 규칙), `## RLS`, `## 보안`
- `/docs/ADR.md` — ADR-002(카테고리 CHECK), ADR-004(원본 보관), ADR-008(삭제 CASCADE)
- 이전 step 산출물: `src/types/category.ts` (CHECK 제약에 들어갈 12개 목록의 단일 소스)

## 작업

`supabase/migrations/0001_init.sql` 하나를 작성한다. 테이블 6개 + 인덱스 + RLS + Storage 버킷/정책 + LLM 사용량·lease RPC.

### 테이블

`ARCHITECTURE.md`의 `## 데이터 모델` 블록을 그대로 구현한다. 요약:

- `profiles` — `id` PK가 `auth.users(id)` 참조, `plan`, `plan_expires_at`(nullable), `polar_customer_id`, `polar_subscription_id`, `plan_updated_at`
- `financial_sources` — 서버 생성 UUID, 사용자 FK, 별칭, `card/bank` 종류. 원본 계좌/카드번호는 저장하지 않는다
- `uploads` — `source_id`, 서버 계산 `file_hash`, `UNIQUE(user_id, source_id, file_hash)`, `status` CHECK, `column_mapping jsonb`, 카운트 컬럼들
- `transactions` — 금액 절댓값과 `kind`, `accounting_month`, 출처·업로드 복합 FK(CASCADE), `source_transaction_key`, `data_row_index`, `dedupe_hash`, `candidate_hash`, `UNIQUE(user_id, source_id, dedupe_hash)`
- `merchant_rules` — PK `(user_id, merchant_norm)`
- `llm_usage` — 사용자 PK, UTC 일/분 호출 카운터, lease 토큰·만료일. 클라이언트 쓰기 금지

**웹훅 이벤트 테이블은 만들지 않는다.** 핸들러가 `UPDATE profiles`만 하므로 재실행해도 결과가 같다(step 11 참조).

### CHECK 제약 — 반드시 넣는다

```sql
category text CHECK (category IS NULL OR category IN ( ...src/types/category.ts의 12개... ))
```

이게 ADR-002를 강제하는 마지막 방어선이다. LLM enum이 뚫려 `'식비 '`(후행 공백)가 와도 여기서 막힌다. 없으면 유령 카테고리가 추이 차트에 생기고, 발견 시점에는 이미 데이터가 오염돼 있다.

`category_source`, `plan`, `uploads.status`, `financial_sources.kind`, `transactions.kind`에도 CHECK를 건다. 금액·행 인덱스·카운터는 0 이상, 필수 필드는 NOT NULL, 청구월은 월 첫날로 제한한다. `category_source`는 미분류·수입·이체의 경우 NULL을 허용한다.

### 인덱스

```sql
(user_id, accounting_month)
(user_id, category)
(user_id, merchant_norm, occurred_on)   -- 구독 탐지 쿼리의 스캔 순서와 일치
(user_id, source_id, candidate_hash)
```

### RLS

모든 테이블에 `enable row level security`. `transactions`/`uploads`/`merchant_rules`/`financial_sources`는 `auth.uid() = user_id`와 쓰기 WITH CHECK를 적용한다. ARCHITECTURE의 복합 FK로 다른 사용자의 출처·업로드를 참조하지 못하게 한다.

**profiles는 authenticated의 자기 행 SELECT만 허용한다.** anon/authenticated의 INSERT·UPDATE·DELETE 권한을 철회하며 해당 쓰기 정책도 만들지 않는다. 플랜·만료일·Polar ID·갱신 시각은 웹훅 서버만 변경한다. 클라이언트 INSERT로 `plan='pro'` 행을 만드는 경로도 막는다. 전체 계정 삭제는 인증을 확인한 서버가 처리한다.

**llm_usage와 RPC:** 클라이언트의 카운터 쓰기·삭제를 금지한다. 사용자 행 잠금으로 lease 획득·토큰 조건부 해제 및 UTC 일/분 전환·호출 예약을 원자적으로 수행하는 RPC를 만든다. 하루 300회·분당 20회, lease 300초와 토큰 소유권을 DB에서 강제한다. 한도는 클라이언트/RPC 인자로 받지 않는다. PUBLIC/anon/authenticated의 EXECUTE를 철회하고 service role만 허용한다. `SECURITY DEFINER` 사용 시 search_path를 고정하고 스키마를 명시한다. 상세 동작은 ARCHITECTURE의 `## LLM 사용량 제한`이 기준이다.

### Storage

`statements` 버킷을 **private**으로 생성하고 `storage.objects`에 정책을 건다:

```sql
bucket_id = 'statements' AND (storage.foldername(name))[1] = auth.uid()::text
```

### profiles 자동 생성 트리거

`auth.users`에 행이 생기면 `profiles`에 고정 `plan='free'`로 한 행을 만든다. 사용자 metadata의 플랜·Polar ID는 복사하지 않는다. 트리거 함수 권한과 search_path를 제한한다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm test
```

**그리고 마이그레이션을 실제 Supabase 프로젝트에 적용한 뒤 아래를 실행한다. 결과가 비어야 통과다:**

```sql
select tablename from pg_tables
where schemaname = 'public' and rowsecurity = false;
```

위 쿼리는 정책의 정확성이나 쓰기 권한을 검증하지 않는다. 서로 다른 두 사용자 JWT로 Data API 통합 검증도 통과해야 한다(service role로 대체 금지):

- 다른 사용자의 거래/출처/업로드 조회·수정·참조 insert가 거부되는가
- 자기 profiles의 plan·만료일·Polar ID 변경 및 INSERT·DELETE가 거부되는가
- 일반 사용자의 llm_usage 수정·삭제와 RPC 직접 호출이 거부되는가
- 한도 직전 동시 예약이 일/분 상한을 넘지 않고, 같은 사용자의 lease를 둘이 획득할 수 없는가
- 만료 토큰의 예약·해제가 새 lease에 영향을 주지 않는가

CHECK 제약 확인:
```sql
-- 테스트 사용자 소유의 유효한 출처·업로드·거래를 먼저 준비한다.
-- 나머지 FK·NOT NULL 조건은 모두 만족한 상태에서 category만 허용 목록 밖으로 바꾼다.
-- SQLSTATE 23514 및 category CHECK 제약 이름으로 실패 원인을 확인한다.
```

## 검증 절차

1. 위 AC를 실행한다. **Supabase 연결이 필요하다.**
2. `NEXT_PUBLIC_SUPABASE_URL`이나 `SUPABASE_SERVICE_ROLE_KEY`가 없어서 마이그레이션을 적용할 수 없으면 → `"status": "blocked"`, `"blocked_reason": "Supabase 프로젝트 미생성 또는 .env.local에 키 없음. 필요한 키: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY"` 후 즉시 중단.
3. 아키텍처 체크리스트:
   - 도메인 테이블이 6개이고 출처·사용량 테이블이 있는가? (웹훅 이벤트 테이블은 없음)
   - 복합 FK와 출처별 중복 키, 거래 유형·금액 절댓값 제약이 있는가?
   - profiles 쓰기 및 사용량/RPC 권한 거부를 사용자 JWT로 검증했는가?
   - `category` CHECK의 12개가 `src/types/category.ts`와 **문자열까지 정확히 일치**하는가?
   - Storage 버킷이 private인가?
4. `phases/0-foundation/index.json`의 step 2를 업데이트한다.

## 금지사항

- RLS 없는 테이블을 만들지 마라. 이유: anon key로 전체 데이터가 읽힌다. 이건 설정 실수가 아니라 즉시 전면 유출이다.
- `category`에 Postgres enum 타입을 쓰지 마라. CHECK 제약을 써라. 이유: enum은 값 추가에 마이그레이션이 필요하고 롤백이 까다롭다. CHECK가 MVP에 맞다.
- 웹훅 이벤트 테이블을 만들지 마라. 이유: 핸들러가 멱등해서 필요 없다. 안 쓰는 테이블에도 RLS 정책을 관리해야 한다.
- Storage 버킷을 public으로 만들지 마라. 이유: 버킷 안에 계좌번호가 든 원본 CSV가 들어간다.
- 프로덕션에 시드 데이터를 넣지 마라. 권한·제약 검증에는 격리된 테스트 사용자/프로젝트의 합성 데이터를 사용하고 종료 후 정리한다.
