import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfirmRequest } from "@/types/api";
import type { ColumnMapping } from "@/types/upload";
import { MappingReview } from "./MappingReview";

const MAPPING: ColumnMapping = { date: 0, merchant: 1, amount: 2, transactionId: 3, skipRows: 0 };
const PREVIEW = [
  ["거래일자", "가맹점명", "이용금액", "승인번호", "할부개월", "카드번호"],
  ["2026-08-03", "쿠팡", "38,400", "10293847", "일시불", "1234-****-****-5678"],
  ["2026-08-04", "스타벅스 강남", "4,500", "10293848", "일시불", "1234-****-****-5678"],
];
const onConfirm = vi.fn();
const onBack = vi.fn();

function setup(overrides: Partial<Parameters<typeof MappingReview>[0]> = {}) {
  return render(
    <MappingReview
      mapping={MAPPING} confidence={0.94} preview={PREVIEW} encoding="euc-kr" filename="8월 명세서.csv"
      sourceKind="card" reused={false} accountingMonth="2026-08" duplicateCandidates={[]}
      busy={false} error={null} onConfirm={onConfirm} onBack={onBack}
      {...overrides}
    />,
  );
}

function confirmed(): ConfirmRequest {
  return onConfirm.mock.calls[0]?.[0] as ConfirmRequest;
}

beforeEach(() => vi.clearAllMocks());

describe("업로드 2단계 — 매핑 확인", () => {
  it("신뢰도가 높으면 단일 버튼으로 끝내고 상세를 접어 둡니다", () => {
    setup({ confidence: 0.94 });

    expect(screen.getByRole("button", { name: "이대로 진행" })).toBeEnabled();
    expect(screen.getByText("컬럼 매핑 직접 고치기").closest("details")).not.toHaveAttribute("open");
    fireEvent.click(screen.getByRole("button", { name: "이대로 진행" }));

    expect(confirmed()).toEqual({
      mapping: MAPPING, encoding: "euc-kr", accountingMonth: "2026-08", duplicateDecisions: [],
    });
  });

  it("신뢰도가 낮으면 상세를 펼친 상태로 시작하고 근거를 알립니다", () => {
    setup({ confidence: 0.42 });

    expect(screen.getByText("컬럼 매핑 직접 고치기").closest("details")).toHaveAttribute("open");
    expect(screen.getByText(/컬럼 의미를 확신하지 못했습니다. 아래 매핑을 확인해 주세요./)).toBeVisible();
  });

  it("감지한 인코딩·파일명·청구월을 먼저 보여줍니다", () => {
    setup();

    expect(screen.getByText("EUC-KR 감지")).toBeVisible();
    expect(screen.getByText("8월 명세서.csv")).toBeVisible();
    expect(screen.getByText("청구월 2026-08")).toBeVisible();
  });

  it("미리보기 첫 5행으로 인코딩 오판을 육안 확인하게 합니다", () => {
    setup();
    const table = screen.getByRole("table", { name: "원본 미리보기" });

    expect(within(table).getByText("쿠팡")).toBeVisible();
    expect(within(table).getByText("스타벅스 강남")).toBeVisible();
    expect(within(table).getAllByRole("row")).toHaveLength(3);
  });

  it("쓰지 않는 컬럼은 (사용 안 함), 마스킹된 컬럼은 (제거됨)으로 보입니다", () => {
    setup();
    const rows = within(screen.getByRole("table", { name: "컬럼 매핑" })).getAllByRole("row");

    expect(rows[5]).toHaveTextContent("할부개월");
    expect(within(rows[5] as HTMLElement).getByRole("combobox")).toHaveValue("unknown");
    expect(rows[6]).toHaveTextContent("카드번호");
    expect(rows[6]).toHaveTextContent("(제거됨)");
    // 마스킹된 컬럼은 어떤 필드로도 고를 수 없습니다.
    expect(within(rows[6] as HTMLElement).queryByRole("combobox")).toBeNull();
  });

  it("컬럼을 직접 고치면 승인 요청의 매핑이 바뀝니다", () => {
    setup();
    const rows = within(screen.getByRole("table", { name: "컬럼 매핑" })).getAllByRole("row");
    fireEvent.change(within(rows[4] as HTMLElement).getByRole("combobox"), { target: { value: "unknown" } });
    fireEvent.change(within(rows[5] as HTMLElement).getByRole("combobox"), { target: { value: "billingMonth" } });
    fireEvent.click(screen.getByRole("button", { name: "이대로 진행" }));

    expect(confirmed().mapping).toEqual({ date: 0, merchant: 1, amount: 2, billingMonth: 4, skipRows: 0 });
  });

  it("한 필드는 한 컬럼만 가리킵니다", () => {
    setup();
    const rows = within(screen.getByRole("table", { name: "컬럼 매핑" })).getAllByRole("row");
    fireEvent.change(within(rows[4] as HTMLElement).getByRole("combobox"), { target: { value: "amount" } });
    fireEvent.click(screen.getByRole("button", { name: "이대로 진행" }));

    expect(confirmed().mapping).toEqual({ date: 0, merchant: 1, amount: 3, skipRows: 0 });
  });

  it("날짜·가맹점·금액이 빠지면 진행을 막고 무엇이 필요한지 알립니다", () => {
    setup();
    const rows = within(screen.getByRole("table", { name: "컬럼 매핑" })).getAllByRole("row");
    fireEvent.change(within(rows[1] as HTMLElement).getByRole("combobox"), { target: { value: "unknown" } });

    expect(screen.getByRole("button", { name: "이대로 진행" })).toBeDisabled();
    expect(screen.getByText(/날짜·가맹점과 금액 컬럼을 골라 주세요./)).toBeVisible();
  });

  it("인코딩을 수동으로 전환할 수 있습니다", () => {
    setup();
    fireEvent.change(screen.getByLabelText("인코딩"), { target: { value: "utf-8" } });
    fireEvent.click(screen.getByRole("button", { name: "이대로 진행" }));

    expect(confirmed().encoding).toBe("utf-8");
  });

  it("카드 청구월을 컬럼으로도 얻을 수 없으면 직접 입력하게 합니다", () => {
    setup({ mapping: { date: 0, merchant: 1, amount: 2, skipRows: 0 }, accountingMonth: "" });

    expect(screen.getByRole("button", { name: "이대로 진행" })).toBeDisabled();
    expect(screen.getByText(/명세서의 청구월을 입력해 주세요./)).toBeVisible();
    fireEvent.change(screen.getByLabelText("카드 청구월"), { target: { value: "2026-07" } });
    fireEvent.click(screen.getByRole("button", { name: "이대로 진행" }));

    expect(confirmed().accountingMonth).toBe("2026-07");
  });

  it("은행 거래내역에는 청구월을 묻지 않습니다", () => {
    setup({ sourceKind: "bank", accountingMonth: "" });

    expect(screen.queryByLabelText("카드 청구월")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "이대로 진행" }));
    expect(confirmed().accountingMonth).toBeUndefined();
  });

  // ADR-013: kind는 매핑에서 결정론적으로 도출되므로 행별 확인 단계를 만들지 않습니다.
  it("거래 유형을 행별로 확인시키지 않습니다", () => {
    setup();

    for (const label of ["지출", "수입", "환불", "이체"]) {
      expect(screen.queryByRole("button", { name: label })).toBeNull();
    }
    expect(screen.queryByText(/거래 유형을 선택/)).toBeNull();
  });
});

