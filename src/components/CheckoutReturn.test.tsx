import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckoutReturn } from "./CheckoutReturn";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

/** 폴링은 한 번에 하나씩 예약되므로 간격 단위로 밀어야 다음 시도가 걸립니다. */
async function advanceUntilTimeout() {
  for (let round = 0; round < 12; round += 1) await advance(1_500);
}

describe("결제 복귀", () => {
  it("웹훅을 기다리는 동안 무엇을 하는 중인지 알려줍니다", () => {
    render(<CheckoutReturn plan="free" />);

    expect(screen.getByRole("status")).toHaveTextContent("결제를 확인하는 중입니다");
  });

  it("플랜을 다시 읽어 오며 기다립니다", async () => {
    render(<CheckoutReturn plan="free" />);

    await advance(1_500);
    expect(refresh).toHaveBeenCalledTimes(1);

    await advance(1_500);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("Pro가 되면 폴링을 멈추고 방금 열린 화면으로 보냅니다", async () => {
    const { rerender } = render(<CheckoutReturn plan="free" />);
    await advance(1_500);
    const before = refresh.mock.calls.length;

    rerender(<CheckoutReturn plan="pro" />);

    expect(screen.getByRole("status")).toHaveTextContent("Pro가 활성화되었습니다");
    expect(screen.getByRole("link", { name: "대시보드로" })).toHaveAttribute("href", "/dashboard");
    await advance(5_000);
    expect(refresh).toHaveBeenCalledTimes(before);
  });

  it("처음부터 Pro면 폴링하지 않습니다", async () => {
    render(<CheckoutReturn plan="pro" />);

    await advance(5_000);

    expect(refresh).not.toHaveBeenCalled();
  });

  it("10초가 지나면 무한 폴링하지 않고 다음 행동을 줍니다", async () => {
    render(<CheckoutReturn plan="free" />);

    await advanceUntilTimeout();
    const stopped = refresh.mock.calls.length;
    await advance(12_000);

    expect(screen.getByRole("status")).toHaveTextContent("아직 결제 확인이 오지 않았습니다");
    expect(refresh).toHaveBeenCalledTimes(stopped);
    expect(screen.getByRole("button", { name: "다시 확인하기" })).toBeVisible();
  });

  it("다시 확인하기를 누르면 폴링을 한 번 더 시작합니다", async () => {
    render(<CheckoutReturn plan="free" />);
    await advanceUntilTimeout();
    const stopped = refresh.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "다시 확인하기" }));
    await advance(1_500);

    expect(refresh.mock.calls.length).toBeGreaterThan(stopped);
    expect(screen.getByRole("status")).toHaveTextContent("결제를 확인하는 중입니다");
  });

  it("기다리는 동안을 에러로 표시하지 않습니다", async () => {
    // 대기는 실패가 아닙니다. 에러색(up)은 실패와 이상거래에만 씁니다.
    render(<CheckoutReturn plan="free" />);
    await advanceUntilTimeout();

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status").className).not.toContain("text-up");
  });
});
