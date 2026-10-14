import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmptyDashboard } from "./EmptyDashboard";

describe("대시보드 빈 상태", () => {
  it("무엇을 하면 되는지와 업로드 경로를 함께 줍니다", () => {
    render(<EmptyDashboard />);

    expect(screen.getByRole("heading", { name: "아직 올린 명세서가 없습니다" })).toBeVisible();
    expect(screen.getByText(/명세서 CSV를 올리면 지출을 분석해 드립니다./)).toBeVisible();
    expect(screen.getByRole("link", { name: "명세서 올리기" })).toHaveAttribute("href", "/dashboard/upload");
  });

  it("파일이 아직 없는 사람에게도 다음 행동을 줍니다", () => {
    render(<EmptyDashboard />);

    expect(screen.getByRole("link", { name: "샘플 대시보드 보기" })).toHaveAttribute("href", "/demo");
  });

  it("클릭 수집에 버튼 이름을 붙입니다", () => {
    render(<EmptyDashboard />);

    expect(screen.getByRole("link", { name: "명세서 올리기" })).toHaveAttribute("data-ph-capture-attribute-cta", "empty_upload");
    expect(screen.getByRole("link", { name: "샘플 대시보드 보기" })).toHaveAttribute("data-ph-capture-attribute-cta", "empty_demo");
  });

  it("카드·은행 내려받기 경로를 펼친 상태로 보여줍니다", () => {
    render(<EmptyDashboard />);
    const guide = screen.getByTestId("csv-guide");

    expect(guide).toHaveAttribute("open");
    expect(within(guide).getByText(/이용내역 조회 또는 이용대금명세서 → 엑셀 내려받기/)).toBeVisible();
    expect(within(guide).getByText(/거래내역 조회 → 엑셀 내려받기/)).toBeVisible();
  });

  it("카드사 주소를 링크로 걸지 않습니다", () => {
    // 카드사 URL은 자주 바뀐다. 죽은 링크보다 경로 설명이 오래 간다.
    const guide = render(<EmptyDashboard />).container.querySelector("[data-testid='csv-guide']");

    expect(guide?.querySelectorAll("a")).toHaveLength(0);
  });

  it("마크업에 하드코딩한 색이 없습니다", () => {
    expect(renderToStaticMarkup(<EmptyDashboard />)).not.toContain("#");
  });
});
