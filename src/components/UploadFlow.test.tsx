import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FinancialSource } from "@/types/upload";
import { UploadFlow } from "./UploadFlow";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const sources: FinancialSource[] = [{ id: "source-1", label: "신한카드 (5·12)", kind: "card" }];
const MAPPING = { date: 0, merchant: 1, amount: 2, skipRows: 0 };
const PREVIEW = [["거래일자", "가맹점명", "이용금액"], ["2026-08-03", "쿠팡", "38,400"]];

type Reply = { status?: number; body: unknown };
const fetchMock = vi.fn();

function reply(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function respond(routes: Record<string, Reply[]>) {
  fetchMock.mockImplementation((url: string) => {
    const queue = routes[url];
    const next = queue?.shift();
    if (!next) throw new Error(`예상하지 않은 요청입니다: ${url}`);
    return Promise.resolve(reply(next.status ?? 200, next.body));
  });
}

function setup(overrides: Partial<Parameters<typeof UploadFlow>[0]> = {}) {
  return render(
    <UploadFlow
      sources={sources} plan="free" limitReached={false} resetsAt={null} monthsHeld={1}
      {...overrides}
    />,
  );
}

function csv(name = "8월 명세서.csv"): File {
  return new File(["거래일자,가맹점명,이용금액\n"], name, { type: "text/csv" });
}

async function pickFile() {
  fireEvent.change(screen.getByLabelText("명세서 파일 선택"), { target: { files: [csv()] } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "이 파일 올리기" }));
  });
}

const MAPPED = {
  uploadId: "22222222-2222-4222-8222-222222222222", sourceId: "source-1", status: "mapped",
  reused: false, mapping: MAPPING, confidence: 0.94, preview: PREVIEW, totalRows: PREVIEW.length, headerRowIndex: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.useFakeTimers({ shouldAdvanceTime: true }).setSystemTime(new Date("2026-09-16T06:17:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("업로드 4단계 진행 표시", () => {
  it("네 단계를 항상 보여주고 현재 단계를 표시합니다", () => {
    setup();
    const steps = within(screen.getByTestId("upload-steps")).getAllByRole("listitem");

    expect(steps.map((step) => step.textContent)).toEqual([
      "1 파일 선택", "2 매핑 확인", "3 분류 진행률", "4 결과 요약",
    ]);
    expect(steps[0]).toHaveAttribute("aria-current", "step");
  });
});

describe("업로드 요청", () => {
  it("파일과 출처를 multipart로 올리고 매핑 확인으로 넘어갑니다", async () => {
    respond({ "/api/uploads": [{ body: MAPPED }] });
    setup();
    await pickFile();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/uploads");
    expect(init.method).toBe("POST");
    const form = init.body as FormData;
    expect(form.get("sourceId")).toBe("source-1");
    expect((form.get("file") as File).name).toBe("8월 명세서.csv");
    expect(screen.getByRole("button", { name: "이대로 진행" })).toBeVisible();
    // 카드 출처이고 청구월 컬럼이 없으면 이번 KST 월을 채워 보여줍니다.
    expect(screen.getByText("청구월 2026-09")).toBeVisible();
  });

  it("Free 한도 초과는 에러가 아니라 안내로 1단계에 남깁니다", async () => {
    respond({
      "/api/uploads": [{
        status: 403,
        body: {
          code: "UPLOAD_LIMIT_REACHED",
          message: "이번 달 무료 업로드를 이미 사용했습니다. 다음 달 1일에 초기화됩니다.",
          resetsAt: "2026-09-30T15:00:00.000Z",
        },
      }],
    });
    setup();
    await pickFile();

    expect(screen.getByTestId("upload-limit-notice")).toHaveTextContent("2026.10.01에 초기화됩니다.");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "이대로 진행" })).toBeNull();
  });

  it("업로드 실패는 원인과 다음 행동을 1단계에서 보여줍니다", async () => {
    respond({
      "/api/uploads": [{
        status: 413,
        body: { code: "TOO_MANY_ROWS", message: "행이 10,000개를 넘습니다. 기간을 나눠 다시 올려 주세요." },
      }],
    });
    setup();
    await pickFile();

    expect(screen.getByRole("alert")).toHaveTextContent("행이 10,000개를 넘습니다.");
  });

  it("새 별칭을 만들면 목록에 추가합니다", async () => {
    respond({
      "/api/sources": [{ status: 201, body: { source: { id: "source-2", label: "국민은행", kind: "bank" } } }],
    });
    setup();
    fireEvent.click(screen.getByRole("button", { name: "새 별칭 추가" }));
    fireEvent.change(screen.getByLabelText("별칭"), { target: { value: "국민은행" } });
    fireEvent.change(screen.getByLabelText("종류"), { target: { value: "bank" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "추가하기" }));
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/sources");
    await waitFor(() => {
      expect(within(screen.getByLabelText("카드 · 계좌 별칭")).getByText("국민은행 · 은행")).toBeInTheDocument();
    });
  });
});

