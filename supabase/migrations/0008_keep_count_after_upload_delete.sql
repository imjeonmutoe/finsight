-- 업로드를 지워도 Free 월 1회 한도가 돌아오지 않게 합니다.
--
-- 한도는 uploads 행을 이번 달 created_at으로 셉니다(ADR-005). 행을 지우면 — 업로드 삭제 라우트,
-- PostgREST 직접 DELETE(0001이 연 권한을 0004도 그대로 둠), 금융 데이터 전체 삭제 어느 쪽이든 — 횟수가 0으로
-- 돌아가, 올리고 지우기를 반복하는 것만으로 매핑·분류 호출을 계속 쓸 수 있었습니다.
--
-- 삭제를 막지 않고 삭제 사실을 남깁니다. 지운 업로드의 created_at 중 가장 늦은 값을
-- profiles.last_deleted_upload_at에 기록합니다. profiles는 클라이언트가 쓸 수 없으므로(0001) 지워도
-- 되돌릴 수 없습니다. 카운터 테이블이 아니라 시각 하나입니다 — 한도는 여전히 '이번 달에 만든
-- 업로드가 있었는가'이고, 그 업로드가 지금 남아 있는지만 묻지 않게 됩니다.
--
-- 1. profiles에 컬럼 추가. 표 단위 SELECT 권한(0001)으로 본인만 읽습니다.
-- 2. uploads AFTER DELETE 트리거. 트리거는 함수 EXECUTE 권한과 무관하게 돌므로 RPC 실행 권한은
--    모두 회수합니다. definer는 RLS를 우회하므로 지워진 행의 주인(old.user_id) 프로필만 고칩니다.
-- 3. confirm_upload 한도 검사에 표시를 더합니다. 본문은 0007과 같고 그 조건 하나만 다릅니다.
--
-- 기존 데이터는 채우지 않습니다. 이미 지워진 업로드는 기록이 없어 이번 달에 한해 예전처럼 셉니다.
-- 호출량 쿼터 시스템은 만들지 않습니다(ADR-012).

begin;

alter table public.profiles add column last_deleted_upload_at timestamptz;

create function public.remember_deleted_upload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- greatest는 NULL을 건너뜁니다. 지난달 업로드를 지워도 이번 달 표시가 생기지 않습니다.
  update public.profiles
  set last_deleted_upload_at = greatest(last_deleted_upload_at, old.created_at)
  where id = old.user_id;
  return old;
end;
$$;

revoke all on function public.remember_deleted_upload() from public, anon, authenticated, service_role;

create trigger uploads_remember_deleted
  after delete on public.uploads
  for each row execute function public.remember_deleted_upload();

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
  ) and (
    exists (
      select 1 from public.uploads u
      where u.user_id = v_user and u.id <> p_upload_id and u.status = 'parsed'
        and u.created_at >= date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'
    )
    -- 이번 달에 만든 업로드를 지웠으면 그 업로드도 한 번으로 셉니다(아래 트리거가 남긴 표시).
    or (select p.last_deleted_upload_at from public.profiles p where p.id = v_user)
      >= date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'
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

commit;
