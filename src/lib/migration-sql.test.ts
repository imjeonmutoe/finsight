// @vitest-environment node

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_CSV_ROWS } from "@/lib/limits";
import { CATEGORIES } from "@/types/category";

const rawSql = readFileSync(
  new URL("../../supabase/migrations/0001_init.sql", import.meta.url),
  "utf8",
);
// 주석이 검증을 통과시키지 않게 제거합니다. SQL 문법 파서는 아닙니다.
const sql = rawSql.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();
const tables = [
  "profiles", "financial_sources", "uploads", "transactions",
  "merchant_rules", "insight_cache",
] as const;
const writableTables = [
  "financial_sources", "uploads", "transactions", "merchant_rules",
] as const;

function tableDefinition(table: string): string {
  const body = sql.match(new RegExp(`create table public\\.${table} \\((.*?)\\);`, "i"))?.[1];
  if (!body) throw new Error(`${table} 테이블 정의를 찾을 수 없습니다.`);
  return body;
}

function policiesFor(table: string): string[] {
  return Array.from(sql.matchAll(/create policy [^;]+;/gi), ([statement]) => statement)
    .filter((statement) => statement.includes(` on ${table} `));
}

function checkValues(table: string, column: string): string[] {
  const values = tableDefinition(table).match(new RegExp(
    `check \\(\\s*(?:${column} is null or )?${column} in \\(([^)]+)\\)\\s*\\)`, "i",
  ))?.[1];
  if (!values) throw new Error(`${table}.${column}의 CHECK 목록을 찾을 수 없습니다.`);
  return Array.from(values.matchAll(/'((?:''|[^'])*)'/g), (match) => {
    const value = match[1];
    if (value === undefined) throw new Error("CHECK 문자열을 읽을 수 없습니다.");
    return value.replace(/''/g, "'");
  });
}

