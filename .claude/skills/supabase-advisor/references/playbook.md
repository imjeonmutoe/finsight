# lint 플레이북

`get_advisors`가 돌려주는 lint `name`별로 분류(A 마이그레이션 · B 대시보드 · C 플랜 제약 · D 의도됨)와
고치는 법을 적는다. 여기 없는 lint를 만나면 remediation 문서를 읽고 분류한 뒤 이 표에 추가한다.

## 요약표

| lint | 범주 | 분류 | 한 줄 |
|---|---|---|---|
| `auth_rls_initplan` | 성능 | A | 정책의 `auth.uid()`를 `(select auth.uid())`로 감싼다 |
| `unindexed_foreign_keys` | 성능 | A | FK 컬럼 순서 그대로 인덱스를 만든다 |
| `duplicate_index` | 성능 | A | 같은 정의의 인덱스 하나를 지운다 (제약이 소유한 것은 남긴다) |
| `multiple_permissive_policies` | 성능 | A | 같은 역할·명령의 permissive 정책을 하나로 합친다 |
| `unused_index` | 성능 | D | 지우지 않는다. 사용자가 적으면 다 '미사용'이다 |
| `rls_disabled_in_public` | 보안 | A | RLS를 켜고 자기 행 정책을 단다 (CLAUDE.md CRITICAL) |
| `policy_exists_rls_disabled` | 보안 | A | 정책은 있는데 RLS가 꺼짐 → `enable row level security` |
| `rls_enabled_no_policy` | 보안 | D 또는 A | 서버 전용(service_role) 테이블이면 의도됨. 아니면 정책 추가 |
| `function_search_path_mutable` | 보안 | A | `set search_path = ''` 추가하고 본문을 스키마 한정 이름으로 |
| `security_definer_view` | 보안 | A | `with (security_invoker = true)` |
| `extension_in_public` | 보안 | A | 별도 스키마로 이동 — 의존 객체가 있으면 사용자와 상의 |
| `auth_leaked_password_protection` | 보안 | C (Free) / B (Pro+) | 아래 절 참고 |
| `auth_otp_long_expiry` | 보안 | B | Auth → Providers → Email에서 OTP 만료를 1시간 이하로 |
| `auth_insufficient_mfa_options` | 보안 | B | MFA 도입은 제품 결정이다. 사용자에게 묻는다 |

## A 레시피

### `auth_rls_initplan`

**원리.** `auth.uid()`를 그대로 쓰면 Postgres가 행마다 함수를 다시 부른다. `(select auth.uid())`로
감싸면 InitPlan이 되어 쿼리당 한 번만 계산한다. 결과값은 같으므로 **정책의 의미는 바뀌지 않는다.**
이 리포의 `0002`·`0003` 함수는 이미 이렇게 쓴다.

```sql
alter policy transactions_own on public.transactions
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
```

- `alter policy`는 `for`·`to`(명령·역할)를 바꾸지 않는다. 식만 바꾼다 — 그래서 drop+create보다 안전하다.
- `using`만 있는 정책(`profiles_select_own`·`insight_cache_select_own`)에는 `with check`를 **붙이지 마라.**
  SELECT 전용 정책이라 의미가 없고, 쓰기 경로가 열린 것처럼 읽힌다.
- `auth.jwt()`·`current_setting(...)`도 같은 방식으로 감싼다.
- advisor가 `public`만 보므로 `storage.objects` 정책은 **사각지대 쿼리**로 찾아서 같이 고친다.
  `auth.uid()::text`는 `(select auth.uid())::text`가 된다.

**하지 말 것.** 정책을 지우고 다시 만드는 것(틈이 생긴다), 식을 단순화하는 것(예: `bucket_id` 조건 빼기).

### `unindexed_foreign_keys`

**원리.** FK가 가리키는 쪽 행을 지우거나 키를 바꾸면 Postgres가 참조하는 쪽을 찾는다. 인덱스가 없으면
풀스캔이 된다. `on delete cascade`면 삭제할 때마다 그 비용이 든다.

```sql
create index <table>_<cols>_idx on public.<table> (<FK 컬럼, 제약에 적힌 순서 그대로>);
```

- 컬럼 순서는 lint의 `metadata.fkey_columns`가 아니라 **제약 정의**(`pg_get_constraintdef`)의 순서를 따른다.
- 이미 있는 인덱스가 그 컬럼들을 **앞쪽 접두사로** 갖고 있으면 lint가 뜨지 않았을 것이다. 뜬 이상 새로 만든다.
  단, 기존 인덱스의 앞 컬럼에 마지막 컬럼만 더하면 되는 경우는 확장을 제안할 수 있다 — 사용자와 상의.
- **잠금.** 일반 `create index`는 생성하는 동안 그 테이블 쓰기를 막는다. 행 수를 세서 사용자에게 알린다.
  10만 행을 넘으면 `create index concurrently`를 써야 하는데, 이건 트랜잭션 안에서 못 돈다 —
  별도 마이그레이션으로 나누고 `begin/commit`을 빼야 하므로 사용자와 상의한다.

## C — 플랜 제약

### `auth_leaked_password_protection`

HaveIBeenPwned 대조로 유출된 비밀번호를 거절한다. 문서
(https://supabase.com/docs/guides/auth/password-security) 원문:
"Leaked password protection is available on the Pro Plan and above."

- Free → **C**. 보류 사유에 위 문장을 인용한다. 같은 실행에서 다시 제안하지 않는다.
- Pro 이상 → **B**. Dashboard → Authentication → Providers → Email → "Prevent use of leaked passwords".
- Free에서도 할 수 있는 것: 같은 화면에서 **최소 길이 8 이상·문자 종류 요구**는 켤 수 있다. 대안으로 안내한다.

## D — 의도됨

### `unused_index`

통계는 실제 쿼리가 돌아야 쌓인다. 사용자가 적은 DB에서는 대시보드 집계용 인덱스
(`transactions_user_month_idx` 등)도 '미사용'으로 나온다. 지우지 않는다. 보류 사유: "트래픽 부족으로 판정 불가".

### `rls_enabled_no_policy`

RLS를 켜고 정책을 안 둔 것은 "authenticated는 아무것도 못 한다"는 뜻이다. service_role 전용
테이블이면 의도된 것이다. 정책을 추가하기 전에 그 테이블을 클라이언트가 읽어야 하는지 `src/`에서 확인한다.

## 쿼리

### 사각지대 — 감싸지 않은 auth 호출이 있는 정책 (모든 스키마)

```sql
select schemaname, tablename, policyname
from pg_policies
where regexp_replace(
        coalesce(qual, '') || ' ' || coalesce(with_check, ''),
        '\(\s*SELECT\s+(auth\.\w+\(\)|current_setting\([^)]*\))[^)]*\)', '', 'gi'
      ) ~* '(auth\.\w+\(\)|current_setting\()'
order by 1, 2, 3;
```

감싼 호출(`( SELECT auth.uid() AS uid)`)을 지운 뒤에도 auth 호출이 남으면 행마다 다시 계산된다.
advisor 결과와 비교해서 **advisor에 없는 것**(대개 `storage`)을 지적에 더한다.

### 정책 대조 — 적용 전후

```sql
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
order by 1, 2, 3;
```

적용 **전에** 한 번 떠 두고, 적용 후 다시 떠서 비교한다. `cmd`·`roles`가 같고, `qual`·`with_check`가
`auth.uid()` → `( SELECT auth.uid() AS uid)`만 다르면 통과. 그 외 차이가 있으면 실패다.
