import { CATEGORIES } from "@/types/category";
import type { Category } from "@/types/category";
import type { CategorySource, Transaction, TransactionKind } from "@/types/transaction";

const won = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW" });
const kindLabels: Record<TransactionKind, string> = {
  expense: "지출", income: "수입", refund: "환불", transfer: "이체",
};
const KINDS = Object.keys(kindLabels) as TransactionKind[];
// 무엇을 코드가 정했고 무엇을 모델이 정했는지 보이면 확인이 필요한 곳으로 시선이 먼저 간다.
const sourceLabels: Record<CategorySource, string> = {
  user: "내 규칙", rule: "가맹점 사전", ai: "Claude",
};
const SELECT = "rounded-md border border-border-default bg-bg px-2 py-1 text-sm text-text disabled:text-disabled focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function TransactionTable({ transactions, onCategoryChange, onKindChange, pendingId = null }: {
  transactions: Transaction[];
  /** 두 콜백이 함께 있을 때만 수정 모드가 된다. 데모 화면은 읽기 전용으로 쓴다. */
  onCategoryChange?: (id: string, category: Category) => void;
  onKindChange?: (id: string, kind: TransactionKind) => void;
  pendingId?: string | null;
}) {
  if (transactions.length === 0) {
    return <p className="text-sm leading-relaxed text-muted">표시할 거래 내역이 없습니다.</p>;
  }

  // 폰 폭에서는 열 하나를 접어야 금액까지 한 화면에 들어간다. 가로로 밀어두면 오버레이
  // 스크롤바 환경에서 금액 열이 스크롤 표시도 없이 화면 밖에 남는다. 읽기 전용에서는
  // 유형·카테고리 열을 접고, 수정 모드에서는 그 둘을 열로 세우지 않고 가맹점 칸 안에 모은다
  // — 좁은 폭에서 셀렉트를 열로 세우면 값 글자가 잘려 무엇이 골라져 있는지 읽히지 않는다.
  const editable = onCategoryChange !== undefined && onKindChange !== undefined;
  const folded = "hidden px-3 py-3 sm:table-cell sm:px-5";
  const open = "px-3 py-3 sm:px-5";

  return (
    <div className="overflow-x-auto rounded-md border border-border-default bg-surface">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">거래 내역</caption>
        <thead className="bg-surface-2 text-xs font-medium text-muted">
          <tr>
            <th scope="col" className={`font-medium ${editable ? folded : open}`}>날짜</th>
            <th scope="col" className="px-3 py-3 font-medium sm:px-5">{editable ? "가맹점 · 분류" : "가맹점"}</th>
            {!editable && <th scope="col" className={`font-medium ${folded}`}>유형</th>}
            {!editable && <th scope="col" className={`font-medium ${folded}`}>카테고리</th>}
            <th scope="col" className="px-3 py-3 text-right font-medium sm:px-5">금액</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => {
            const occurredOn = transaction.occurredOn.replaceAll("-", ".");
            const classifiable = transaction.kind === "expense" || transaction.kind === "refund";
            const saving = pendingId === transaction.id;
            return (
              // 요약 문장의 근거 거래 링크가 이 id로 찾아온다.
              <tr
                key={transaction.id}
                id={`transaction-${transaction.id}`}
                className="border-b border-border-default last:border-b-0 hover:bg-surface-2"
              >
                <td className={`font-mono whitespace-nowrap tabular-nums text-muted ${editable ? folded : open}`}>
                  {occurredOn}
                </td>
                <td className="max-w-xs px-3 py-3 text-text sm:px-5">
                  {transaction.merchantRaw}
                  {editable ? (
                    <>
                      <span className="mt-1 block font-mono text-xs leading-relaxed tabular-nums text-muted sm:hidden">
                        {occurredOn}
                      </span>
                      <span className="mt-2 flex flex-wrap items-center gap-2">
                        <select
                          aria-label={`${transaction.merchantRaw} 거래 유형`}
                          className={SELECT}
                          value={transaction.kind}
                          disabled={saving}
                          onChange={(event) => onKindChange(transaction.id, event.target.value as TransactionKind)}
                        >
                          {KINDS.map((kind) => <option key={kind} value={kind}>{kindLabels[kind]}</option>)}
                        </select>
                        <select
                          aria-label={`${transaction.merchantRaw} 카테고리`}
                          className={SELECT}
                          value={transaction.category ?? ""}
                          disabled={saving || !classifiable}
                          onChange={(event) => onCategoryChange(transaction.id, event.target.value as Category)}
                        >
                          {transaction.category === null && <option value="">미분류</option>}
                          {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                        </select>
                        {transaction.categorySource !== null && (
                          <span className="text-xs leading-relaxed whitespace-nowrap text-muted">
                            {sourceLabels[transaction.categorySource]}
                          </span>
                        )}
                      </span>
                    </>
                  ) : (
                    <span className="mt-1 block text-xs leading-relaxed text-muted sm:hidden">
                      {kindLabels[transaction.kind]} · {transaction.category ?? "미분류"}
                    </span>
                  )}
                </td>
                {!editable && (
                  <td className={`whitespace-nowrap text-muted ${folded}`}>{kindLabels[transaction.kind]}</td>
                )}
                {!editable && (
                  <td className={`space-y-1 ${folded}`}>
                    <span className={`block whitespace-nowrap ${transaction.category === null ? "text-muted" : "text-text-body"}`}>
                      {transaction.category ?? "미분류"}
                    </span>
                    {transaction.categorySource !== null && (
                      <span className="block text-xs leading-relaxed whitespace-nowrap text-muted">
                        {sourceLabels[transaction.categorySource]}
                      </span>
                    )}
                  </td>
                )}
                <td className="px-3 py-3 text-right font-mono whitespace-nowrap tabular-nums text-text sm:px-5">
                  {won.format(transaction.amountKrw)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
