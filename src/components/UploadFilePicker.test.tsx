import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_CSV_ROWS, MAX_FILE_BYTES } from "@/lib/limits";
import type { FinancialSource } from "@/types/upload";
import { UploadFilePicker } from "./UploadFilePicker";

const sources: FinancialSource[] = [
  { id: "source-1", label: "신한카드 (5·12)", kind: "card" },
  { id: "source-2", label: "국민은행 (입출금)", kind: "bank" },
];
const onUpload = vi.fn();
const onCreateSource = vi.fn();

function setup(overrides: Partial<Parameters<typeof UploadFilePicker>[0]> = {}) {
  return render(
    <UploadFilePicker
      sources={sources} plan="free" limitReached={false} resetsAt={null}
      busy={false} error={null} onUpload={onUpload} onCreateSource={onCreateSource}
      {...overrides}
    />,
  );
}

function csv(name = "8월 명세서.csv"): File {
  return new File(["거래일자,가맹점명,이용금액\n"], name, { type: "text/csv" });
}

beforeEach(() => vi.clearAllMocks());

describe("업로드 1단계 — 파일 선택", () => {
  it("선택 전에 크기·행수·인코딩 제약을 안내합니다", () => {
    setup();

    expect(screen.getByTestId("upload-limits")).toHaveTextContent("파일당 4MB · 10,000행까지");
    expect(screen.getByText(/EUC-KR · UTF-8 인코딩을 자동으로 감지합니다/)).toBeVisible();
    // 공유 상수와 안내 문구가 어긋나지 않게 값을 상수에서 만듭니다.
    expect(MAX_FILE_BYTES).toBe(4_000_000);
    expect(MAX_CSV_ROWS).toBe(10_000);
  });

  it("기존 별칭을 선택해 한 출처로만 올립니다", () => {
    setup();
    const select = screen.getByLabelText("카드 · 계좌 별칭");
    fireEvent.change(select, { target: { value: "source-2" } });
    fireEvent.change(screen.getByLabelText("CSV 파일 선택"), { target: { files: [csv()] } });

    expect(screen.getByText("8월 명세서.csv")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "이 파일 올리기" }));

    expect(onUpload).toHaveBeenCalledTimes(1);
    expect(onUpload.mock.calls[0]?.[0]).toBe("source-2");
    expect((onUpload.mock.calls[0]?.[1] as File).name).toBe("8월 명세서.csv");
  });

  it("드래그앤드롭으로도 파일을 받습니다", () => {
    setup();
    const dropzone = screen.getByTestId("upload-dropzone");

    fireEvent.drop(dropzone, { dataTransfer: { files: [csv("9월.csv")] } });

    expect(screen.getByText("9월.csv")).toBeVisible();
  });

  it("CSV가 아니거나 4MB를 넘는 파일은 올리기 전에 막습니다", () => {
    setup();
    const input = screen.getByLabelText("CSV 파일 선택");

    fireEvent.change(input, { target: { files: [new File(["x"], "명세서.xlsx", { type: "text/csv" })] } });
    expect(screen.getByText(/CSV 파일만 올릴 수 있습니다/)).toBeVisible();

    const big = new File(["x"], "명세서.csv", { type: "text/csv" });
    Object.defineProperty(big, "size", { value: MAX_FILE_BYTES + 1 });
    fireEvent.change(input, { target: { files: [big] } });
    expect(screen.getByText(/파일이 4MB를 넘습니다. 기간을 나눠 다시 올려 주세요./)).toBeVisible();

    expect(screen.queryByRole("button", { name: "이 파일 올리기" })).toBeNull();
    expect(onUpload).not.toHaveBeenCalled();
  });

  it("파일을 고르기 전에는 올리기 버튼을 보이지 않습니다", () => {
    setup();

    expect(screen.queryByRole("button", { name: "이 파일 올리기" })).toBeNull();
  });

  it("Free에게 한도와 예외를 함께 알립니다", () => {
    setup({ plan: "free" });

    expect(screen.getByText(
      /Free는 KST 캘린더 월 기준 1회입니다. 매핑 추론이 실패한 업로드와 동일 파일 재업로드는 횟수를 소비하지 않습니다./,
    )).toBeVisible();
    expect(screen.getByText(/여러 달치를 한 파일로 합쳐 올리면 1회로 계산됩니다./)).toBeVisible();
  });

  it("한도 도달은 에러색이 아닌 안내로 보여주고 지금도 되는 것을 말합니다", () => {
    setup({ limitReached: true, resetsAt: "2026-09-30T15:00:00.000Z" });

    const notice = screen.getByTestId("upload-limit-notice");
    expect(notice).toHaveTextContent("이번 달 무료 업로드를 이미 사용했습니다. 2026.10.01에 초기화됩니다.");
    expect(notice).toHaveTextContent("기존 데이터 열람·수정·재분류는 계속 가능합니다.");
    // 한도 안내는 muted입니다. 에러색(up)은 실패와 이상거래에만 씁니다.
    expect(notice.className).toContain("text-muted");
    expect(notice.className).not.toContain("text-up");
    expect(screen.getByLabelText("CSV 파일 선택")).toBeDisabled();
  });

  it("Pro에게는 원본 보관을 알립니다", () => {
    setup({ plan: "pro" });

    expect(screen.getByText("원본은 Storage에 보관되며 언제든 다시 파싱할 수 있습니다.")).toBeVisible();
    expect(screen.queryByText(/Free는 KST/)).toBeNull();
  });

  it("카드사별 내려받기 안내는 접힌 상태로 둡니다", () => {
    setup();
    const guide = screen.getByText("카드사·은행에서 CSV 내려받는 곳").closest("details");

    expect(guide).not.toHaveAttribute("open");
  });

  it("별칭이 없으면 새로 만들도록 안내합니다", () => {
    setup({ sources: [] });

    expect(screen.getByText(/등록한 카드·계좌가 없습니다. 별칭을 먼저 추가해 주세요./)).toBeVisible();
    expect(screen.queryByRole("button", { name: "이 파일 올리기" })).toBeNull();
  });

  it("새 별칭을 별칭과 종류로 만들고 계좌번호는 받지 않습니다", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "새 별칭 추가" }));
    const form = screen.getByTestId("new-source-form");

    expect(within(form).queryByLabelText(/카드번호|계좌번호/)).toBeNull();
    fireEvent.change(within(form).getByLabelText("별칭"), { target: { value: "하나카드 (생활)" } });
    fireEvent.change(within(form).getByLabelText("종류"), { target: { value: "bank" } });
    fireEvent.click(within(form).getByRole("button", { name: "추가하기" }));

    expect(onCreateSource).toHaveBeenCalledWith("하나카드 (생활)", "bank");
  });

  it("실패 메시지는 원인과 다음 행동을 함께 보여줍니다", () => {
    setup({ error: "행이 10,000개를 넘습니다. 기간을 나눠 다시 올려 주세요." });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("행이 10,000개를 넘습니다. 기간을 나눠 다시 올려 주세요.");
    expect(alert.className).toContain("text-up");
  });

  it("업로드 중에는 버튼을 잠그고 무엇을 하는 중인지 알립니다", () => {
    setup({ busy: true });
    fireEvent.change(screen.getByLabelText("CSV 파일 선택"), { target: { files: [csv()] } });

    expect(screen.getByRole("button", { name: "올리는 중입니다" })).toBeDisabled();
  });

  it("가맹점명을 HTML로 실행하지 않고 텍스트로 표시합니다", () => {
    const { container } = setup();
    fireEvent.change(screen.getByLabelText("CSV 파일 선택"), {
      target: { files: [csv('<img src=x onerror="alert(1)">.csv')] },
    });

    expect(screen.getByText('<img src=x onerror="alert(1)">.csv')).toBeVisible();
    expect(container.querySelector("img")).toBeNull();
  });
});
