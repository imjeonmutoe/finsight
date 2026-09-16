import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CategoryBars } from "./CategoryBars";

describe("카테고리별 지출 막대", () => {
  it("카테고리별 원화 전액과 미분류를 표시합니다", () => {
    render(<CategoryBars items={[
      { category: "쇼핑", amountKrw: 1_234_567, count: 2 },
      { category: null, amountKrw: 9_000, count: 1 },
    ]} totalKrw={1_243_567} />);
    expect(screen.getByText("쇼핑")).toBeVisible();
    expect(screen.getByText("미분류")).toBeVisible();
    expect(screen.getByText("₩1,234,567")).toHaveClass("font-mono", "tabular-nums", "text-right");
    expect(screen.getByText("₩9,000")).toHaveClass("font-mono", "tabular-nums", "text-right");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it.each([
    { total: 0, amounts: [0, 0] },
    { total: 0, amounts: [10_000, -10_000] },
    { total: -20_000, amounts: [10_000, -30_000] },
    { total: 10_000, amounts: [30_000, -20_000] },
  ])("순지출 $total 원과 환불이 있어도 막대가 영역을 넘지 않습니다", ({ total, amounts }) => {
    const { container } = render(<CategoryBars items={amounts.map((amountKrw, index) => ({
      category: index === 0 ? "식비" : "쇼핑", amountKrw, count: 1,
    }))} totalKrw={total} />);
    expect(container.querySelectorAll("[style]")).toHaveLength(2);
    for (const element of container.querySelectorAll<HTMLElement>("[style]")) {
      const width = Number.parseFloat(element.style.width);
      expect(Number.isFinite(width)).toBe(true);
      expect(width).toBeGreaterThanOrEqual(0);
      expect(width).toBeLessThanOrEqual(100);
    }
    if (amounts.some((amount) => amount < 0)) {
      expect(screen.getByText(/^-₩/)).toBeVisible();
      expect(screen.getByText("환불이 지출보다 많습니다.")).toBeVisible();
    }
  });

  it("거래가 없을 때 한국어 빈 상태를 표시합니다", () => {
    render(<CategoryBars items={[]} totalKrw={0} />);
    expect(screen.getByText("표시할 카테고리별 지출이 없습니다.")).toBeVisible();
  });

  it("카테고리마다 팔레트 토큰 색을 쓰고 이름·금액을 항상 함께 보여줍니다", () => {
    // 라이트 모드에서 표면 대비가 낮은 색이 있어 색만으로 항목을 구분하면 안 됩니다.
    const markup = renderToStaticMarkup(<CategoryBars items={[
      { category: "식비", amountKrw: 10_000, count: 1 },
      { category: null, amountKrw: 5_000, count: 1 },
    ]} totalKrw={15_000} />);

    expect(markup).toContain("var(--color-category-food)");
    expect(markup).toContain("var(--color-disabled)");
    expect(markup).toContain("식비");
    expect(markup).toContain("₩10,000");
  });

  it("마크업에 하드코딩한 색이 없습니다", () => {
    expect(renderToStaticMarkup(<CategoryBars items={[
      { category: "식비", amountKrw: 10_000, count: 1 },
    ]} totalKrw={10_000} />)).not.toContain("#");
  });
});
