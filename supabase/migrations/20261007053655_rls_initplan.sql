-- get_advisors 성능 지적 auth_rls_initplan(0003)을 고칩니다.
--
-- 정책 식에 auth.uid()를 그대로 쓰면 Postgres가 행마다 함수를 다시 부릅니다.
-- (select auth.uid())로 감싸면 InitPlan이 되어 쿼리당 한 번만 계산합니다. 반환값이 같으므로
-- 정책이 허용하는 행은 바뀌지 않습니다. 0002·0003의 함수는 이미 이 형태입니다.
--
-- drop+create 대신 alter policy를 씁니다. 명령(for)·역할(to)은 그대로 두고 식만 바꾸므로
-- 정책이 없는 틈이 생기지 않습니다. SELECT 전용 정책(profiles·insight_cache)에는
-- with check를 붙이지 않습니다.
--
-- storage.objects의 statements_own은 같은 형태지만 이번 범위에서 뺐습니다.

begin;

alter policy profiles_select_own on public.profiles
  using ((select auth.uid()) = id);

alter policy financial_sources_own on public.financial_sources
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy uploads_own on public.uploads
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy transactions_own on public.transactions
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy merchant_rules_own on public.merchant_rules
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy insight_cache_select_own on public.insight_cache
  using ((select auth.uid()) = user_id);

commit;
