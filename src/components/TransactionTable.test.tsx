import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Transaction } from "@/types/transaction";
import { TransactionTable } from "./TransactionTable";

const transaction: Transaction = {
  id: "transaction-1", userId: "user-1", sourceId: "source-1", uploadId: "upload-1",
  occurredOn: "2026-04-15", accountingMonth: "2026-04",
  merchantRaw: "동네 상점", merchantNorm: "동네상점", amountKrw: 1_234_567,
  kind: "expense", category: null, categorySource: null,
  sourceTransactionKey: null, dataRowIndex: 0, dedupeHash: "dedupe", candidateHash: "candidate",
};

describe("거래 내역 표", () => {
  it("날짜·유형·미분류와 원화 전액을 표시하고 금액 열을 우측 정렬합니다", () => {
    render(<TransactionTable transactions={[transaction]} />);
    const table = screen.getByRole("table", { name: "거래 내역" });
    expect(within(table).getByText("2026.04.15")).toHaveClass("font-mono", "tabular-nums");
    expect(within(table).getByText("동네 상점")).toBeVisible();
    expect(within(table).getByText("지출")).toBeVisible();
    expect(within(table).getByText("미분류")).toBeVisible();
    expect(within(table).getByText("₩1,234,567")).toHaveClass("font-mono", "tabular-nums", "text-right");
    expect(within(table).getByRole("columnheader", { name: "금액" })).toHaveClass("text-right");
    expect(table).not.toHaveTextContent("user-1");
    expect(table).not.toHaveTextContent("source-1");
  });

  it.each([
    { kind: "income", label: "수입" },
    { kind: "refund", label: "환불" },
    { kind: "transfer", label: "이체" },
  ] as const)("$kind 유형을 한국어로 표시하고 저장된 절댓값을 보존합니다", ({ kind, label }) => {
    render(<TransactionTable transactions={[{ ...transaction, kind, category: "쇼핑" }]} />);
    expect(screen.getByText(label)).toBeVisible();
    expect(screen.getByText("쇼핑")).toBeVisible();
    expect(screen.getByText("₩1,234,567")).toBeVisible();
  });

  it("가맹점의 임의 문자열을 HTML로 실행하지 않고 텍스트로 표시합니다", () => {
    const merchantRaw = '<img src=x onerror="alert(1)">';
    const { container } = render(<TransactionTable transactions={[{ ...transaction, merchantRaw }]} />);
    expect(screen.getByText(merchantRaw)).toBeVisible();
    expect(container.querySelector("img")).toBeNull();
  });

  it("좁은 폭에서는 유형·카테고리 열을 접어 금액까지 한 화면에 넣습니다", () => {
    // 가로 스크롤 컨테이너 안에서 금액 열이 화면 밖으로 밀리면, 오버레이 스크롤바 환경에서는
    // 스크롤이 된다는 표시조차 없어 사용자가 보러 온 열이 그냥 사라진 것처럼 보입니다.
    render(<TransactionTable transactions={[{ ...transaction, category: "쇼핑" }]} />);
    const table = screen.getByRole("table", { name: "거래 내역" });
    expect(table).not.toHaveClass("min-w-xl");
    for (const name of ["유형", "카테고리"]) {
      expect(within(table).getByRole("columnheader", { name })).toHaveClass("hidden", "sm:table-cell");
    }
    expect(within(table).getByText("지출 · 쇼핑")).toHaveClass("sm:hidden");
  });

  it("거래가 없으면 한국어 빈 상태를 표시합니다", () => {
    render(<TransactionTable transactions={[]} />);
    expect(screen.getByText("표시할 거래 내역이 없습니다.")).toBeVisible();
  });

  it("마크업에 하드코딩한 색이 없습니다", () => {
    expect(renderToStaticMarkup(<TransactionTable transactions={[transaction]} />)).not.toContain("#");
  });
});