describe("초기 마이그레이션 설계 규칙", () => {
  it("정확히 여섯 도메인 테이블만 생성합니다", () => {
    const created = Array.from(sql.matchAll(/create table ([\w.]+)\s*\(/gi), (match) => match[1]);
    expect(created.sort()).toEqual(tables.map((table) => `public.${table}`).sort());
  });

  it.each(tables)("%s의 RLS를 활성화합니다", (table) => {
    expect(sql).toContain(`alter table public.${table} enable row level security;`);
    expect(sql).not.toMatch(/disable row level security/i);
  });

  it.each(["transactions", "merchant_rules"])("%s의 카테고리 CHECK가 공유 목록과 정확히 일치합니다", (table) => {
    const values = checkValues(table, "category");
    expect(values).toHaveLength(12);
    expect(values.sort()).toEqual([...CATEGORIES].sort());
    expect(tableDefinition(table)).toMatch(/category text\b/);
    expect(sql).not.toMatch(/create type .*? as enum/i);
  });

  it("분류 전 거래의 카테고리와 분류 출처는 NULL을 허용합니다", () => {
    const transactions = tableDefinition("transactions");
    expect(transactions).toContain("category text check (category is null or category in (");
    expect(transactions).toContain("category_source text check (category_source is null or category_source in (");
    expect(transactions).toContain("source_transaction_key text,");
    expect(tableDefinition("merchant_rules")).toContain("category text not null check (");
  });

  it.each([
    ["profiles", "plan", ["free", "pro"]],
    ["insight_cache", "plan", ["free", "pro"]],
    ["uploads", "status", ["pending", "mapped", "parsed", "failed"]],
    ["financial_sources", "kind", ["card", "bank"]],
    ["transactions", "kind", ["expense", "income", "refund", "transfer"]],
    ["transactions", "category_source", ["ai", "rule", "user"]],
  ] as const)("%s.%s의 허용 값을 제한합니다", (table, column, values) => {
    expect(checkValues(table, column).sort()).toEqual([...values].sort());
    if (column !== "category_source") {
      expect(tableDefinition(table)).toContain(`${column} text not null`);
    }
  });

  it("금액·행 인덱스·카운터를 음수가 아닌 정수로 제한합니다", () => {
    const transactions = tableDefinition("transactions");
    expect(transactions).toContain("amount_krw bigint not null check (amount_krw >= 0)");
    expect(transactions).toContain("data_row_index integer not null check (data_row_index >= 0)");
    for (const column of ["row_count", "inserted_count", "duplicate_count", "unclassified_count"]) {
      expect(tableDefinition("uploads")).toContain(
        `${column} integer not null default 0 check (${column} >= 0)`,
      );
    }
    expect(tableDefinition("uploads")).toContain("byte_size integer not null check (byte_size >= 0)");
  });

  it.each(["transactions", "insight_cache"])("%s의 청구월은 월 첫날이며 NULL일 수 없습니다", (table) => {
    expect(tableDefinition(table)).toContain(
      "accounting_month date not null check (extract(day from accounting_month) = 1)",
    );
  });

  it("출처·업로드 소유권과 출처별 중복 키를 복합 제약으로 고정합니다", () => {
    expect(tableDefinition("financial_sources")).toContain("unique (user_id, id)");
    const uploads = tableDefinition("uploads");
    expect(uploads).toContain("unique (user_id, source_id, file_hash)");
    expect(uploads).toContain("unique (user_id, source_id, id)");
    expect(uploads).toContain(
      "foreign key (user_id, source_id) references public.financial_sources (user_id, id)",
    );
    const transactions = tableDefinition("transactions");
    expect(transactions).toContain("unique (user_id, source_id, dedupe_hash)");
    expect(transactions).toContain(
      "foreign key (user_id, source_id, upload_id) references public.uploads (user_id, source_id, id) on delete cascade",
    );
    expect(transactions).toContain("dedupe_hash text not null");
    expect(transactions).toContain("candidate_hash text not null");
    expect(tableDefinition("merchant_rules")).toContain("primary key (user_id, merchant_norm)");
    expect(tableDefinition("insight_cache")).toContain("primary key (user_id, accounting_month)");
  });

  it.each(tables)("%s는 사용자 FK를 가지며 계정 삭제 시 함께 삭제됩니다", (table) => {
    const key = table === "profiles" ? "id uuid primary key" : "user_id uuid not null";
    expect(tableDefinition(table)).toContain(`${key} references auth.users (id) on delete cascade`);
  });

  it.each(["financial_sources", "uploads", "transactions"])("%s의 UUID는 서버에서 생성합니다", (table) => {
    expect(tableDefinition(table)).toContain("id uuid primary key default gen_random_uuid()");
  });

  it.each([
    "user_id, accounting_month",
    "user_id, category",
    "user_id, merchant_norm, occurred_on",
    "user_id, source_id, candidate_hash",
  ])("거래 조회 인덱스의 컬럼 순서를 유지합니다: %s", (columns) => {
    const indexes = Array.from(sql.matchAll(/create index \w+ on public\.transactions \(([^)]+)\);/gi), (match) => match[1]);
    expect(indexes).toContain(columns);
  });

  it.each(writableTables)("%s는 자기 행에만 접근·기록할 수 있습니다", (table) => {
    const policies = policiesFor(`public.${table}`);
    expect(policies).toHaveLength(1);
    expect(policies[0]).toContain("for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)");
    expect(sql).toContain(`grant select, insert, update, delete on table public.${table} to authenticated;`);
  });

  it.each(["profiles", "insight_cache"])("%s의 클라이언트 권한과 정책은 자기 행 SELECT뿐입니다", (table) => {
    expect(sql).toContain(`revoke all on table public.${table} from public, anon, authenticated;`);
    const grants = Array.from(sql.matchAll(/grant [^;]+;/gi), ([statement]) => statement)
      .filter((statement) => statement.includes(` on table public.${table} `));
    expect(grants).toEqual([
      `grant select on table public.${table} to authenticated;`,
      `grant all on table public.${table} to service_role;`,
    ]);
    const policies = policiesFor(`public.${table}`);
    expect(policies).toHaveLength(1);
    expect(policies[0]).toContain(
      `for select to authenticated using (auth.uid() = ${table === "profiles" ? "id" : "user_id"})`,
    );
  });

  it("인사이트 캐시의 근거·플랜·모델을 필수로 보관합니다", () => {
    const cache = tableDefinition("insight_cache");
    for (const column of ["payload jsonb", "txn_fingerprint text", "plan text", "model text", "created_at timestamptz"]) {
      expect(cache).toContain(`${column} not null`);
    }
  });

  it("원본 버킷은 private이며 자기 폴더에만 접근·기록할 수 있습니다", () => {
    expect(sql).toContain("insert into storage.buckets (id, name, public) values ('statements', 'statements', false);");
    const policies = policiesFor("storage.objects");
    expect(policies).toHaveLength(1);
    expect(policies[0]).toContain("for all to authenticated");
    const ownership = "bucket_id = 'statements' and (storage.foldername(name))[1] = auth.uid()::text";
    expect(policies[0]).toContain(`using (${ownership})`);
    expect(policies[0]).toContain(`with check (${ownership})`);
  });

  it("가입 트리거는 메타데이터 없이 무료 플랜을 생성하고 함수 호출 권한을 제한합니다", () => {
    expect(sql).toContain("create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = ''");
    expect(sql).toContain("insert into public.profiles (id, email, plan) values (new.id, new.email, 'free');");
    expect(sql).not.toMatch(/raw_user_meta_data|raw_app_meta_data/i);
    expect(sql).toContain("revoke all on function public.handle_new_user() from public, anon, authenticated, service_role;");
    expect(sql).toContain("create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();");
  });

  it("제거한 사용량 테이블 이름은 주석을 포함해 어디에도 등장하지 않습니다", () => {
    expect(rawSql).not.toMatch(/llm_usage/i);
  });
});

