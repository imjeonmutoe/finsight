-- 클라이언트가 직접 써서 분류 비용을 늘리는 경로를 닫습니다.
--
-- ADR-012는 분류 비용이 '들어간 거래 수'로 상한이 잡힌다고 전제합니다. 그런데 transactions에
-- 클라이언트 INSERT가 열려 있어(0001) anon 키와 자기 JWT로 category=null 거래를 얼마든지 넣고
-- /api/transactions/classify를 반복 호출할 수 있었습니다. 분류된 거래를 UPDATE로 category=null로
-- 되돌려도 같은 결과입니다. 이 파일이 막는 것:
--
-- 1. transactions INSERT 회수. 거래는 confirm_upload로만 들어갑니다. 함수가 표 권한 없이 넣을 수
--    있도록 security definer로 바꿉니다. definer는 RLS를 우회하므로, 함수 안의 모든 조회·쓰기가
--    이미 v_user(세션 UID)로 묶여 있는지 확인했습니다(0003과 본문이 같고 아래 두 검사만 더했습니다).
--    search_path는 그대로 비워 둡니다 — definer 함수에서 search_path를 열면 권한 상승 구멍이 됩니다.
-- 2. 함수 직접 호출 대비: 행 수 상한(10,000)과 Free 월 1회 한도를 함수 안에서 다시 확인합니다.
-- 3. 분류된 카테고리를 NULL로 되돌리는 UPDATE를 트리거로 거절합니다. 라우트(PATCH·classify)는
--    카테고리를 NULL로 쓰지 않습니다.
--
-- UPDATE·DELETE 권한은 그대로 둡니다. PATCH /api/transactions/[id]·classify·/api/account/data가
-- 사용자 세션으로 씁니다. 업로드 삭제로 한도가 초기화되는 경로는 이 파일이 다루지 않습니다.
-- 호출량 쿼터 시스템은 만들지 않습니다(ADR-012).

begin;

revoke insert on table public.transactions from authenticated;

