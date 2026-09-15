import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Outlier, Subscription } from "@/types/analytics";
import { DetectionList } from "./DetectionList";

const subscription: Subscription = {
  merchantNorm: "정기서비스", displayName: "정기 서비스", monthlyKrw: 15_900,
  occurrences: 4, lastChargedOn: "2026-04-15", amountIncreased: true,
};
const outlier: Outlier = {
  transactionId: "transaction-1", merchantRaw: "동네 상점", amountKrw: 1_234_567,
  category: "쇼핑", medianKrw: 30_000,
};

describe("구독 누수·이상거래 목록", () => {
  it("탐지 결과의 원화 전액·중앙값·최근 결제일을 표시합니다", () => {
    render(<DetectionList subscriptions={[subscription]} outliers={[outlier]} />);
    expect(screen.getByRole("heading", { name: "정기결제 1건" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "이상거래 1건" })).toBeVisible();
    expect(screen.getByText("정기 서비스")).toBeVisible();
    expect(screen.getByText("동네 상점")).toBeVisible();
    for (const amount of ["₩15,900", "₩1,234,567", "₩30,000"]) {
      expect(screen.getByText(amount)).toHaveClass("font-mono", "tabular-nums");
    }
    expect(screen.getByText("2026.04.15")).toHaveClass("font-mono", "tabular-nums");
    expect(screen.getByText("결제 금액이 인상되었습니다.")).toHaveClass("text-up");
    expect(screen.getByText("결제 금액이 인상되었습니다.")).not.toHaveClass("text-down");
  });

  it("두 목록 모두 제목으로 이름 지어진 영역입니다", () => {
    render(<DetectionList subscriptions={[]} outliers={[]} />);
    expect(screen.getByRole("region", { name: "정기결제 0건" })).toBeVisible();
    expect(screen.getByRole("region", { name: "이상거래 0건" })).toBeVisible();
  });

  it("인상되지 않은 구독에 인상 문구를 붙이지 않습니다", () => {
    render(<DetectionList subscriptions={[{ ...subscription, amountIncreased: false }]} outliers={[]} />);
    expect(screen.queryByText("결제 금액이 인상되었습니다.")).not.toBeInTheDocument();
    expect(screen.getByText("이상거래가 발견되지 않았습니다.")).toBeVisible();
  });

  it("탐지가 0건이면 각 목록의 한국어 빈 상태를 표시합니다", () => {
    render(<DetectionList subscriptions={[]} outliers={[]} />);
    expect(screen.getByText("정기결제가 발견되지 않았습니다.")).toBeVisible();
    expect(screen.getByText("이상거래가 발견되지 않았습니다.")).toBeVisible();
  });

  it("가맹점 문자열을 안전하게 렌더합니다", () => {
    const name = "<script>데이터</script>";
    const { container } = render(<DetectionList
      subscriptions={[{ ...subscription, displayName: name }]}
      outliers={[{ ...outlier, merchantRaw: name }]}
    />);
    expect(screen.getAllByText(name)).toHaveLength(2);
    expect(container.querySelector("script")).toBeNull();
  });

  it("마크업에 하드코딩한 색이 없습니다", () => {
    expect(renderToStaticMarkup(<DetectionList subscriptions={[subscription]} outliers={[outlier]} />))
      .not.toContain("#");
  });
});