const rawConfirmSql = readFileSync(
  new URL("../../supabase/migrations/0003_upload_confirm.sql", import.meta.url),
  "utf8",
);
const confirmSql = rawConfirmSql.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();

describe("업로드 승인 트랜잭션", () => {
  it("승인을 하나의 함수로 처리하며 세션 UID와 소유권을 검증합니다", () => {
    expect(confirmSql).toContain("create function public.confirm_upload(");
    expect(confirmSql).toContain("language plpgsql");
    // security definer면 RLS를 우회합니다. 승인은 사용자 세션 권한으로만 수행합니다.
    expect(confirmSql).toContain("security invoker");
    expect(confirmSql).toContain("set search_path = ''");
    expect(confirmSql).toContain("v_user uuid := (select auth.uid())");
    expect(confirmSql).toContain("where id = p_upload_id and user_id = v_user for update");
  });

  it("같은 출처의 동시 승인을 출처 행 잠금으로 직렬화합니다", () => {
    expect(confirmSql).toContain(
      "perform 1 from public.financial_sources where user_id = v_user and id = v_upload.source_id for update",
    );
  });

  it("parsed 재승인은 저장된 카운트를 돌려주고 insert하지 않습니다", () => {
    const guard = confirmSql.match(/if v_upload\.status = 'parsed' then (.*?)end if;/)?.[1];
    expect(guard).toBeDefined();
    expect(guard).toContain("v_upload.inserted_count");
    expect(guard).toContain("v_upload.duplicate_count");
    expect(guard).toContain("v_upload.unclassified_count");
    expect(guard).not.toMatch(/insert into/i);
    expect(confirmSql).toContain("if v_upload.status <> 'mapped' then");
  });

  it("결정하지 않은 후보가 남아 있으면 review를 돌려주고 insert하지 않습니다", () => {
    // 후보 재조회는 같은 출처의 다른 업로드만 봅니다. 같은 파일 내 별개 행은 보존합니다.
    expect(confirmSql).toContain("t.candidate_hash = r.\"candidateHash\" and t.upload_id <> p_upload_id");
    expect(confirmSql).toContain("where r.\"sourceTransactionKey\" is null");
    expect(confirmSql).toContain("not (c.ids <@ coalesce(d.\"candidateIds\", '[]'::jsonb))");
    const review = confirmSql.match(/if v_review is not null then (.*?)end if;/)?.[1];
    expect(review).toContain("jsonb_build_object('review', v_review)");
    expect(review).not.toMatch(/insert into/i);
  });

  it("중복 결정은 소유권·출처·후보를 재검증하고 한 거래의 다중 대응을 거부합니다", () => {
    expect(confirmSql).toContain("array_length(v_duplicate_ids, 1) <> (select count(distinct id) from unnest(v_duplicate_ids) as id)");
    expect(confirmSql).toContain("where t.id = d.\"transactionId\" and t.user_id = v_user and t.source_id = v_upload.source_id and t.candidate_hash = r.\"candidateHash\" and t.upload_id <> p_upload_id");
    expect(confirmSql).toContain("raise exception 'DUPLICATE_DECISION_INVALID'");
  });

  it("확정 해시 충돌만 자동 중복 처리하고 카운트와 parsed 전이를 함께 기록합니다", () => {
    expect(confirmSql).toContain("on conflict (user_id, source_id, dedupe_hash) do nothing");
    expect(confirmSql).toContain("coalesce(d.action, 'keep') <> 'duplicate'");
    expect(confirmSql).toContain("count(*) filter (where kind in ('expense', 'refund') and category is null)");
    const update = confirmSql.match(/update public\.uploads set (.*?) where id = p_upload_id/)?.[1];
    expect(update).toContain("status = 'parsed'");
    expect(update).toContain("inserted_count = v_inserted");
    expect(update).toContain("duplicate_count = jsonb_array_length(p_rows) - v_inserted");
    expect(update).toContain("unclassified_count = v_unclassified");
  });

  it("거래는 세션 사용자와 업로드의 출처로만 기록합니다", () => {
    // 클라이언트가 보낸 user_id·source_id를 신뢰하지 않습니다.
    expect(confirmSql).toContain("select v_user, v_upload.source_id, p_upload_id,");
  });

  it("함수 실행 권한을 authenticated로 제한합니다", () => {
    const signature = "public.confirm_upload(uuid, jsonb, jsonb, integer, text, jsonb, jsonb)";
    expect(confirmSql).toContain(`revoke all on function ${signature} from public, anon;`);
    expect(confirmSql).toContain(`grant execute on function ${signature} to authenticated;`);
  });

  it("제거한 사용량 테이블과 lease 개념을 도입하지 않습니다", () => {
    expect(rawConfirmSql).not.toMatch(/llm_usage|lease/i);
  });
});

