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

  it("대시보드와 같은 primary 버튼 모양을 씁니다", () => {
    render(<LandingCta signedIn={false} />);

    // UI_GUIDE 원칙 1 — 랜딩과 대시보드가 같은 톤을 씁니다. primary는 무채색입니다.
    const cta = screen.getByRole("link", { name: "Google로 시작하기" });
    expect(cta.className).toContain("bg-text");
    expect(cta.className).toContain("text-bg");
    expect(cta.className).toContain("focus-visible:outline-accent");
  });
});
