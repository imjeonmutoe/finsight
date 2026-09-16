import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MonthlySummary } from "@/types/analytics";
import { TrendChart } from "./TrendChart";

const months: MonthlySummary[] = [
  { month: "2026-02", totalKrw: 300_000, byCategory: [{ category: "식비", amountKrw: 300_000, count: 3 }] },
  { month: "2026-03", totalKrw: 0, byCategory: [] },
  { month: "2026-04", totalKrw: 415_900, byCategory: [
    { category: "구독/멤버십", amountKrw: 15_900, count: 1 },
    { category: "식비", amountKrw: 400_000, count: 2 },
  ] },
];

describe("기간별 추이", () => {
  it("월 라벨과 최근 달 총지출을 전액으로 표시합니다", () => {
    render(<TrendChart months={months} />);

    const bars = screen.getByTestId("trend-bars");
    expect(within(bars).getByText("2월")).toBeVisible();
    expect(within(bars).getByText("4월")).toBeVisible();
    expect(screen.getByText("₩415,900")).toHaveClass("font-mono", "tabular-nums");
  });

  it("카테고리별 월 지출을 표로 함께 보여줍니다", () => {
    render(<TrendChart months={months} />);
    const table = screen.getByRole("table", { name: "카테고리별 월 지출" });

    expect(within(table).getByRole("rowheader", { name: /식비/ })).toBeVisible();
    expect(within(table).getByRole("rowheader", { name: /구독\/멤버십/ })).toBeVisible();
    expect(within(table).getByText("₩300,000")).toBeVisible();
    expect(within(table).getByText("₩400,000")).toBeVisible();
  });

  it("전월 대비 증감을 색이 아니라 부호와 낱말로도 전달합니다", () => {
    render(<TrendChart months={months} />);
    const table = screen.getByRole("table", { name: "카테고리별 월 지출" });

    expect(within(table).getByText("+₩400,000")).toHaveClass("text-up");
    expect(within(table).getAllByText("증가").length).toBeGreaterThan(0);
  });

  it("환불이 더 많아 순액이 음수인 달도 그대로 표시합니다", () => {
    render(<TrendChart months={[
      { month: "2026-03", totalKrw: 50_000, byCategory: [{ category: "쇼핑", amountKrw: 50_000, count: 1 }] },
      { month: "2026-04", totalKrw: -20_000, byCategory: [{ category: "쇼핑", amountKrw: -20_000, count: 1 }] },
    ]} />);

    const table = screen.getByRole("table", { name: "카테고리별 월 지출" });
    expect(within(table).getByText("-₩20,000")).toBeVisible();
    expect(within(table).getByText("-₩70,000")).toHaveClass("text-down");
    expect(screen.getByText("환불이 지출보다 많은 달이 있어 막대는 크기만 나타냅니다.")).toBeVisible();
  });

  it("창 안에서 지출이 없던 카테고리는 행을 만들지 않습니다", () => {
    render(<TrendChart months={months} />);
    const table = screen.getByRole("table", { name: "카테고리별 월 지출" });

    expect(within(table).queryByText("교통")).toBeNull();
    expect(within(table).getAllByRole("rowheader")).toHaveLength(2);
  });

  it("막대가 영역을 넘지 않습니다", () => {
    const { container } = render(<TrendChart months={months} />);

    for (const bar of container.querySelectorAll<HTMLElement>("[data-testid='trend-bar']")) {
      const height = Number.parseFloat(bar.style.height);
      expect(Number.isFinite(height)).toBe(true);
      expect(height).toBeGreaterThanOrEqual(0);
      expect(height).toBeLessThanOrEqual(100);
    }
  });

  it("표시할 달이 없으면 한국어 빈 상태를 표시합니다", () => {
    render(<TrendChart months={[]} />);

    expect(screen.getByText("표시할 기간별 추이가 없습니다.")).toBeVisible();
  });

  it("색을 hex로 하드코딩하지 않고 팔레트 토큰만 참조합니다", () => {
    const markup = renderToStaticMarkup(<TrendChart months={months} />);

    expect(markup).not.toMatch(/#[0-9a-fA-F]{6}/);
    expect(markup).toContain("var(--color-category-food)");
  });
});