const grantsSql = readFileSync(
  new URL("../../supabase/migrations/0004_upload_column_grants.sql", import.meta.url),
  "utf8",
).replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();

function grantedColumns(privilege: "insert" | "update"): string[] {
  const list = grantsSql.match(new RegExp(
    `grant ${privilege} \\(([^)]+)\\) on table public\\.uploads to authenticated;`, "i",
  ))?.[1];
  if (!list) throw new Error(`uploads의 ${privilege} 컬럼 권한을 찾을 수 없습니다.`);
  return list.split(",").map((column) => column.trim()).sort();
}

describe("uploads 컬럼 단위 쓰기 권한", () => {
  // 한도는 이번 달 created_at으로 셉니다. 클라이언트가 created_at을 과거로 쓰거나
  // 지우면 Free 월 1회가 풀립니다. 서버 라우트도 사용자 세션으로 쓰므로 표 단위로 열면
  // 브라우저에서 PostgREST를 직접 불러 똑같이 쓸 수 있습니다.
  it("표 단위 INSERT·UPDATE를 회수합니다", () => {
    expect(grantsSql).toContain("revoke insert, update on table public.uploads from authenticated;");
  });

  it.each(["insert", "update"] as const)("%s로 id·created_at을 쓸 수 없습니다", (privilege) => {
    expect(grantedColumns(privilege)).not.toContain("created_at");
    expect(grantedColumns(privilege)).not.toContain("id");
  });

  it("UPDATE로 소유자·출처·파일 식별자를 바꿀 수 없습니다", () => {
    for (const column of ["user_id", "source_id", "file_hash", "storage_path"]) {
      expect(grantedColumns("update")).not.toContain(column);
    }
  });

  it("라우트와 confirm_upload가 쓰는 컬럼은 모두 열려 있습니다", () => {
    // POST /api/uploads의 insert·update 레코드와 confirm_upload의 update set 목록입니다.
    expect(grantedColumns("insert")).toEqual([
      "byte_size", "encoding", "error_message", "file_hash", "filename", "import_context",
      "row_count", "source_id", "status", "storage_path", "user_id",
    ]);
    expect(grantedColumns("update")).toEqual([
      "byte_size", "column_mapping", "duplicate_count", "encoding", "error_message", "filename",
      "import_context", "inserted_count", "mapping_confidence", "row_count", "status", "unclassified_count",
    ]);
  });
});

