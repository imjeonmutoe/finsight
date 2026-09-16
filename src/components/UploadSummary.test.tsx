import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UploadSummary } from "./UploadSummary";

const onRestart = vi.fn();

function setup(overrides: Partial<Parameters<typeof UploadSummary>[0]> = {}) {
  return render(
    <UploadSummary
      inserted={34} duplicates={2} classified={27} unclassified={0} monthsHeld={2}
      onRestart={onRestart} {...overrides}
    />,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("업로드 4단계 — 결과 요약", () => {
  it("추가·중복 건수를 축약 없이 보여줍니다", () => {
    setup();

    expect(screen.getByTestId("upload-result")).toHaveTextContent("34건 추가 · 2건 중복");
    expect(screen.getByText(/자동 분류 27건을 마쳤습니다./)).toBeVisible();
  });

  it("대시보드로 가는 경로를 줍니다", () => {
    setup();

    expect(screen.getByRole("link", { name: "대시보드에서 보기" })).toHaveAttribute("href", "/dashboard");
    fireEvent.click(screen.getByRole("button", { name: "다른 파일 올리기" }));
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it("미분류가 남으면 건수와 다음 행동을 함께 줍니다", () => {
    setup({ unclassified: 5 });

    const notice = screen.getByTestId("unclassified-notice");
    expect(notice).toHaveTextContent("분류되지 않은 거래 5건이 남았습니다.");
    expect(notice).toHaveTextContent("대시보드에서 직접 카테고리를 고를 수 있습니다.");
    expect(notice.className).toContain("text-muted");
  });

  it("보유 데이터가 1개월치면 다음 달 업로드를 권합니다", () => {
    setup({ monthsHeld: 1 });

    expect(screen.getByTestId("months-hint")).toHaveTextContent(
      "지난달 명세서도 올려보세요 — 지출 추이를 보려면 2개월 이상이 필요합니다",
    );
  });

  it("2개월 이상이면 권유를 반복하지 않습니다", () => {
    setup({ monthsHeld: 3 });

    expect(screen.queryByTestId("months-hint")).toBeNull();
  });

  it("원본 보관과 다음 단계를 알립니다", () => {
    setup();

    expect(screen.getByText("원본 CSV는 Storage에 보관되며 언제든 다시 파싱할 수 있습니다.")).toBeVisible();
  });
});