create or replace function public.confirm_upload(
  p_upload_id uuid,
  p_rows jsonb,
  p_decisions jsonb,
  p_row_count integer,
  p_encoding text,
  p_column_mapping jsonb,
  p_import_context jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_upload public.uploads;
  v_review jsonb;
  v_duplicate_ids uuid[];
  v_inserted integer;
  v_unclassified integer;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- RPC는 PostgREST로 직접 부를 수 있어 라우트의 10,000행 검사(MAX_CSV_ROWS)를 거치지 않습니다.
  if jsonb_array_length(p_rows) > 10000 then
    raise exception 'TOO_MANY_ROWS';
  end if;

  select * into v_upload
  from public.uploads
  where id = p_upload_id and user_id = v_user
  for update;

  if not found then
    raise exception 'UPLOAD_NOT_FOUND';
  end if;

  -- 재승인은 저장된 결과를 그대로 돌려줍니다. 거래도 카운트도 건드리지 않습니다.
  if v_upload.status = 'parsed' then
    return jsonb_build_object(
      'inserted', v_upload.inserted_count,
      'duplicates', v_upload.duplicate_count,
      'unclassified', v_upload.unclassified_count
    );
  end if;

  if v_upload.status <> 'mapped' then
    raise exception 'UPLOAD_NOT_MAPPED';
  end if;

  -- Free 월 1회 한도를 거래가 들어가는 이 지점에서 다시 확인합니다. 업로드 행은 클라이언트가 직접
  -- INSERT할 수 있어(0004) POST /api/uploads의 검사만으로는 막히지 않습니다. 세는 기준은 그 라우트와
  -- 같은 KST 캘린더 월의 created_at입니다(ADR-005). 프로필 행 잠금으로 같은 사용자의 동시 승인을
  -- 직렬화합니다 — 두 업로드를 동시에 승인해 한도를 한 번 넘기는 틈(ADR-012 트레이드오프)도 닫힙니다.
  perform 1 from public.profiles where id = v_user for update;
  if not exists (
    select 1 from public.profiles p
    where p.id = v_user and p.plan = 'pro' and (p.plan_expires_at is null or p.plan_expires_at > now())
  ) and exists (
    select 1 from public.uploads u
    where u.user_id = v_user and u.id <> p_upload_id and u.status = 'parsed'
      and u.created_at >= date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'
  ) then
    raise exception 'UPLOAD_LIMIT_REACHED';
  end if;

  -- 같은 출처의 동시 승인을 직렬화합니다. 후보 재조회와 insert 사이에 새 거래가 끼지 않습니다.
  perform 1 from public.financial_sources
  where user_id = v_user and id = v_upload.source_id
  for update;

  -- 사용자가 결정한 뒤 새로 생긴 후보가 있으면 아무것도 넣지 않고 확인으로 되돌립니다.
  -- 같은 출처의 다른 업로드만 봅니다 — 같은 파일 내 별개 행은 후보가 아닙니다.
  with rows_in as (
    select * from jsonb_to_recordset(p_rows)
      as r("dataRowIndex" integer, "sourceTransactionKey" text, "candidateHash" text)
  ),
  decisions as (
    select * from jsonb_to_recordset(p_decisions)
      as d("dataRowIndex" integer, action text, "candidateIds" jsonb)
  ),
  current_candidates as (
    select r."dataRowIndex",
      coalesce(jsonb_agg(t.id order by t.id) filter (where t.id is not null), '[]'::jsonb) as ids
    from rows_in r
    left join public.transactions t
      on t.user_id = v_user and t.source_id = v_upload.source_id
      and t.candidate_hash = r."candidateHash" and t.upload_id <> p_upload_id
    where r."sourceTransactionKey" is null
    group by r."dataRowIndex"
  )
  select jsonb_agg(jsonb_build_object('dataRowIndex', c."dataRowIndex", 'transactionIds', c.ids)
    order by c."dataRowIndex")
  into v_review
  from current_candidates c
  left join decisions d on d."dataRowIndex" = c."dataRowIndex"
  where c.ids <> '[]'::jsonb
    and (d."dataRowIndex" is null or not (c.ids <@ coalesce(d."candidateIds", '[]'::jsonb)));

  if v_review is not null then
    return jsonb_build_object('review', v_review);
  end if;

  select array_agg(d."transactionId")
  into v_duplicate_ids
  from jsonb_to_recordset(p_decisions) as d(action text, "transactionId" uuid)
  where d.action = 'duplicate';

  if v_duplicate_ids is not null then
    -- 한 기존 거래를 새 행 여러 개에 대응시키면 정상 거래가 사라집니다.
    if array_length(v_duplicate_ids, 1) <> (select count(distinct id) from unnest(v_duplicate_ids) as id)
      or exists (select 1 from unnest(v_duplicate_ids) as id where id is null)
    then
      raise exception 'DUPLICATE_DECISION_INVALID';
    end if;

    -- 가리킨 거래가 본인·동일 출처·동일 후보이며 다른 업로드에 있는지 다시 확인합니다.
    if exists (
      select 1
      from jsonb_to_recordset(p_decisions) as d("dataRowIndex" integer, action text, "transactionId" uuid)
      join jsonb_to_recordset(p_rows) as r("dataRowIndex" integer, "candidateHash" text)
        on r."dataRowIndex" = d."dataRowIndex"
      where d.action = 'duplicate'
        and not exists (
          select 1 from public.transactions t
          where t.id = d."transactionId" and t.user_id = v_user and t.source_id = v_upload.source_id
            and t.candidate_hash = r."candidateHash" and t.upload_id <> p_upload_id
        )
    ) then
      raise exception 'DUPLICATE_DECISION_INVALID';
    end if;
  end if;

  with rows_in as (
    select * from jsonb_to_recordset(p_rows) as r(
      "dataRowIndex" integer, "occurredOn" date, "accountingMonth" text,
      "merchantRaw" text, "merchantNorm" text, "amountKrw" bigint, kind text,
      "sourceTransactionKey" text, "dedupeHash" text, "candidateHash" text,
      category text, "categorySource" text
    )
  ),
  decisions as (
    select * from jsonb_to_recordset(p_decisions) as d("dataRowIndex" integer, action text)
  ),
  kept as (
    select r.* from rows_in r
    left join decisions d on d."dataRowIndex" = r."dataRowIndex"
    where coalesce(d.action, 'keep') <> 'duplicate'
  ),
  saved as (
    insert into public.transactions (
      user_id, source_id, upload_id, occurred_on, accounting_month, merchant_raw, merchant_norm,
      amount_krw, kind, category, category_source, source_transaction_key, data_row_index,
      dedupe_hash, candidate_hash
    )
    select v_user, v_upload.source_id, p_upload_id, k."occurredOn",
      to_date(k."accountingMonth" || '-01', 'YYYY-MM-DD'), k."merchantRaw", k."merchantNorm",
      k."amountKrw", k.kind, k.category, k."categorySource", k."sourceTransactionKey",
      k."dataRowIndex", k."dedupeHash", k."candidateHash"
    from kept k
    -- 확정 해시 충돌만 자동 중복 처리합니다. 후보 일치는 위에서 사용자가 결정했습니다.
    on conflict (user_id, source_id, dedupe_hash) do nothing
    returning kind, category
  )
  select count(*)::integer,
    count(*) filter (where kind in ('expense', 'refund') and category is null)::integer
  into v_inserted, v_unclassified
  from saved;

  update public.uploads set
    status = 'parsed',
    encoding = p_encoding,
    column_mapping = p_column_mapping,
    import_context = p_import_context,
    row_count = p_row_count,
    inserted_count = v_inserted,
    duplicate_count = jsonb_array_length(p_rows) - v_inserted,
    unclassified_count = v_unclassified,
    error_message = null
  where id = p_upload_id and user_id = v_user;

  return jsonb_build_object(
    'inserted', v_inserted,
    'duplicates', jsonb_array_length(p_rows) - v_inserted,
    'unclassified', v_unclassified
  );
end;
$$;

-- 기존 실행 권한(authenticated만)은 create or replace에서 그대로 유지됩니다.

create function public.keep_transaction_category()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.category is not null and new.category is null then
    raise exception 'CATEGORY_RESET_FORBIDDEN';
  end if;
  return new;
end;
$$;

revoke all on function public.keep_transaction_category() from public, anon, authenticated;

create trigger transactions_keep_category
  before update of category on public.transactions
  for each row execute function public.keep_transaction_category();

commit;
