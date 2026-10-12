begin;

-- 합계는 청구월·카테고리 단위로 DB에서만 계산합니다. NULL 카테고리도 한 묶음입니다.
-- 숫자를 문자열로 반환해 JSON 파싱 단계의 bigint 정밀도 손실을 피합니다.
create function public.analytics_monthly_summaries(
  p_user_id uuid, p_start_month date, p_end_month date
)
returns table (month text, "totalKrw" text, "byCategory" jsonb)
language sql
stable
security invoker
set search_path = ''
as $$
  with category_totals as (
    select t.accounting_month, t.category,
      sum(case t.kind when 'expense' then t.amount_krw when 'refund' then -t.amount_krw else 0 end) as net_krw,
      count(*) as transaction_count
    from public.transactions t
    where t.user_id = p_user_id
      and p_user_id = (select auth.uid())
      and t.accounting_month >= p_start_month
      and t.accounting_month < p_end_month
      and t.kind in ('expense', 'refund')
    group by t.accounting_month, t.category
  )
  select to_char(accounting_month, 'YYYY-MM'), sum(net_krw)::text,
    jsonb_agg(jsonb_build_object(
      'category', category, 'amountKrw', net_krw::text, 'count', transaction_count::text
    ) order by category collate "C" nulls last)
  from category_totals
  group by accounting_month
  order by accounting_month;
$$;

-- 짝수 표본의 두 중앙 금액은 정확한 numeric 평균을 원 단위로 반올림합니다.
-- 1~2건인 카테고리는 이상치 판단 근거로 쓰지 않습니다.
create function public.analytics_category_medians(p_user_id uuid)
returns table (category text, "medianKrw" text)
language sql
stable
security invoker
set search_path = ''
as $$
  with ranked as (
    select t.category, t.amount_krw,
      row_number() over (partition by t.category order by t.amount_krw) as position,
      count(*) over (partition by t.category) as sample_count
    from public.transactions t
    where t.user_id = p_user_id
      and p_user_id = (select auth.uid())
      and t.kind = 'expense'
      and t.category is not null
  )
  select category, round(avg(amount_krw))::text
  from ranked
  where sample_count >= 3
    and position in ((sample_count + 1) / 2, (sample_count + 2) / 2)
  group by category
  order by category collate "C";
$$;

revoke all on function public.analytics_monthly_summaries(uuid, date, date) from public, anon;
revoke all on function public.analytics_category_medians(uuid) from public, anon;
grant execute on function public.analytics_monthly_summaries(uuid, date, date) to authenticated;
grant execute on function public.analytics_category_medians(uuid) to authenticated;

commit;
