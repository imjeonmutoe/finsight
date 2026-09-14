// 데모 전용 집계다. 대시보드(step 8)는 `queries.ts`를 쓴다.
// DB가 없는 이 경로에서만 SQL의 월별 합계·중앙값을 메모리로 계산합니다.
import type { MonthlySummary, Outlier, Subscription } from "@/types/analytics";
import { CATEGORIES } from "@/types/category";
import type { Category } from "@/types/category";
import type { Transaction } from "@/types/transaction";
import { detectOutliers, detectSubscriptions } from "../analytics";
import { buildTransactions, parseCsvRows } from "../csv";
import { computeCandidateHash, computeDedupeHash, computeFileHash } from "../dedupe";
import { decodeCsv, detectEncoding } from "../encoding";
import { classifyByRule } from "../merchant-rules";
import { SAMPLE_CONTEXT, SAMPLE_CSV, SAMPLE_MAPPING } from "./sample-csv";

export type DemoDataset = {
  transactions: Transaction[];
  months: MonthlySummary[];
  currentMonth: MonthlySummary;
  subscriptions: Subscription[];
  outliers: Outlier[];
  unclassifiedCount: number;
};

function summarizeMonths(transactions: Transaction[]): MonthlySummary[] {
  const months = new Map<string, MonthlySummary>();
  for (const transaction of transactions) {
    if (transaction.kind !== "expense" && transaction.kind !== "refund") continue;
    const month = months.get(transaction.accountingMonth) ?? {
      month: transaction.accountingMonth, totalKrw: 0, byCategory: [],
    };
    const amountKrw = transaction.kind === "refund" ? -transaction.amountKrw : transaction.amountKrw;
    month.totalKrw += amountKrw;
    const category = month.byCategory.find((item) => item.category === transaction.category);
    if (category) {
      category.amountKrw += amountKrw;
      category.count += 1;
    } else {
      month.byCategory.push({ category: transaction.category, amountKrw, count: 1 });
    }
    months.set(month.month, month);
  }

  for (const month of months.values()) {
    // SQL의 category COLLATE "C" NULLS LAST와 같은 순서입니다.
    month.byCategory.sort((left, right) => {
      if (left.category === right.category) return 0;
      if (left.category === null) return 1;
      if (right.category === null) return -1;
      return left.category < right.category ? -1 : 1;
    });
  }
  return [...months.values()].sort((left, right) => left.month.localeCompare(right.month));
}

function categoryMedians(transactions: Transaction[]): Record<Category, number> {
  const amounts = new Map<Category, number[]>();
  for (const transaction of transactions) {
    if (transaction.kind !== "expense" || transaction.category === null) continue;
    const values = amounts.get(transaction.category) ?? [];
    values.push(transaction.amountKrw);
    amounts.set(transaction.category, values);
  }

  // 모든 카테고리 키를 채우며, SQL과 같이 표본 3건 미만은 0으로 돌려줍니다.
  return Object.fromEntries(CATEGORIES.map((category) => {
    const values = (amounts.get(category) ?? []).sort((left, right) => left - right);
    if (values.length < 3) return [category, 0];
    const lower = values[Math.floor((values.length - 1) / 2)];
    const upper = values[Math.floor(values.length / 2)];
    if (lower === undefined || upper === undefined) {
      throw new Error("데모 중앙값을 계산하지 못했습니다. 샘플 거래를 확인해 주세요.");
    }
    // SQL round(avg(amount_krw))와 같은 원 단위 반올림. 소수 금액을 만들지 않습니다.
    return [category, Number((BigInt(lower) + BigInt(upper) + 1n) / 2n)];
  })) as Record<Category, number>;
}

export function buildDemoDataset(): DemoDataset {
  const bytes = new TextEncoder().encode(SAMPLE_CSV);
  const encoding = detectEncoding(bytes);
  const rows = parseCsvRows(decodeCsv(bytes, encoding));
  const fileHash = computeFileHash(bytes);
  const parsed = buildTransactions(rows, SAMPLE_MAPPING, { ...SAMPLE_CONTEXT, fileHash });
  const transactions: Transaction[] = parsed.map((transaction) => {
    // DB의 사용자 규칙(①)과 Claude(③)는 없으며 내장 사전(②)만 적용합니다.
    const category = transaction.kind === "expense" || transaction.kind === "refund"
      ? classifyByRule(transaction.merchantNorm) : null;
    return {
      ...transaction,
      id: `demo-${transaction.dataRowIndex}`,
      userId: "demo-user",
      uploadId: "demo-upload",
      dedupeHash: computeDedupeHash(transaction, fileHash),
      candidateHash: computeCandidateHash(transaction),
      category,
      categorySource: category === null ? null : "rule",
    };
  });
  const months = summarizeMonths(transactions);
  const currentMonth = months.at(-1);
  if (currentMonth === undefined) {
    throw new Error("데모 월별 지출을 만들지 못했습니다. 샘플 거래를 확인해 주세요.");
  }

  return {
    transactions,
    months,
    currentMonth,
    subscriptions: detectSubscriptions(transactions),
    outliers: detectOutliers(transactions, categoryMedians(transactions)),
    unclassifiedCount: transactions.filter((transaction) =>
      (transaction.kind === "expense" || transaction.kind === "refund") && transaction.category === null).length,
  };
}