describe("승인과 중복 확인", () => {
  it("승인 후 파싱 결과를 먼저 보여주고 분류를 반복합니다", async () => {
    respond({
      "/api/uploads": [{ body: MAPPED }],
      [`/api/uploads/${MAPPED.uploadId}/confirm`]: [{ body: { inserted: 34, duplicates: 2, unclassified: 27 } }],
      "/api/transactions/classify": [
        { body: { classified: 20, remaining: 7 } },
        { body: { classified: 7, remaining: 0 } },
      ],
    });
    setup();
    await pickFile();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "이대로 진행" }));
    });

    expect(screen.getByTestId("parse-result")).toHaveTextContent("34건 추가 · 2건 중복");
    await waitFor(() => {
      expect(screen.getByTestId("classify-progress-text")).toHaveTextContent("27건 중 27건을 분류했습니다.");
    });
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/transactions/classify")).toHaveLength(2);
    expect(refresh).toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "결과 보기" }));
    });
    expect(screen.getByTestId("upload-result")).toHaveTextContent("34건 추가 · 2건 중복");
    expect(screen.getByTestId("months-hint")).toBeVisible();
  });

  it("미분류가 없으면 분류를 호출하지 않습니다", async () => {
    respond({
      "/api/uploads": [{ body: MAPPED }],
      [`/api/uploads/${MAPPED.uploadId}/confirm`]: [{ body: { inserted: 34, duplicates: 0, unclassified: 0 } }],
    });
    setup();
    await pickFile();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "이대로 진행" }));
    });

    expect(screen.getByText("규칙으로 모두 분류했습니다. 모델을 호출하지 않았습니다.")).toBeVisible();
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/transactions/classify")).toHaveLength(0);
  });

  it("진척 없는 응답에서 반복을 멈춥니다", async () => {
    respond({
      "/api/uploads": [{ body: MAPPED }],
      [`/api/uploads/${MAPPED.uploadId}/confirm`]: [{ body: { inserted: 5, duplicates: 0, unclassified: 5 } }],
      // classified가 0인데 remaining이 그대로입니다. 이게 유일한 무한 루프 방어선입니다.
      "/api/transactions/classify": [{ body: { classified: 0, remaining: 5 } }],
    });
    setup();
    await pickFile();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "이대로 진행" }));
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "더 이상 자동으로 분류되지 않습니다. 대시보드에서 직접 카테고리를 고를 수 있습니다.",
      );
    });
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/transactions/classify")).toHaveLength(1);
  });

  it("매핑 추론이 실패하면 1단계에 가두지 않고 수동 매핑으로 넘깁니다", async () => {
    // 응답 문구가 "매핑 확인 화면에서 직접 선택하라"고 안내한다. 1단계에 머물면
    // 안내받은 일을 할 수 없는 막다른 화면이 된다.
    respond({
      "/api/uploads": [{
        status: 502,
        body: {
          code: "MAPPING_FAILED", uploadId: MAPPED.uploadId, sourceId: "source-1",
          mapping: null, confidence: 0, preview: PREVIEW,
          message: "컬럼 매핑을 추론하지 못했습니다. 매핑 확인 화면에서 컬럼을 직접 선택해 주세요.",
        },
      }],
    });
    setup();
    await pickFile();

    const steps = within(screen.getByTestId("upload-steps")).getAllByRole("listitem");
    expect(steps[1]).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("alert")).toHaveTextContent("컬럼을 직접 선택해 주세요");
  });

  it("분류 실패 응답에서 자동 반복을 멈추고 재시도 경로를 줍니다", async () => {
    respond({
      "/api/uploads": [{ body: MAPPED }],
      [`/api/uploads/${MAPPED.uploadId}/confirm`]: [{ body: { inserted: 5, duplicates: 0, unclassified: 5 } }],
      "/api/transactions/classify": [
        {
          status: 502,
          body: {
            code: "CLASSIFY_FAILED", classified: 2, remaining: 3,
            message: "일부 거래를 분류하지 못했습니다. 거래 탭에서 직접 카테고리를 고를 수 있습니다.",
          },
        },
        { body: { classified: 3, remaining: 0 } },
      ],
    });
    setup();
    await pickFile();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "이대로 진행" }));
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("일부 거래를 분류하지 못했습니다.");
    });
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/transactions/classify")).toHaveLength(1);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "다시 시도하기" }));
    });
    await waitFor(() => {
      expect(screen.getByTestId("classify-progress-text")).toHaveTextContent("5건 중 5건을 분류했습니다.");
    });
  });

  it("409 중복 확인은 같은 화면에서 해결하고 다시 승인합니다", async () => {
    respond({
      "/api/uploads": [{ body: MAPPED }],
      [`/api/uploads/${MAPPED.uploadId}/confirm`]: [
        {
          status: 409,
          body: {
            code: "IMPORT_REVIEW_REQUIRED",
            duplicateCandidates: [{ dataRowIndex: 4, transactionIds: ["11111111-1111-4111-8111-111111111111"] }],
          },
        },
        { body: { inserted: 33, duplicates: 3, unclassified: 0 } },
      ],
    });
    setup();
    await pickFile();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "이대로 진행" }));
    });

    expect(screen.getByTestId("duplicate-4")).toHaveTextContent("5번째 거래 행");
    expect(screen.getByRole("button", { name: "이대로 진행" })).toBeDisabled();

    fireEvent.click(within(screen.getByTestId("duplicate-4")).getByRole("button", { name: "기존 거래와 중복" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "이대로 진행" }));
    });

    const confirms = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/confirm"));
    expect(confirms).toHaveLength(2);
    expect(JSON.parse(String((confirms[1]?.[1] as RequestInit).body)).duplicateDecisions).toEqual([
      { dataRowIndex: 4, action: "duplicate", transactionId: "11111111-1111-4111-8111-111111111111" },
    ]);
    expect(screen.getByTestId("parse-result")).toHaveTextContent("33건 추가 · 3건 중복");
  });

  it("다른 파일 올리기로 1단계부터 다시 시작합니다", async () => {
    respond({
      "/api/uploads": [{ body: MAPPED }],
      [`/api/uploads/${MAPPED.uploadId}/confirm`]: [{ body: { inserted: 1, duplicates: 0, unclassified: 0 } }],
    });
    setup();
    await pickFile();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "이대로 진행" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "결과 보기" }));
    });
    fireEvent.click(screen.getByRole("button", { name: "다른 파일 올리기" }));

    expect(screen.getByLabelText("명세서 파일 선택")).toBeVisible();
    const steps = within(screen.getByTestId("upload-steps")).getAllByRole("listitem");
    expect(steps[0]).toHaveAttribute("aria-current", "step");
  });

  it("뒤로 누르면 파일 선택으로 돌아갑니다", async () => {
    respond({ "/api/uploads": [{ body: MAPPED }] });
    setup();
    await pickFile();
    fireEvent.click(screen.getByRole("button", { name: "뒤로" }));

    expect(screen.getByLabelText("명세서 파일 선택")).toBeVisible();
  });
});

describe("이어서 진행", () => {
  it("업로드 이력에서 돌아오면 매핑 확인 단계부터 시작합니다", () => {
    // mapped는 Storage에 파일만 있고 거래는 0건인 상태다. 파일을 다시 고르게 하지 않는다.
    setup({
      resume: {
        mapping: { ...MAPPED, status: "mapped" as const, reused: true }, filename: "8월 명세서.csv",
        sourceKind: "card", encoding: "euc-kr",
      },
    });

    const steps = within(screen.getByTestId("upload-steps")).getAllByRole("listitem");
    expect(steps[1]).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("button", { name: "이대로 진행" })).toBeVisible();
    expect(screen.queryByLabelText("명세서 파일 선택")).toBeNull();
  });

  it("보관된 인코딩을 그대로 이어받습니다", () => {
    setup({
      resume: {
        mapping: { ...MAPPED, status: "mapped" as const, reused: true }, filename: "8월 명세서.csv",
        sourceKind: "card", encoding: "euc-kr",
      },
    });

    expect(screen.getByLabelText("인코딩")).toHaveValue("euc-kr");
  });
});
