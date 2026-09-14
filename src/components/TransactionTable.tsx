import type { Transaction, TransactionKind } from "@/types/transaction";

const won = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW" });
const kindLabels: Record<TransactionKind, string> = {
  expense: "지출", income: "수입", refund: "환불", transfer: "이체",
};

export function TransactionTable({ transactions }: { transactions: Transaction[] }) {
  if (transactions.length === 0) {
    return <p className="text-sm leading-relaxed text-muted">표시할 거래 내역이 없습니다.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border-default bg-surface">
      <table className="w-full min-w-xl border-collapse text-left text-sm">
        <caption className="sr-only">거래 내역</caption>
        <thead className="bg-surface-2 text-xs font-medium text-muted">
          <tr>
            <th scope="col" className="px-5 py-3 font-medium">날짜</th>
            <th scope="col" className="px-5 py-3 font-medium">가맹점</th>
            <th scope="col" className="px-5 py-3 font-medium">유형</th>
            <th scope="col" className="px-5 py-3 font-medium">카테고리</th>
            <th scope="col" className="px-5 py-3 text-right font-medium">금액</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => (
            <tr key={transaction.id} className="border-b border-border-default last:border-b-0 hover:bg-surface-2">
              <td className="px-5 py-3 font-mono whitespace-nowrap tabular-nums text-muted">{transaction.occurredOn.replaceAll("-", ".")}</td>
              <td className="max-w-xs px-5 py-3 text-text">{transaction.merchantRaw}</td>
              <td className="px-5 py-3 whitespace-nowrap text-muted">{kindLabels[transaction.kind]}</td>
              <td className="px-5 py-3 whitespace-nowrap text-text-body">{transaction.category ?? "미분류"}</td>
              <td className="px-5 py-3 text-right font-mono whitespace-nowrap tabular-nums text-text">{won.format(transaction.amountKrw)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
