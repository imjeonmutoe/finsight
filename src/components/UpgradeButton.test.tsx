import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UpgradeButton } from "./UpgradeButton";

const assign = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom의 location.assign은 "Not implemented"를 던집니다. 이동 대상만 확인합니다.
  Object.defineProperty(window, "location", {
    configurable: true, writable: true, value: { ...window.location, assign },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(response: { ok: boolean; body: unknown }) {
  const fetchMock = vi.fn(async () => ({
    ok: response.ok, json: async () => response.body,
  } as unknown as Response));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Pro 업그레이드 버튼", () => {
  it("가격과 해지 조건을 버튼 옆에 같이 보여줍니다", () => {
    render(<UpgradeButton />);

    expect(screen.getByRole("button", { name: "Pro 시작하기" })).toBeVisible();
    expect(screen.getByText(/₩9,900/)).toBeVisible();
    expect(screen.getByText(/언제든 해지/)).toBeVisible();
  });

  it("누르면 체크아웃을 만들고 Polar으로 보냅니다", async () => {
    const fetchMock = mockFetch({ ok: true, body: { url: "https://sandbox.polar.sh/checkout/abc" } });

    render(<UpgradeButton />);
    fireEvent.click(screen.getByRole("button", { name: "Pro 시작하기" }));

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith("https://sandbox.polar.sh/checkout/abc");
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/billing/checkout", expect.objectContaining({ method: "POST" }));
  });

  it("보내는 동안 버튼을 잠가 두 번 눌리지 않게 합니다", async () => {
    mockFetch({ ok: true, body: { url: "https://sandbox.polar.sh/checkout/abc" } });

    render(<UpgradeButton />);
    fireEvent.click(screen.getByRole("button", { name: "Pro 시작하기" }));

    expect(await screen.findByRole("button", { name: "결제 화면을 여는 중입니다" })).toBeDisabled();
  });

  it("서버가 돌려준 안내를 그대로 보여줍니다", async () => {
    mockFetch({ ok: false, body: { message: "이미 Pro를 이용하고 있습니다. 설정에서 구독을 관리해 주세요." } });

    render(<UpgradeButton />);
    fireEvent.click(screen.getByRole("button", { name: "Pro 시작하기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("이미 Pro를 이용하고 있습니다.");
    expect(assign).not.toHaveBeenCalled();
  });

  it("연결이 끊기면 다시 시도할 수 있게 안내하고 버튼을 되살립니다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));

    render(<UpgradeButton />);
    fireEvent.click(screen.getByRole("button", { name: "Pro 시작하기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("다시 시도해 주세요");
    expect(screen.getByRole("button", { name: "Pro 시작하기" })).toBeEnabled();
  });
});
