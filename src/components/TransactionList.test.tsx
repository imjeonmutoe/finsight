import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Transaction } from "@/types/transaction";
import { TransactionList } from "./TransactionList";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const fetchMock = vi.fn();

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "transaction-1", userId: "user-1", sourceId: "source-1", uploadId: "upload-1",
    occurredOn: "2026-04-15", accountingMonth: "2026-04",
    merchantRaw: "동네 상점", merchantNorm: "동네상점", amountKrw: 1_234_567,
    kind: "expense", category: null, categorySource: "ai",
    sourceTransactionKey: null, dataRowIndex: 0, dedupeHash: "dedupe", candidateHash: "candidate",
    ...overrides,
  };
}

const transactions = [
  transaction({ id: "transaction-1", merchantRaw: "동네 상점", amountKrw: 12_000, category: "식비" }),
  transaction({ id: "transaction-2", merchantRaw: "정기 서비스", amountKrw: 15_900, category: "구독/멤버십" }),
];

function reply(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(reply(200, { id: "transaction-1", category: "쇼핑", categorySource: "user", kind: "expense" }));
});
afterEach(() => vi.unstubAllGlobals());

async function change(label: string, value: string) {
  await act(async () => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  });
}

describe("거래 목록 수정", () => {
  it("카테고리를 고치면 규칙으로 저장하고 그 자리에서 출처 배지를 바꿉니다", async () => {
    render(<TransactionList transactions={transactions} />);

    await change("동네 상점 카테고리", "쇼핑");

    expect(fetchMock).toHaveBeenCalledWith("/api/transactions/transaction-1", expect.objectContaining({
      method: "PATCH", body: JSON.stringify({ category: "쇼핑" }),
    }));
    await waitFor(() => expect(screen.getByLabelText("동네 상점 카테고리")).toHaveValue("쇼핑"));
    const row = screen.getByRole("row", { name: /동네 상점/ });
    expect(within(row).getByText("내 규칙")).toBeVisible();
  });

  it("고친 뒤에도 목록을 다시 정렬하지 않습니다", async () => {
    // 방금 고친 행이 화면에서 사라지면 사용자는 취소된 줄 압니다.
    render(<TransactionList transactions={transactions} />);

    await change("동네 상점 카테고리", "쇼핑");

    await waitFor(() => expect(screen.getAllByRole("row").slice(1).map((row) => row.id))
      .toEqual(["transaction-transaction-1", "transaction-transaction-2"]));
  });

  it("유형을 고치면 집계를 다시 태우도록 화면을 새로 고칩니다", async () => {
    fetchMock.mockResolvedValue(reply(200, { id: "transaction-1", category: "식비", categorySource: "rule", kind: "transfer" }));
    render(<TransactionList transactions={transactions} />);

    await change("동네 상점 거래 유형", "transfer");

    expect(fetchMock).toHaveBeenCalledWith("/api/transactions/transaction-1", expect.objectContaining({
      body: JSON.stringify({ kind: "transfer" }),
    }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.getByLabelText("동네 상점 거래 유형")).toHaveValue("transfer");
  });

  it("실패하면 한국어 안내를 주고 원래 값을 지킵니다", async () => {
    fetchMock.mockResolvedValue(reply(409, {
      code: "DUPLICATE_TRANSACTION",
      message: "같은 출처에 이미 같은 거래가 있습니다. 거래 유형을 다시 확인해 주세요.",
    }));
    render(<TransactionList transactions={transactions} />);

    await change("동네 상점 거래 유형", "refund");

    expect(await screen.findByText("같은 출처에 이미 같은 거래가 있습니다. 거래 유형을 다시 확인해 주세요."))
      .toBeVisible();
    expect(screen.getByLabelText("동네 상점 거래 유형")).toHaveValue("expense");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("연결이 끊겨도 무엇을 해야 하는지 알립니다", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    render(<TransactionList transactions={transactions} />);

    await change("동네 상점 카테고리", "쇼핑");

    expect(await screen.findByText("요청을 보내지 못했습니다. 연결을 확인하고 다시 시도해 주세요.")).toBeVisible();
    expect(screen.getByLabelText("동네 상점 카테고리")).toHaveValue("식비");
  });

  it("저장하는 동안에는 같은 행을 다시 고치지 못하게 잠급니다", async () => {
    let settle: (response: Response) => void = () => undefined;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => { settle = resolve; }));
    render(<TransactionList transactions={transactions} />);

    await change("동네 상점 카테고리", "쇼핑");
    expect(screen.getByLabelText("동네 상점 카테고리")).toBeDisabled();

    await act(async () => {
      settle(reply(200, { id: "transaction-1", category: "쇼핑", categorySource: "user", kind: "expense" }));
    });
    await waitFor(() => expect(screen.getByLabelText("동네 상점 카테고리")).toBeEnabled());
  });

  it("거래가 없으면 한국어 빈 상태를 표시합니다", () => {
    render(<TransactionList transactions={[]} />);

    expect(screen.getByText("표시할 거래 내역이 없습니다.")).toBeVisible();
  });
});
