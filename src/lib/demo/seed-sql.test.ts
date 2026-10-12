// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { CATEGORIES } from "@/types/category";

vi.mock("server-only", () => ({}));

const { buildSeedSql, sqlLiteral } = await import("./seed-sql");
const { buildDemoDataset } = await import("./dataset");
const { PREVIEW_ACCOUNTS } = await import("../preview-accounts");

// 한 줄의 values 목록을 SQL 리터럴 단위로 쪼갭니다. 문자열 안의 쉼표·따옴표를 그대로 둡니다.
function parseValues(line: string): string[] {
  const values = line.match(/ values \((.*)\) on conflict /)?.[1];
  if (values === undefined) throw new Error("values 목록을 찾지 못했습니다.");
  return [...values.matchAll(/'(?:[^']|'')*'(?:::\w+)?|null|-?\d+|[\w.]+\([^)]*\)/g)].map((match) => match[0]);
}

function unquote(value: string): string | null {
  if (value === "null") return null;
  return value.replace(/::\w+$/, "").slice(1, -1).replaceAll("''", "'");
}

const sql = buildSeedSql();
const transactionLines = sql.split("\n").filter((line) => line.startsWith("insert into public.transactions "));
// 컬럼 순서는 생성기의 insert 문과 같습니다.
const COLUMNS = [
  "id", "user_id", "source_id", "upload_id", "occurred_on", "accounting_month", "merchant_raw",
  "merchant_norm", "amount_krw", "kind", "category", "category_source", "source_transaction_key",
  "data_row_index", "dedupe_hash", "candidate_hash",
] as const;
const rows = transactionLines.map((line) => {
  const values = parseValues(line);
  expect(values).toHaveLength(COLUMNS.length);
  return Object.fromEntries(COLUMNS.map((column, index) => [column, values[index] ?? ""])) as
    Record<(typeof COLUMNS)[number], string>;
});

describe("프리뷰 시드 SQL", () => {
  it("커밋된 seed.sql이 생성기 출력과 같습니다", async () => {
    await expect(sql).toMatchFileSnapshot("../../../supabase/seed.sql");
  });

  it("같은 입력이면 같은 문자열을 만듭니다", () => {
    expect(buildSeedSql()).toBe(sql);
  });

  it("데모 거래를 두 사용자 모두에 빠짐없이 넣습니다", () => {
    const demo = buildDemoDataset().transactions;
    expect(demo.length).toBeGreaterThan(0);
    for (const account of PREVIEW_ACCOUNTS) {
      const mine = rows.filter((row) => unquote(row.user_id) === account.id);
      expect(mine).toHaveLength(demo.length);
      for (const transaction of demo) {
        const row = mine.find((item) => Number(item.data_row_index) === transaction.dataRowIndex);
        expect(row).toBeDefined();
        expect(unquote(row?.merchant_raw ?? "null")).toBe(transaction.merchantRaw);
        expect(Number(row?.amount_krw)).toBe(transaction.amountKrw);
        expect(unquote(row?.kind ?? "null")).toBe(transaction.kind);
        expect(unquote(row?.category ?? "null")).toBe(transaction.category);
        expect(unquote(row?.occurred_on ?? "null")).toBe(transaction.occurredOn);
        expect(unquote(row?.accounting_month ?? "null")).toBe(`${transaction.accountingMonth}-01`);
      }
    }
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
  });

  it("금액은 0 이상 정수, kind는 NOT NULL, 카테고리는 고정 목록 또는 null입니다", () => {
    for (const row of rows) {
      expect(row.amount_krw).toMatch(/^\d+$/);
      expect(["expense", "income", "refund", "transfer"]).toContain(unquote(row.kind));
      const category = unquote(row.category);
      if (category !== null) expect(CATEGORIES).toContain(category);
    }
  });

  it("이메일은 전부 @finsight.test 도메인입니다", () => {
    const emails = [...sql.matchAll(/[\w.+-]+@[\w.-]+/g)].map((match) => match[0]);
    expect(emails.length).toBeGreaterThan(0);
    for (const email of emails) expect(email).toMatch(/@finsight\.test$/);
  });

  it("모든 insert에 on conflict ... do nothing이 있습니다", () => {
    const inserts = sql.split("\n").filter((line) => /^insert into /i.test(line));
    expect(inserts.length).toBeGreaterThan(0);
    for (const line of inserts) expect(line).toMatch(/ on conflict .*do nothing;$/);
  });

  it("트랜잭션 제어문과 DDL이 없습니다", () => {
    const statements = sql.split("\n").filter((line) => line.trim() !== "" && !line.startsWith("--"));
    for (const line of statements) {
      expect(line).toMatch(/^(insert into |update public\.profiles )/);
    }
    expect(sql).not.toMatch(/^\s*(begin|commit|rollback|start transaction)\b/im);
  });

  it("파일 맨 위에 자동 생성 주석이 있습니다", () => {
    expect(sql.split("\n")[0]).toMatch(/^-- 자동 생성/);
  });
});

describe("SQL 리터럴", () => {
  it("작은따옴표를 이중화해 문자열이 깨지지 않습니다", () => {
    expect(sqlLiteral("O'Brien's 카페")).toBe("'O''Brien''s 카페'");
    expect(unquote(sqlLiteral("'; drop table x; --"))).toBe("'; drop table x; --");
  });

  it("null은 null로 씁니다", () => {
    expect(sqlLiteral(null)).toBe("null");
  });
});
