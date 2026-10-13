import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("posthog-js", () => ({ default: { captureException } }));

const { default: DashboardError } = await import("./error");

afterEach(() => {
  vi.clearAllMocks();
});

describe("대시보드 에러 화면", () => {
  it("에러를 PostHog에 보내고 다시 시도하기로 재시도합니다", () => {
    const error = new Error("실패");
    const retry = vi.fn();
    render(<DashboardError error={error} retry={retry} reset={() => undefined} />);

    expect(captureException).toHaveBeenCalledWith(error);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도하기" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
