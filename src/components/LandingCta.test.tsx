import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingCta } from "./LandingCta";

describe("랜딩 CTA", () => {
  it("로그인 전에는 Google 로그인으로 보냅니다", () => {
    render(<LandingCta signedIn={false} />);

    const cta = screen.getByRole("link", { name: "Google로 시작하기" });
    expect(cta).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("link", { name: "대시보드로" })).toBeNull();
  });

  it("로그인했으면 대시보드로 보냅니다", () => {
    render(<LandingCta signedIn />);

    const cta = screen.getByRole("link", { name: "대시보드로" });
    expect(cta).toHaveAttribute("href", "/dashboard");
    expect(screen.queryByRole("link", { name: "Google로 시작하기" })).toBeNull();
  });

  it.each([
    [false, "Google로 시작하기", "landing_signup"],
    [true, "대시보드로", "landing_dashboard"],
  ])("로그인 %s이면 클릭 수집에 버튼 이름 %s → %s를 붙입니다", (signedIn, name, cta) => {
    // 자동 수집은 화면 텍스트를 가리므로 버튼을 이름으로 구분합니다(ADR-017).
    render(<LandingCta signedIn={signedIn} />);
    expect(screen.getByRole("link", { name })).toHaveAttribute("data-ph-capture-attribute-cta", cta);
  });

  it("대시보드와 같은 primary 버튼 모양을 씁니다", () => {
    render(<LandingCta signedIn={false} />);

    // UI_GUIDE 원칙 1 — 랜딩과 대시보드가 같은 톤을 씁니다. primary는 무채색입니다.
    const cta = screen.getByRole("link", { name: "Google로 시작하기" });
    expect(cta.className).toContain("bg-text");
    expect(cta.className).toContain("text-bg");
    expect(cta.className).toContain("focus-visible:outline-accent");
  });
});
