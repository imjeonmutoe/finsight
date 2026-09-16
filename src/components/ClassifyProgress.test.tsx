import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClassifyProgress } from "./ClassifyProgress";

const onRetry = vi.fn();

function setup(overrides: Partial<Parameters<typeof ClassifyProgress>[0]> = {}) {
  return render(
    <ClassifyProgress
      inserted={34} duplicates={2} total={27} classified={18} remaining={9}
      error={null} onRetry={onRetry} {...overrides}
    />,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("업로드 3단계 — 분류 진행률", () => {
  it("분류를 기다리기 전에 파싱 결과를 먼저 보여줍니다", () => {
    setup();
    const result = screen.getByTestId("parse-result");

    expect(result).toHaveTextContent("34건 추가 · 2건 중복");
    expect(result).toHaveTextContent("거래는 이미 저장했습니다.");
  });

  it("무엇을 하는 중인지와 남은 양을 함께 알립니다", () => {
    setup();

    expect(screen.getByText("거래를 분류하는 중입니다.")).toBeVisible();
    expect(screen.getByTestId("classify-progress-text")).toHaveTextContent("27건 중 18건을 분류했습니다.");
    const bar = screen.getByRole("progressbar", { name: "분류 진행률" });
    expect(bar).toHaveAttribute("aria-valuenow", "18");
    expect(bar).toHaveAttribute("aria-valuemax", "27");
  });

  it("진행률을 색만으로 전달하지 않고 숫자로도 보여줍니다", () => {
    setup();

    expect(screen.getByText("67%")).toHaveClass("font-mono", "tabular-nums");
  });

  it("중간 이탈해도 이어진다는 사실을 문구로 알립니다", () => {
    setup();

    expect(screen.getByText(
      /중간에 창을 닫아도 미분류 거래는 그대로 남아 다음 방문에 이어서 분류됩니다./,
    )).toBeVisible();
  });

  it("분류할 거래가 없으면 기다리게 하지 않습니다", () => {
    setup({ total: 0, classified: 0, remaining: 0 });

    expect(screen.getByText("규칙으로 모두 분류했습니다. 모델을 호출하지 않았습니다.")).toBeVisible();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("실패하면 원인과 다음 행동을 주고 자동으로 반복하지 않습니다", () => {
    setup({ error: "일부 거래를 분류하지 못했습니다. 거래 탭에서 직접 카테고리를 고를 수 있습니다." });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("거래 탭에서 직접 카테고리를 고를 수 있습니다.");
    expect(screen.getByRole("link", { name: "대시보드에서 직접 고치기" })).toHaveAttribute("href", "/dashboard");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도하기" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("진행 중에는 재시도 버튼을 보이지 않습니다", () => {
    setup();

    expect(screen.queryByRole("button", { name: "다시 시도하기" })).toBeNull();
  });

  it("금액을 표시하지 않아 캡처로도 거래 내용이 새지 않습니다", () => {
    const { container } = setup();

    expect(container.textContent).not.toContain("₩");
  });
});
