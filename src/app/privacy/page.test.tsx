import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PrivacyPage from "./page";

describe("개인정보처리방침", () => {
  it("수집 항목·처리 목적·보유 기간을 밝힙니다", () => {
    render(<PrivacyPage />);

    expect(screen.getByRole("heading", { level: 2, name: "수집 항목" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "처리 목적" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "보유 기간" })).toBeVisible();
    expect(screen.getByText(/Google 계정 이메일/)).toBeVisible();
    expect(screen.getByText(/사용자가 삭제할 때까지 보관합니다/)).toBeVisible();
  });

  it("국외 이전 표에 수탁자 4곳을 모두 담습니다", () => {
    render(<PrivacyPage />);

    const table = screen.getByRole("table", { name: /국외 이전/ });
    for (const processor of ["Anthropic", "Supabase", "Vercel", "Polar"]) {
      expect(within(table).getByRole("rowheader", { name: processor })).toBeVisible();
    }
    // 표 헤더는 스크린리더가 열을 읽을 수 있게 scope를 갖습니다.
    expect(within(table).getAllByRole("columnheader")).toHaveLength(4);
    for (const header of within(table).getAllByRole("columnheader")) {
      expect(header).toHaveAttribute("scope", "col");
    }
  });

  it("전송된 데이터를 회수할 수 없다는 사실을 고지합니다", () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/Anthropic에 이미 전송된 데이터는 회수할 수 없습니다/)).toBeVisible();
  });

  it("삭제 범위와 요청 경로를 함께 줍니다", () => {
    render(<PrivacyPage />);

    expect(screen.getByRole("heading", { level: 2, name: "삭제 요청 방법" })).toBeVisible();
    expect(screen.getByText(/원본 CSV·거래 내역·업로드 이력·가맹점 규칙·카드·계좌 출처를 삭제합니다/)).toBeVisible();
    expect(screen.getByText(/계정과 구독 상태는 그대로 둡니다/)).toBeVisible();
    expect(screen.getByRole("link", { name: /계정 삭제 요청/ })).toHaveAttribute(
      "href",
      "https://github.com/imjeonmutoe/finsight/issues",
    );
  });

  it("막다른 화면이 되지 않게 돌아갈 경로를 둡니다", () => {
    render(<PrivacyPage />);

    expect(screen.getByRole("link", { name: "FinSight 홈으로" })).toHaveAttribute("href", "/");
  });
});
