import "server-only";
// Supabase 프리뷰 브랜치용 supabase/seed.sql 생성기다. 샘플 대시보드(S0)와 같은 데모 거래를
// 프리뷰 계정 두 개에 넣는다. 스냅샷 테스트가 생성 결과를 커밋된 seed.sql과 대조한다.
import type { ParsedTransaction } from "@/types/transaction";
import { computeCandidateHash, computeDedupeHash } from "../dedupe";
import { PREVIEW_ACCOUNTS, PREVIEW_PASSWORD } from "../preview-accounts";
import { buildDemoDataset } from "./dataset";
import { SAMPLE_CONTEXT, SAMPLE_CSV, SAMPLE_MAPPING } from "./sample-csv";

const HEADER = [
  "-- 자동 생성 — 손으로 고치지 마라. `src/lib/demo/seed-sql.ts`를 고치고 스냅샷을 갱신하라",
  "-- (npx vitest run src/lib/demo/seed-sql.test.ts -u). 프리뷰 브랜치 전용 합성 데이터다.",
];

// Pro 만료일은 프리뷰 기간 내내 유효하도록 먼 미래로 고정한다. now()를 쓰면 출력이 매번 달라진다.
const PRO_EXPIRES_AT = "2099-12-31T00:00:00Z";

export function sqlLiteral(value: string | number | null): string {
  if (value === null) return "null";
  if (typeof value === "number") return String(value);
  return `'${value.replaceAll("'", "''")}'`;
}

function jsonb(value: unknown): string {
  return `${sqlLiteral(JSON.stringify(value))}::jsonb`;
}

// 사용자·행 번호로 고정 UUID를 만든다. 시드를 다시 돌려도 같은 키가 충돌해 건너뛴다.
function seedId(kind: number, user: number, row: number): string {
  return `5eed000${kind}-${String(user).padStart(4, "0")}-4000-8000-${String(row).padStart(12, "0")}`;
}

// 대상 없는 on conflict라 기본 키든 다른 UNIQUE든 이미 있으면 건너뛴다.
function insert(table: string, columns: string[], values: string[]): string {
  return `insert into ${table} (${columns.join(", ")}) values (${values.join(", ")}) on conflict do nothing;`;
}

export function buildSeedSql(): string {
  const transactions = buildDemoDataset().transactions;
  const byteSize = new TextEncoder().encode(SAMPLE_CSV).byteLength;
  const unclassified = transactions.filter((transaction) =>
    (transaction.kind === "expense" || transaction.kind === "refund") && transaction.category === null).length;
  const lines = [...HEADER];

  PREVIEW_ACCOUNTS.forEach((account, index) => {
    const user = index + 1;
    const sourceId = seedId(1, user, 0);
    const uploadId = seedId(2, user, 0);
    const id = sqlLiteral(account.id);
    const email = sqlLiteral(account.email);

    lines.push("", `-- ${account.plan} 계정`);
    lines.push(insert("auth.users", [
      "instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at",
      "raw_app_meta_data", "raw_user_meta_data", "created_at", "updated_at",
      "confirmation_token", "recovery_token", "email_change_token_new", "email_change",
    ], [
      "'00000000-0000-0000-0000-000000000000'", id, "'authenticated'", "'authenticated'", email,
      `extensions.crypt(${sqlLiteral(PREVIEW_PASSWORD)}, extensions.gen_salt('bf'))`, "now()",
      jsonb({ provider: "email", providers: ["email"] }), jsonb({}), "now()", "now()",
      "''", "''", "''", "''",
    ]));
    lines.push(insert("auth.identities", [
      "id", "user_id", "provider_id", "provider", "identity_data", "last_sign_in_at", "created_at", "updated_at",
    ], [
      id, id, id, "'email'", jsonb({ sub: account.id, email: account.email, email_verified: true }),
      "now()", "now()", "now()",
    ]));
    // handle_new_user 트리거가 Free 프로필을 만든다. Pro만 그 뒤에 올린다.
    if (account.plan === "pro") {
      lines.push(`update public.profiles set plan = 'pro', plan_expires_at = ${sqlLiteral(PRO_EXPIRES_AT)}, plan_updated_at = now() where id = ${id};`);
    }

    lines.push(insert("public.financial_sources", ["id", "user_id", "label", "kind"], [
      sqlLiteral(sourceId), id, "'샘플 카드'", sqlLiteral(SAMPLE_CONTEXT.sourceKind),
    ]));
    lines.push(insert("public.uploads", [
      "id", "user_id", "source_id", "file_hash", "filename", "storage_path", "byte_size", "encoding",
      "column_mapping", "mapping_confidence", "import_context", "status",
      "row_count", "inserted_count", "duplicate_count", "unclassified_count",
    ], [
      sqlLiteral(uploadId), id, sqlLiteral(sourceId), sqlLiteral(SAMPLE_CONTEXT.fileHash),
      "'finsight-sample.csv'", sqlLiteral(`${account.id}/${uploadId}.csv`), sqlLiteral(byteSize), "'utf-8'",
      jsonb(SAMPLE_MAPPING), "1", jsonb({ ...SAMPLE_CONTEXT, sourceId }), "'parsed'",
      sqlLiteral(transactions.length), sqlLiteral(transactions.length), "0", sqlLiteral(unclassified),
    ]));

    for (const transaction of transactions) {
      // 해시는 출처 UUID를 포함하므로 데모의 출처 대신 이 사용자의 출처로 다시 계산한다.
      const parsed: ParsedTransaction = { ...transaction, sourceId };
      lines.push(insert("public.transactions", [
        "id", "user_id", "source_id", "upload_id", "occurred_on", "accounting_month", "merchant_raw",
        "merchant_norm", "amount_krw", "kind", "category", "category_source", "source_transaction_key",
        "data_row_index", "dedupe_hash", "candidate_hash",
      ], [
        sqlLiteral(seedId(3, user, transaction.dataRowIndex)), id, sqlLiteral(sourceId), sqlLiteral(uploadId),
        sqlLiteral(transaction.occurredOn), sqlLiteral(`${transaction.accountingMonth}-01`),
        sqlLiteral(transaction.merchantRaw), sqlLiteral(transaction.merchantNorm), sqlLiteral(transaction.amountKrw),
        sqlLiteral(transaction.kind), sqlLiteral(transaction.category), sqlLiteral(transaction.categorySource),
        sqlLiteral(transaction.sourceTransactionKey), sqlLiteral(transaction.dataRowIndex),
        sqlLiteral(computeDedupeHash(parsed, SAMPLE_CONTEXT.fileHash)), sqlLiteral(computeCandidateHash(parsed)),
      ]));
    }
  });

  return `${lines.join("\n")}\n`;
}
