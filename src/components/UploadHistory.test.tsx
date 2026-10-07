import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UploadHistory, type UploadHistoryItem } from "./UploadHistory";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const fetchMock = vi.fn();

function reply(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

// pending이 이 시각보다 먼저 만들어졌으면 요청이 죽은 것으로 봅니다(요청 제한시간 300초).
const STALE_BEFORE = "2026-08-05T00:05:00.000Z";

function item(overrides: Partial<UploadHistoryItem> = {}): UploadHistoryItem {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    filename: "8월 명세서.csv",
    sourceLabel: "신한카드 (5·12)",
    createdAt: "2026-08-05T00:00:00.000Z",
    status: "parsed",
    insertedCount: 34,
    duplicateCount: 2,
    errorMessage: null,
    ...overrides,
  };
}

function setup(uploads: UploadHistoryItem[]) {
  return render(<UploadHistory uploads={uploads} staleBefore={STALE_BEFORE} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("업로드 이력", () => {
  it("별칭·파일명·일시·상태·건수를 함께 보여줍니다", () => {
    setup([item()]);
    const row = screen.getByTestId("upload-row");

    expect(within(row).getByText("신한카드 (5·12)")).toBeVisible();
    expect(within(row).getByText("8월 명세서.csv")).toBeVisible();
    expect(within(row).getByText("2026.08.05")).toBeVisible();
    expect(within(row).getByText("완료")).toBeVisible();
    expect(within(row).getByText(/34건 추가/)).toBeVisible();
    expect(within(row).getByText(/2건 중복/)).toBeVisible();
  });

  it("mapped를 미완료로 구분하고 이어서 진행을 제공합니다", () => {
    // 매핑 확인에서 이탈하면 Storage에 파일만 남는다. 이어서 진행이 없으면 고아 파일이 쌓인다.
    setup([item({ status: "mapped", insertedCount: 0, duplicateCount: 0 })]);
    const row = screen.getByTestId("upload-row");

    expect(within(row).getByText("미완료")).toBeVisible();
    expect(within(row).getByRole("link", { name: "이어서 진행" }))
      .toHaveAttribute("href", "/dashboard/upload?resume=11111111-1111-4111-8111-111111111111");
    expect(within(row).getByRole("button", { name: "삭제" })).toBeVisible();
  });

  it("failed는 원인과 재시도 경로를 함께 줍니다", () => {
    setup([item({ status: "failed", errorMessage: "컬럼 매핑을 추론하지 못했습니다." })]);
    const row = screen.getByTestId("upload-row");

    expect(within(row).getByText("실패")).toBeVisible();
    expect(within(row).getByText("컬럼 매핑을 추론하지 못했습니다.")).toBeVisible();
    expect(within(row).getByRole("link", { name: "다시 올리기" })).toHaveAttribute("href", "/dashboard/upload");
  });

  it("처리 중인 업로드는 그대로 두고, 제한시간을 넘긴 것은 재개할 수 있게 합니다", () => {
    setup([
      item({ id: "fresh", status: "pending", createdAt: "2026-08-05T00:06:00.000Z" }),
      item({ id: "stale", status: "pending", createdAt: "2026-08-05T00:00:00.000Z" }),
    ]);
    const [fresh, stale] = screen.getAllByTestId("upload-row");

    expect(within(fresh!).getByText("처리 중")).toBeVisible();
    expect(within(fresh!).queryByRole("link", { name: "다시 올리기" })).toBeNull();
    expect(within(stale!).getByText("실패")).toBeVisible();
    expect(within(stale!).getByText(/처리가 중단되었습니다/)).toBeVisible();
    expect(within(stale!).getByRole("link", { name: "다시 올리기" })).toBeVisible();
  });

  it("삭제 확인에 함께 삭제될 거래 건수를 서버에서 세어 보여줍니다", async () => {
    // ADR-008이 CASCADE를 유지하는 조건이 이 고지다. 추정치를 쓰지 않는다.
    fetchMock.mockResolvedValueOnce(reply(200, { transactionCount: 34 }));
    setup([item()]);

    fireEvent.click(screen.getByRole("button", { name: "삭제" }));

    const dialog = await screen.findByRole("dialog");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/uploads/11111111-1111-4111-8111-111111111111", expect.objectContaining({ method: "GET" }),
    );
    await waitFor(() => {
      expect(within(dialog).getByText(/거래 34건이 함께 삭제됩니다/)).toBeVisible();
    });
    expect(within(dialog).getByText(/다른 파일에도 있던 거래라면 그 파일을 다시 올려야 복구됩니다/)).toBeVisible();
    // 지워도 횟수가 돌아오지 않습니다(0008). 다시 올리려다 막히기 전에 말합니다.
    expect(within(dialog).getByText("무료 플랜은 업로드를 지워도 이번 달 업로드 횟수가 돌아오지 않습니다.")).toBeVisible();
  });

  it("건수를 읽어오기 전에는 삭제를 실행할 수 없습니다", async () => {
    let settle: ((response: Response) => void) | undefined;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { settle = resolve; }));
    setup([item()]);

    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByRole("button", { name: "삭제합니다" })).toBeDisabled();
    settle?.(reply(200, { transactionCount: 34 }));
    await waitFor(() => {
      expect(within(dialog).getByRole("button", { name: "삭제합니다" })).toBeEnabled();
    });
  });

  it("확인을 누르면 삭제 API를 부르고 목록을 갱신합니다", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, { transactionCount: 34 }))
      .mockResolvedValueOnce(reply(200, { deleted: 34 }));
    setup([item()]);

    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "삭제합니다" })).toBeEnabled());
    fireEvent.click(within(dialog).getByRole("button", { name: "삭제합니다" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/uploads/11111111-1111-4111-8111-111111111111", expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("취소하면 아무것도 지우지 않습니다", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { transactionCount: 34 }));
    setup([item()]);

    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("삭제 API가 실패하면 원인과 다음 행동을 말합니다", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, { transactionCount: 34 }))
      .mockResolvedValueOnce(reply(500, { code: "STORAGE_DELETE_FAILED", message: "원본 파일을 지우지 못했습니다. 잠시 후 다시 시도해 주세요." }));
    setup([item()]);

    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "삭제합니다" })).toBeEnabled());
    fireEvent.click(within(dialog).getByRole("button", { name: "삭제합니다" }));

    expect(await within(dialog).findByRole("alert"))
      .toHaveTextContent("원본 파일을 지우지 못했습니다. 잠시 후 다시 시도해 주세요.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("업로드가 없으면 다음 행동을 줍니다", () => {
    setup([]);

    expect(screen.getByText("아직 올린 명세서가 없습니다.")).toBeVisible();
    expect(screen.getByRole("link", { name: "명세서 올리기" })).toHaveAttribute("href", "/dashboard/upload");
    expect(screen.queryByTestId("upload-row")).toBeNull();
  });

  it("원본 CSV를 다시 내려받는 경로를 만들지 않습니다", () => {
    setup([item()]);

    expect(screen.queryByRole("link", { name: /내려받/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /내려받/ })).toBeNull();
  });

  it("마크업에 하드코딩한 색이 없습니다", () => {
    expect(renderToStaticMarkup(<UploadHistory uploads={[item()]} staleBefore={STALE_BEFORE} />))
      .not.toContain("#");
  });
});
