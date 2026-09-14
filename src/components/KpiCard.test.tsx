import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KpiCard } from "./KpiCard";

describe("지출 지표 카드", () => {
  it("원화 전액과 라벨·설명을 표시하고 숫자 서체로 정렬합니다", () => {
    render(<KpiCard label="이번 달 총지출" amountKrw={1_234_567} hint="지출에서 환불을 차감했습니다." />);
    expect(screen.getByText("이번 달 총지출")).toBeVisible();
    expect(screen.getByText("₩1,234,567")).toHaveClass("font-mono", "tabular-nums", "text-text");
    expect(screen.getByText("지출에서 환불을 차감했습니다.")).toBeVisible();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it.each([
    { delta: 12.4, text: "+12.4%", color: "text-up", opposite: "text-down", direction: "증가" },
    { delta: -12.4, text: "-12.4%", color: "text-down", opposite: "text-up", direction: "감소" },
    { delta: 0, text: "0%", color: "text-muted", opposite: "text-up", direction: "변동 없음" },
  ])("증감 $delta 에 $color 를 적용합니다", ({ delta, text, color, opposite, direction }) => {
    render(<KpiCard label="전월 대비 증감" amountKrw={0} deltaPercent={delta} />);
    expect(screen.getByText(text)).toHaveClass(color, "font-mono", "tabular-nums");
    expect(screen.getByText(text)).not.toHaveClass(opposite);
    expect(screen.getByText(direction)).toBeVisible();
    if (delta === 0) expect(screen.getByText(text)).not.toHaveClass("text-down");
  });

  it.each([0, -1_234_567])("0원·음수 순지출도 원화로 표시합니다: %s", (amountKrw) => {
    render(<KpiCard label="총지출" amountKrw={amountKrw} />);
    expect(screen.getByText(amountKrw === 0 ? "₩0" : "-₩1,234,567")).toBeVisible();
  });

  it("마크업에 하드코딩한 색이 없습니다", () => {
    expect(renderToStaticMarkup(<KpiCard label="총지출" amountKrw={1_234_567} deltaPercent={10} />))
      .not.toContain("#");
  });
});
