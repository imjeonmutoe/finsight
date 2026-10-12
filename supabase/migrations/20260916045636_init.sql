begin;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  plan_expires_at timestamptz,
  polar_customer_id text,
  polar_subscription_id text,
  plan_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.financial_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null,
  kind text not null check (kind in ('card', 'bank')),
  created_at timestamptz not null default now(),
  unique (user_id, id)
);

create table public.uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_id uuid not null,
  file_hash text not null,
  filename text not null,
  storage_path text not null,
  byte_size integer not null check (byte_size >= 0),
  -- pending 행은 인코딩 감지·매핑 추론보다 먼저 생성됩니다.
  encoding text check (encoding in ('utf-8', 'euc-kr')),
  column_mapping jsonb,
  mapping_confidence numeric check (mapping_confidence between 0 and 1),
  import_context jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'mapped', 'parsed', 'failed')),
  row_count integer not null default 0 check (row_count >= 0),
  inserted_count integer not null default 0 check (inserted_count >= 0),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  unclassified_count integer not null default 0 check (unclassified_count >= 0),
  error_message text,
  created_at timestamptz not null default now(),
  unique (user_id, source_id, file_hash),
  unique (user_id, source_id, id),
  foreign key (user_id, source_id)
    references public.financial_sources (user_id, id)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_id uuid not null,
  upload_id uuid not null,
  occurred_on date not null,
  accounting_month date not null check (extract(day from accounting_month) = 1),
  merchant_raw text not null,
  merchant_norm text not null,
  amount_krw bigint not null check (amount_krw >= 0),
  kind text not null check (kind in ('expense', 'income', 'refund', 'transfer')),
  -- src/types/category.ts의 CATEGORIES와 문자열까지 일치해야 합니다.
  category text check (category is null or category in (
    '식비', '카페/간식', '배달', '교통', '주거/통신', '구독/멤버십',
    '쇼핑', '의료/건강', '문화/여가', '교육', '금융/이체', '기타'
  )),
  category_source text check (category_source is null or category_source in ('ai', 'rule', 'user')),
  source_transaction_key text,
  data_row_index integer not null check (data_row_index >= 0),
  dedupe_hash text not null,
  candidate_hash text not null,
  unique (user_id, source_id, dedupe_hash),
  -- 소유자·출처·업로드가 함께 일치해야 합니다. 원본은 서버가 먼저 삭제합니다.
  foreign key (user_id, source_id, upload_id)
    references public.uploads (user_id, source_id, id) on delete cascade
);

create table public.merchant_rules (
  user_id uuid not null references auth.users (id) on delete cascade,
  merchant_norm text not null,
  category text not null check (category in (
    '식비', '카페/간식', '배달', '교통', '주거/통신', '구독/멤버십',
    '쇼핑', '의료/건강', '문화/여가', '교육', '금융/이체', '기타'
  )),
  updated_at timestamptz not null default now(),
  primary key (user_id, merchant_norm)
);

create table public.insight_cache (
  user_id uuid not null references auth.users (id) on delete cascade,
  accounting_month date not null check (extract(day from accounting_month) = 1),
  payload jsonb not null,
  txn_fingerprint text not null,
  plan text not null check (plan in ('free', 'pro')),
  model text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, accounting_month)
);

create index transactions_user_month_idx
  on public.transactions (user_id, accounting_month);
create index transactions_user_category_idx
  on public.transactions (user_id, category);
create index transactions_user_merchant_date_idx
  on public.transactions (user_id, merchant_norm, occurred_on);
create index transactions_user_source_candidate_idx
  on public.transactions (user_id, source_id, candidate_hash);

alter table public.profiles enable row level security;
alter table public.financial_sources enable row level security;
alter table public.uploads enable row level security;
alter table public.transactions enable row level security;
alter table public.merchant_rules enable row level security;
alter table public.insight_cache enable row level security;

-- 기본 테이블 권한을 먼저 철회하고 필요한 권한만 다시 부여합니다.
-- profiles와 insight_cache는 INSERT·UPDATE·DELETE 및 쓰기 정책을 허용하지 않습니다.
revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.financial_sources from public, anon, authenticated;
revoke all on table public.uploads from public, anon, authenticated;
revoke all on table public.transactions from public, anon, authenticated;
revoke all on table public.merchant_rules from public, anon, authenticated;
revoke all on table public.insight_cache from public, anon, authenticated;

grant select on table public.profiles to authenticated;
grant select, insert, update, delete on table public.financial_sources to authenticated;
grant select, insert, update, delete on table public.uploads to authenticated;
grant select, insert, update, delete on table public.transactions to authenticated;
grant select, insert, update, delete on table public.merchant_rules to authenticated;
grant select on table public.insight_cache to authenticated;

-- service_role은 서버에서만 사용합니다.
grant all on table public.profiles to service_role;
grant all on table public.financial_sources to service_role;
grant all on table public.uploads to service_role;
grant all on table public.transactions to service_role;
grant all on table public.merchant_rules to service_role;
grant all on table public.insight_cache to service_role;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (auth.uid() = id);

create policy financial_sources_own on public.financial_sources
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy uploads_own on public.uploads
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy transactions_own on public.transactions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy merchant_rules_own on public.merchant_rules
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy insight_cache_select_own on public.insight_cache
  for select to authenticated
  using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
  values ('statements', 'statements', false);

-- storage.objects의 RLS는 Supabase Storage가 활성화합니다.
-- UPDATE는 기존 경로와 새 경로 모두 자기 폴더여야 합니다.
create policy statements_own on storage.objects
  for all to authenticated
  using (bucket_id = 'statements' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'statements' and (storage.foldername(name))[1] = auth.uid()::text);

-- 고정 스키마와 소유자 권한으로 가입 시에만 프로필을 생성합니다.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, plan)
    values (new.id, new.email, 'free');
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated, service_role;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

commit;
