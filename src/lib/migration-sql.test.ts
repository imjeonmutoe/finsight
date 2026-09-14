// @vitest-environment node

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
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
