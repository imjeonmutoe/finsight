import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InsightPanel } from "./InsightPanel";

const insight = {
  headline: "4월에는 구독 지출이 늘었습니다.",
  items: [
    { text: "구독/멤버십에 ₩15,900을 썼습니다.", transactionIds: ["transaction-1", "transaction-2"] },
    { text: "쇼핑에 ₩400,000을 썼습니다.", transactionIds: ["transaction-3"] },
  ],
};

describe("AI 월간 요약", () => {
  it("요약 문장마다 근거 거래로 가는 링크를 붙입니다", () => {
    render(<InsightPanel insight={insight} plan="free" />);

    expect(screen.getByRole("heading", { name: "AI 월간 요약" })).toBeVisible();
    expect(screen.getByText("4월에는 구독 지출이 늘었습니다.")).toBeVisible();
    expect(screen.getByRole("link", { name: "근거 거래 2건 보기" })).toHaveAttribute("href", "#transaction-transaction-1");
    expect(screen.getByRole("link", { name: "근거 거래 1건 보기" })).toHaveAttribute("href", "#transaction-transaction-3");
  });

  it("근거로 링크되지 않는 문장은 화면에 올리지 않습니다", () => {
    render(<InsightPanel insight={{ headline: "요약입니다.", items: [
      { text: "근거 없는 문장입니다.", transactionIds: [] },
    ] }} plan="free" />);

    expect(screen.queryByText("근거 없는 문장입니다.")).toBeNull();
    expect(screen.getByText("근거 거래를 연결할 수 있는 문장이 없습니다.")).toBeVisible();
  });

  it("숫자의 출처를 밝히고 Free에게는 Pro에서 무엇이 더해지는지 알립니다", () => {
    render(<InsightPanel insight={insight} plan="free" />);

    expect(screen.getByText(/숫자는 모두 코드로 계산한 값이며, 요약 문장은 그 값을 근거로 작성됩니다./)).toBeVisible();
    expect(screen.getByText(/Pro는 추이·구독·이상거래까지 입력에 더해 절약 제안을 받습니다./)).toBeVisible();
  });

  it("Pro에게는 Free 안내를 반복하지 않습니다", () => {
    render(<InsightPanel insight={insight} plan="pro" />);

    expect(screen.queryByText(/Pro는 추이·구독·이상거래까지/)).toBeNull();
  });

  it("생성에 실패해도 원인과 다음 행동을 주고 나머지 화면을 막지 않습니다", () => {
    render(<InsightPanel insight={null} plan="free" />);

    const message = screen.getByText(/AI 월간 요약을 만들지 못했습니다./);
    expect(message).toBeVisible();
    expect(message).toHaveTextContent("나머지 지출 요약은 그대로 볼 수 있습니다.");
    expect(message).toHaveClass("text-up");
  });

  it("모델이 쓴 문장을 HTML로 실행하지 않고 텍스트로 표시합니다", () => {
    // 인사이트 문장에는 사용자가 올린 CSV에서 온 임의 문자열이 섞일 수 있습니다.
    const text = '<img src=x onerror="alert(1)">';
    const { container } = render(<InsightPanel insight={{ headline: text, items: [
      { text, transactionIds: ["transaction-1"] },
    ] }} plan="free" />);

    expect(screen.getAllByText(text)).toHaveLength(2);
    expect(container.querySelector("img")).toBeNull();
  });

  it("마크업에 하드코딩한 색이 없습니다", () => {
    expect(renderToStaticMarkup(<InsightPanel insight={insight} plan="pro" />)).not.toContain("#transaction-transaction-9");
    expect(renderToStaticMarkup(<InsightPanel insight={insight} plan="pro" />)).not.toMatch(/#[0-9a-fA-F]{6}/);
  });
});
