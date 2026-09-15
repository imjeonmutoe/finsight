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
      {/* 폰 폭에서는 유형·카테고리를 가맹점 셀 아래로 접습니다. 가로로 밀어두면 오버레이
          스크롤바 환경에서 금액 열이 스크롤 표시도 없이 화면 밖에 남습니다. */}
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">거래 내역</caption>
        <thead className="bg-surface-2 text-xs font-medium text-muted">
          <tr>
            <th scope="col" className="px-3 py-3 font-medium sm:px-5">날짜</th>
            <th scope="col" className="px-3 py-3 font-medium sm:px-5">가맹점</th>
            <th scope="col" className="hidden px-3 py-3 font-medium sm:table-cell sm:px-5">유형</th>
            <th scope="col" className="hidden px-3 py-3 font-medium sm:table-cell sm:px-5">카테고리</th>
            <th scope="col" className="px-3 py-3 text-right font-medium sm:px-5">금액</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => (
            <tr key={transaction.id} className="border-b border-border-default last:border-b-0 hover:bg-surface-2">
              <td className="px-3 py-3 font-mono whitespace-nowrap tabular-nums text-muted sm:px-5">{transaction.occurredOn.replaceAll("-", ".")}</td>
              <td className="max-w-xs px-3 py-3 text-text sm:px-5">
                {transaction.merchantRaw}
                <span className="mt-1 block text-xs leading-relaxed text-muted sm:hidden">
                  {kindLabels[transaction.kind]} · {transaction.category ?? "미분류"}
                </span>
              </td>
              <td className="hidden px-3 py-3 whitespace-nowrap text-muted sm:table-cell sm:px-5">{kindLabels[transaction.kind]}</td>
              <td className="hidden px-3 py-3 whitespace-nowrap text-text-body sm:table-cell sm:px-5">{transaction.category ?? "미분류"}</td>
              <td className="px-3 py-3 text-right font-mono whitespace-nowrap tabular-nums text-text sm:px-5">{won.format(transaction.amountKrw)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
