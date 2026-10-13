import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "./robots";

afterEach(() => vi.unstubAllEnvs());

describe("robots.txt", () => {
  it("프로덕션에서는 공개 페이지만 열고 로그인 뒤 경로를 막습니다", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://finsight.example");

    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: ["/dashboard", "/api/", "/auth/"] },
      sitemap: "https://finsight.example/sitemap.xml",
    });
  });

  it("프리뷰에서는 전부 막습니다 — 테스트 계정 로그인이 열려 있습니다", () => {
    vi.stubEnv("VERCEL_ENV", "preview");

    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });
});
