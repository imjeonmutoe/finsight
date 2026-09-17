import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  createServerSupabase: vi.fn(() => ({ auth: { getClaims: mocks.getClaims } })),
}));

// 라우트·집계 모듈 테스트와 같은 규약입니다. Server Component가 부르는 server-only 마커는
// vitest에서 그대로 두면 import 시점에 던집니다.
vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));

vi.mock("@/services/supabase", () => ({
  createServerSupabase: mocks.createServerSupabase,
}));

function signedOut() {
  mocks.getClaims.mockResolvedValue({ data: null });
}

function signedIn() {
  mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createServerSupabase.mockImplementation(() => ({ auth: { getClaims: mocks.getClaims } }));
  // 실제로는 layout.tsx의 인라인 스크립트가 세워 둡니다. 여기서는 테마 토글 라벨만 좌우합니다.
  document.documentElement.dataset.theme = "light";
  signedOut();
});

afterEach(() => {
  delete document.documentElement.dataset.theme;
});

describe("랜딩 (S1 · S1b)", () => {
  it("결과를 먼저 말하는 히어로와 노동의 총량을 보여줍니다", async () => {
    render(await Home());

    expect(screen.getByRole("heading", { level: 1, name: "지출이 어디로 새는지" })).toBeVisible();
    expect(screen.getByText(/파일을 올리면 매핑 확인까지 1분, 요약까지 5분입니다./)).toBeVisible();
  });

  it("히어로에 기능 이름이 아니라 결과 화면의 숫자를 먼저 놓습니다", async () => {
    render(await Home());

    const mock = screen.getByTestId("hero-mock");
    // 금액을 만·억으로 축약하지 않습니다(UI_GUIDE `### 금액 표기`).
    expect(within(mock).getByText("₩1,014,290")).toBeVisible();
    expect(within(mock).getByText("₩304,000")).toBeVisible();
    expect(within(mock).getByText(/예시 숫자입니다. 실제 명세서가 아닙니다./)).toBeVisible();
    // 증감은 색만으로 전달하지 않습니다 — 부호와 텍스트가 함께 있습니다.
    expect(within(mock).getByText("+12.4%")).toBeVisible();
    expect(within(mock).getByText("증가")).toBeVisible();
  });

  it("기능 3개를 예시 수치와 함께 설명합니다", async () => {
    render(await Home());

    const features = screen.getByTestId("features");
    for (const name of ["카테고리 자동 분류", "기간별 지출 추이", "구독 누수 탐지"]) {
      expect(within(features).getByRole("heading", { level: 3, name })).toBeVisible();
    }
    expect(within(features).getByText(/188건 중 142건/)).toBeVisible();
    expect(within(features).getByText(/정기결제 4건, 월 ₩127,090/)).toBeVisible();
  });

  it("요금제를 원화로 표기합니다", async () => {
    render(await Home());

    const pricing = screen.getByTestId("pricing");
    expect(within(pricing).getByText("₩0")).toBeVisible();
    expect(within(pricing).getByText("₩9,900")).toBeVisible();
    expect(within(pricing).queryByText(/\$/)).toBeNull();
    expect(within(pricing).getByText(/여러 달치 데이터가 쌓여야 의미가 생기는 기능입니다./)).toBeVisible();
  });

  it("데이터 처리 섹션에서 보관 위치·로그 정책·삭제 경로를 밝힙니다", async () => {
    render(await Home());

    const data = screen.getByTestId("data-handling");
    expect(within(data).getByText(/원본 CSV는 비공개 Storage 버킷에 보관되며/)).toBeVisible();
    expect(within(data).getByText(/거래 내용·가맹점명·금액을 로그에 남기지 않습니다./)).toBeVisible();
    expect(within(data).getByText(/설정 화면에서 금융 데이터를 언제든 삭제할 수 있습니다./)).toBeVisible();
    expect(within(data).getByRole("link", { name: "개인정보처리방침" })).toHaveAttribute("href", "/privacy");
  });

  it("익명 사용자에게는 Google 로그인을 권하고 데모 경로를 함께 줍니다", async () => {
    render(await Home());

    expect(screen.getAllByRole("link", { name: "Google로 시작하기" })).toHaveLength(3);
    expect(screen.queryByRole("link", { name: "대시보드로" })).toBeNull();
    expect(screen.getByRole("link", { name: "샘플 대시보드 보기" })).toHaveAttribute("href", "/demo");
  });

  it("로그인했으면 CTA를 대시보드로 바꿉니다", async () => {
    signedIn();

    render(await Home());

    expect(screen.getAllByRole("link", { name: "대시보드로" })).toHaveLength(3);
    expect(screen.queryByRole("link", { name: "Google로 시작하기" })).toBeNull();
  });

  it("자격증명이 없는 환경에서도 익명 화면을 렌더합니다", async () => {
    mocks.createServerSupabase.mockImplementation(() => {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL 환경변수가 없습니다.");
    });

    render(await Home());

    expect(screen.getAllByRole("link", { name: "Google로 시작하기" })).toHaveLength(3);
  });

  it("테마 토글을 둡니다", async () => {
    render(await Home());

    expect(screen.getByRole("button", { name: "다크 모드로 전환" })).toBeVisible();
  });
});