const rawCostSql = readFileSync(
  new URL("../../supabase/migrations/0007_close_client_cost_paths.sql", import.meta.url),
  "utf8",
);
const costSql = rawCostSql.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();

describe("클라이언트 직접 쓰기로 분류 비용을 늘리는 경로", () => {
  // 분류 비용은 '들어간 거래 수'로 상한이 잡힌다는 것이 ADR-012의 전제입니다. 거래를 넣는 길이
  // confirm_upload 하나뿐이어야 그 전제가 성립합니다.
  it("거래 테이블에 클라이언트 INSERT를 허용하지 않습니다", () => {
    expect(costSql).toContain("revoke insert on table public.transactions from authenticated;");
  });

  it("confirm_upload는 표 권한 없이 넣을 수 있도록 definer로 돌고 search_path를 비웁니다", () => {
    const header = costSql.match(/create or replace function public\.confirm_upload\((.*?) as \$\$/)?.[1];
    expect(header).toBeDefined();
    expect(header).toContain("security definer");
    expect(header).not.toContain("security invoker");
    expect(header).toContain("set search_path = ''");
  });

  it("definer는 RLS를 우회하므로 모든 조회·쓰기를 세션 UID로 다시 묶습니다", () => {
    for (const statement of [
      "v_user uuid := (select auth.uid())",
      "raise exception 'AUTH_REQUIRED'",
      "where id = p_upload_id and user_id = v_user for update",
      "perform 1 from public.financial_sources where user_id = v_user and id = v_upload.source_id for update",
      "on t.user_id = v_user and t.source_id = v_upload.source_id",
      "where t.id = d.\"transactionId\" and t.user_id = v_user and t.source_id = v_upload.source_id",
      "select v_user, v_upload.source_id, p_upload_id,",
      "where id = p_upload_id and user_id = v_user; return jsonb_build_object(",
    ]) expect(costSql).toContain(statement);
  });

  it("함수를 직접 불러도 행 수 상한을 넘길 수 없습니다", () => {
    // RPC는 PostgREST로 직접 부를 수 있습니다. 라우트의 10,000행 검사를 거치지 않습니다.
    expect(costSql).toContain(`if jsonb_array_length(p_rows) > ${MAX_CSV_ROWS} then raise exception 'TOO_MANY_ROWS';`);
  });

  it("Free 월 1회 한도를 거래가 들어가는 지점에서 다시 확인합니다", () => {
    // 업로드 행은 클라이언트가 직접 INSERT할 수 있으므로(0004) POST /api/uploads의 검사만으로는 부족합니다.
    expect(costSql).toContain("perform 1 from public.profiles where id = v_user for update");
    expect(costSql).toContain("p.plan = 'pro' and (p.plan_expires_at is null or p.plan_expires_at > now())");
    expect(costSql).toContain("u.user_id = v_user and u.id <> p_upload_id and u.status = 'parsed'");
    expect(costSql).toContain("u.created_at >= date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'");
    expect(costSql).toContain("raise exception 'UPLOAD_LIMIT_REACHED'");
  });

  it("한도 검사는 재승인 반환 뒤, 거래 insert 앞에 있습니다", () => {
    const limit = costSql.indexOf("raise exception 'UPLOAD_LIMIT_REACHED'");
    expect(costSql.indexOf("if v_upload.status = 'parsed' then")).toBeLessThan(limit);
    expect(limit).toBeLessThan(costSql.indexOf("insert into public.transactions"));
  });

  it("분류된 카테고리를 NULL로 되돌려 다시 분류시킬 수 없습니다", () => {
    expect(costSql).toContain("if old.category is not null and new.category is null then raise exception 'CATEGORY_RESET_FORBIDDEN';");
    expect(costSql).toMatch(/create trigger \w+ before update of category on public\.transactions for each row execute function public\.\w+\(\);/);
  });

  it("함수 실행 권한은 그대로 authenticated뿐입니다", () => {
    expect(costSql).not.toMatch(/grant execute on function public\.confirm_upload[^;]* to (public|anon)/);
  });

  it("사용량 테이블과 lease 개념을 도입하지 않습니다", () => {
    expect(rawCostSql).not.toMatch(/llm_usage|lease/i);
  });
});
