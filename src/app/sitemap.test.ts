import { afterEach, describe, expect, it, vi } from "vitest";
import sitemap from "./sitemap";

afterEach(() => vi.unstubAllEnvs());

describe("sitemap.xml", () => {
  it("공개 페이지를 절대 주소로 담고 대시보드는 넣지 않습니다", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://finsight.example");

    expect(sitemap().map((entry) => entry.url)).toEqual([
      "https://finsight.example/",
      "https://finsight.example/demo",
      "https://finsight.example/privacy",
    ]);
  });
});
