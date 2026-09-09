# Step 2: db-schema

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — `## 데이터 모델`(스키마·인덱스·불변 규칙), `## RLS`, `## 보안`
- `/docs/ADR.md` — ADR-002(카테고리 CHECK), ADR-004(원본 보관), ADR-008(삭제 CASCADE)
- 이전 step 산출물: `src/types/category.ts` (CHECK 제약에 들어갈 12개 목록의 단일 소스)

## 작업

`supabase/migrations/0001_init.sql` 하나를 작성한다. 테이블 4개 + 인덱스 + RLS + Storage 버킷/정책.

### 테이블

`ARCHITECTURE.md`의 `## 데이터 모델` 블록을 그대로 구현한다. 요약:

- `profiles` — `id` PK가 `auth.users(id)` 참조, `plan`, `plan_expires_at`(nullable), `polar_customer_id`, `polar_subscription_id`, `plan_updated_at`
- `uploads` — `status` CHECK, `column_mapping jsonb`, 카운트 컬럼들
- `transactions` — `amount_krw bigint`, `occurrence_index integer not null default 0`, `dedupe_hash`, `UNIQUE(user_id, dedupe_hash)`, `upload_id ... ON DELETE CASCADE`
- `merchant_rules` — PK `(user_id, merchant_norm)`

**웹훅 이벤트 테이블은 만들지 않는다.** 핸들러가 `UPDATE profiles`만 하므로 재실행해도 결과가 같다(step 11 참조).

### CHECK 제약 — 반드시 넣는다

```sql
category text CHECK (category IS NULL OR category IN ( ...src/types/category.ts의 12개... ))
```

이게 ADR-002를 강제하는 마지막 방어선이다. LLM enum이 뚫려 `'식비 '`(후행 공백)가 와도 여기서 막힌다. 없으면 유령 카테고리가 추이 차트에 생기고, 발견 시점에는 이미 데이터가 오염돼 있다.

`category_source`, `plan`, `uploads.status`에도 CHECK를 건다.

### 인덱스

```sql
(user_id, occurred_on)
(user_id, category)
(user_id, merchant_norm, occurred_on)   -- 구독 탐지 쿼리의 스캔 순서와 일치
```

### RLS

모든 테이블에 `enable row level security`. 정책은 `transactions`/`uploads`/`merchant_rules`가 `auth.uid() = user_id`, `profiles`가 `auth.uid() = id`. select/insert/update/delete 전부 커버한다.

### Storage

`statements` 버킷을 **private**으로 생성하고 `storage.objects`에 정책을 건다:

```sql
bucket_id = 'statements' AND (storage.foldername(name))[1] = auth.uid()::text
```

### profiles 자동 생성 트리거

`auth.users`에 행이 생기면 `profiles`에 `plan='free'`로 한 행을 만드는 트리거를 넣는다. 이게 없으면 step 3의 콜백 핸들러가 매번 존재 확인을 해야 한다.

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

anon key는 공개돼도 되는 키이고 유일한 방어선이 RLS다. 테이블 하나에 RLS를 빠뜨리면 그 테이블은 인터넷에 공개된 것과 같다. **이 쿼리 결과가 비어야만 이 step이 완료다.**

CHECK 제약 확인:
```sql
insert into transactions (user_id, upload_id, occurred_on, merchant_raw, merchant_norm,
                          amount_krw, category, dedupe_hash)
values (auth.uid(), null, '2026-01-01', 'x', 'x', 1000, '존재하지않는카테고리', 'testhash');
-- 반드시 실패해야 한다
```

## 검증 절차

1. 위 AC를 실행한다. **Supabase 연결이 필요하다.**
2. `NEXT_PUBLIC_SUPABASE_URL`이나 `SUPABASE_SERVICE_ROLE_KEY`가 없어서 마이그레이션을 적용할 수 없으면 → `"status": "blocked"`, `"blocked_reason": "Supabase 프로젝트 미생성 또는 .env.local에 키 없음. 필요한 키: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY"` 후 즉시 중단.
3. 아키텍처 체크리스트:
   - 테이블이 정확히 4개인가? (이벤트 테이블을 만들지 않았는가)
   - `transactions.occurrence_index`가 있는가?
   - `category` CHECK의 12개가 `src/types/category.ts`와 **문자열까지 정확히 일치**하는가?
   - Storage 버킷이 private인가?
4. `phases/0-mvp/index.json`의 step 2를 업데이트한다.

## 금지사항

- RLS 없는 테이블을 만들지 마라. 이유: anon key로 전체 데이터가 읽힌다. 이건 설정 실수가 아니라 즉시 전면 유출이다.
- `category`에 Postgres enum 타입을 쓰지 마라. CHECK 제약을 써라. 이유: enum은 값 추가에 마이그레이션이 필요하고 롤백이 까다롭다. CHECK가 MVP에 맞다.
- 웹훅 이벤트 테이블을 만들지 마라. 이유: 핸들러가 멱등해서 필요 없다. 안 쓰는 테이블에도 RLS 정책을 관리해야 한다.
- Storage 버킷을 public으로 만들지 마라. 이유: 버킷 안에 계좌번호가 든 원본 CSV가 들어간다.
- 시드 데이터나 샘플 행을 넣지 마라. 이유: 요청받지 않았고, 실제 사용자 데이터와 섞이면 집계가 틀어진다.
