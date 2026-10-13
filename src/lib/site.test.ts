import { describe, expect, it } from "vitest";
import { isIndexable, jsonLdText, pageMetadata, siteUrl, siteVerification } from "./site";

const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv;

describe("siteUrl", () => {
  it("NEXT_PUBLIC_SITE_URL을 가장 먼저 씁니다", () => {
    expect(siteUrl(env({
      NEXT_PUBLIC_SITE_URL: "https://finsight.example",
      VERCEL_PROJECT_PRODUCTION_URL: "finsight-zeta-peach.vercel.app",
    })).href).toBe("https://finsight.example/");
  });

  it("없으면 Vercel이 넣는 프로덕션 주소에 https를 붙여 씁니다", () => {
    expect(siteUrl(env({ VERCEL_PROJECT_PRODUCTION_URL: "finsight-zeta-peach.vercel.app" })).href)
      .toBe("https://finsight-zeta-peach.vercel.app/");
  });

  it("둘 다 없으면 로컬 개발 주소를 씁니다", () => {
    expect(siteUrl(env({})).href).toBe("http://localhost:3000/");
  });
});

describe("isIndexable", () => {
  it("프로덕션 배포만 검색 수집을 허용합니다", () => {
    expect(isIndexable(env({ VERCEL_ENV: "production" }))).toBe(true);
  });

  it("프리뷰·로컬은 막습니다 — 프리뷰에는 테스트 계정 로그인이 열려 있습니다", () => {
    expect(isIndexable(env({ VERCEL_ENV: "preview" }))).toBe(false);
    expect(isIndexable(env({ VERCEL_ENV: "development" }))).toBe(false);
    expect(isIndexable(env({}))).toBe(false);
  });
});

describe("siteVerification", () => {
  it("Google·네이버 소유 확인 값을 메타 태그로 옮깁니다", () => {
    expect(siteVerification(env({ GOOGLE_SITE_VERIFICATION: "g-code", NAVER_SITE_VERIFICATION: "n-code" })))
      .toEqual({ google: "g-code", other: { "naver-site-verification": "n-code" } });
  });

  it("값이 없으면 태그를 만들지 않습니다", () => {
    expect(siteVerification(env({}))).toEqual({});
  });
});

describe("jsonLdText", () => {
  it("스크립트를 닫는 문자열이 섞여도 태그 밖으로 나가지 않게 <를 이스케이프합니다", () => {
    const text = jsonLdText({ name: "</script><script>alert(1)</script>" });
    expect(text).not.toContain("<");
    expect(JSON.parse(text)).toEqual({ name: "</script><script>alert(1)</script>" });
  });
});

describe("pageMetadata", () => {
  it("대표 주소와 og:url을 같은 경로로 맞추고 공통 공유 태그를 유지합니다", () => {
    expect(pageMetadata("/demo")).toEqual({
      alternates: { canonical: "/demo" },
      openGraph: {
        siteName: "FinSight",
        locale: "ko_KR",
        type: "website",
        url: "/demo",
        // 페이지가 openGraph를 덮으면 루트의 opengraph-image.png가 따라오지 않아 직접 단다.
        images: [{ url: "/opengraph-image.png", width: 1200, height: 630, alt: "FinSight — 카드 명세서 분석. 이번 달 총지출 예시와 카테고리별 지출 막대" }],
      },
    });
  });
});