describe("업로드 2단계 — 중복 확인", () => {
  const candidates = [
    { dataRowIndex: 4, transactionIds: ["11111111-1111-4111-8111-111111111111"] },
    {
      dataRowIndex: 9,
      transactionIds: ["22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"],
    },
  ];

  it("유사 거래마다 추가·중복을 고르게 하고 전부 정하기 전에는 진행을 막습니다", () => {
    setup({ duplicateCandidates: candidates });

    expect(screen.getByRole("button", { name: "이대로 진행" })).toBeDisabled();
    expect(screen.getByText(/확인이 필요한 거래가 2건 있습니다./)).toBeVisible();

    const first = screen.getByTestId("duplicate-4");
    expect(first).toHaveTextContent("5번째 거래 행");
    expect(first).toHaveTextContent("기존 거래와 날짜·금액이 같습니다. 중복인가요?");
    fireEvent.click(within(first).getByRole("button", { name: "별도 거래로 추가" }));
    expect(screen.getByRole("button", { name: "이대로 진행" })).toBeDisabled();

    const second = screen.getByTestId("duplicate-9");
    fireEvent.click(within(second).getByRole("button", { name: "기존 거래와 중복" }));
    fireEvent.click(screen.getByRole("button", { name: "이대로 진행" }));

    expect(confirmed().duplicateDecisions).toEqual([
      { dataRowIndex: 4, action: "keep" },
      { dataRowIndex: 9, action: "duplicate", transactionId: "22222222-2222-4222-8222-222222222222" },
    ]);
  });

  it("후보가 여러 건이면 어느 거래와 중복인지 고르게 합니다", () => {
    setup({ duplicateCandidates: candidates });
    const second = screen.getByTestId("duplicate-9");
    fireEvent.click(within(second).getByRole("button", { name: "기존 거래와 중복" }));
    fireEvent.change(within(second).getByLabelText("중복으로 볼 기존 거래"), {
      target: { value: "33333333-3333-4333-8333-333333333333" },
    });
    fireEvent.click(within(screen.getByTestId("duplicate-4")).getByRole("button", { name: "별도 거래로 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "이대로 진행" }));

    expect(confirmed().duplicateDecisions[1]).toEqual({
      dataRowIndex: 9, action: "duplicate", transactionId: "33333333-3333-4333-8333-333333333333",
    });
  });

  it("내부 해시를 화면에 노출하지 않습니다", () => {
    const { container } = setup({ duplicateCandidates: candidates });

    expect(container.textContent).not.toMatch(/[0-9a-f]{64}/);
    expect(container.textContent).not.toContain("dedupe");
    expect(container.textContent).not.toContain("candidate");
  });
});

describe("업로드 2단계 — 상태 안내", () => {
  it("같은 파일 재업로드는 기존 결과와 재개 경로를 알립니다", () => {
    setup({ reused: true });

    expect(screen.getByText(
      /이미 올린 파일입니다. 저장된 매핑을 그대로 재사용하며 이번 업로드는 한 달 횟수를 소비하지 않았습니다./,
    )).toBeVisible();
  });

  it("실패 메시지는 원인과 다음 행동을 함께 보여줍니다", () => {
    setup({ error: "카드 청구월을 알 수 없습니다. 명세서의 청구월을 선택해 주세요." });

    expect(screen.getByRole("alert")).toHaveTextContent("명세서의 청구월을 선택해 주세요.");
  });

  it("저장 중에는 버튼을 잠그고 뒤로 갈 수 있습니다", () => {
    setup({ busy: true });

    expect(screen.getByRole("button", { name: "저장하는 중입니다" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "뒤로" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("매핑을 추론하지 못했으면 상세를 펼치고 직접 고르게 합니다", () => {
    setup({ mapping: null, confidence: 0 });

    expect(screen.getByText("컬럼 매핑 직접 고치기").closest("details")).toHaveAttribute("open");
    expect(screen.getByRole("button", { name: "이대로 진행" })).toBeDisabled();
  });
});
