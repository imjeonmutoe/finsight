import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteDataForm } from "./DeleteDataForm";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const fetchMock = vi.fn();

function reply(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function type(value: string) {
  fireEvent.change(screen.getByLabelText(/삭제.*입력/), { target: { value } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  render(<DeleteDataForm />);
});
afterEach(() => vi.unstubAllGlobals());

describe("금융 데이터 삭제", () => {
  it("무엇이 지워지고 무엇이 남는지 함께 말합니다", () => {
    expect(screen.getByText(/원본 파일·거래·가맹점 규칙·카드·계좌.*지웁니다/)).toBeVisible();
    expect(screen.getByText(/계정과 구독 상태는 그대로 둡니다/)).toBeVisible();
  });

  it("Anthropic에 이미 전송된 데이터는 회수할 수 없다고 알립니다", () => {
    expect(screen.getByText(/Anthropic에 이미 전송된 데이터는 회수할 수 없습니다/)).toBeVisible();
  });

  it("계정 삭제가 아니라는 것과 계정 삭제 접수 경로를 함께 말합니다", () => {
    expect(screen.getByText(/계정 삭제는 개인정보처리방침의 문의 경로로 접수합니다/)).toBeVisible();
  });

  it("확인 문구를 정확히 입력해야 실행할 수 있습니다", () => {
    const button = screen.getByRole("button", { name: "금융 데이터 삭제하기" });
    expect(button).toBeDisabled();

    type("삭제합니다");
    expect(button).toBeDisabled();

    type("삭제");
    expect(button).toBeEnabled();
  });

  it("확인 문구와 함께 삭제 API를 부릅니다", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { deleted: true }));

    type("삭제");
    fireEvent.click(screen.getByRole("button", { name: "금융 데이터 삭제하기" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/account/data", expect.objectContaining({
      method: "DELETE", body: JSON.stringify({ confirm: "삭제" }),
    }));
    expect(await screen.findByRole("status")).toHaveTextContent("금융 데이터를 모두 지웠습니다.");
  });

  it("실패하면 원인과 다음 행동을 말하고 갱신하지 않습니다", async () => {
    fetchMock.mockResolvedValueOnce(reply(500, {
      code: "STORAGE_DELETE_FAILED", message: "원본 파일을 지우지 못했습니다. 잠시 후 다시 시도해 주세요.",
    }));

    type("삭제");
    fireEvent.click(screen.getByRole("button", { name: "금융 데이터 삭제하기" }));

    expect(await screen.findByRole("alert"))
      .toHaveTextContent("원본 파일을 지우지 못했습니다. 잠시 후 다시 시도해 주세요.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("브라우저 confirm·alert을 쓰지 않습니다", () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const alertSpy = vi.spyOn(window, "alert");
    fetchMock.mockResolvedValueOnce(reply(200, { deleted: true }));

    type("삭제");
    fireEvent.click(screen.getByRole("button", { name: "금융 데이터 삭제하기" }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("마크업에 하드코딩한 색이 없습니다", () => {
    expect(renderToStaticMarkup(<DeleteDataForm />)).not.toContain("#");
  });
});
