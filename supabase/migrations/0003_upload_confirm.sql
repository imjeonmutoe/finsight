begin;

-- 업로드 승인은 후보 재조회·결정 검증·insert·카운트 갱신·parsed 전이를 한 트랜잭션에서
-- 처리합니다. 함수로 묶는 이유: PostgREST 요청 하나가 한 트랜잭션이므로, 여러 요청으로
-- 나누면 중간에 다른 승인이 끼어들어 결정 근거가 낡은 상태로 insert됩니다.
-- security invoker이므로 RLS가 그대로 적용되고, 그 위에 user_id 조건을 다시 겁니다.
create function public.confirm_upload(
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
security invoker
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

revoke all on function public.confirm_upload(uuid, jsonb, jsonb, integer, text, jsonb, jsonb) from public, anon;
grant execute on function public.confirm_upload(uuid, jsonb, jsonb, integer, text, jsonb, jsonb) to authenticated;

commit;
