import { runInNewContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import RootLayout, { generateMetadata } from "@/app/layout";

afterEach(() => vi.unstubAllEnvs());

function renderLayout() {
  return new DOMParser().parseFromString(
    renderToStaticMarkup(<RootLayout><p>본문</p></RootLayout>),
    "text/html",
  );
}

it("한국어 문서와 토큰 배경을 세웁니다", () => {
  const html = renderLayout();

  expect(html.documentElement.lang).toBe("ko");
  expect(html.body.classList.contains("bg-bg")).toBe(true);
  expect(html.body.classList.contains("text-text")).toBe(true);
});

it.each([
  { saved: "light", systemDark: true, expected: "light" },
  { saved: "dark", systemDark: false, expected: "dark" },
  { saved: null, systemDark: true, expected: "dark" },
  { saved: null, systemDark: false, expected: "light" },
  { saved: "unknown", systemDark: true, expected: "dark" },
  { saved: new Error("저장소를 읽을 수 없습니다."), systemDark: true, expected: "dark" },
])("저장된 테마 $saved, 시스템 다크 $systemDark이면 $expected로 초기화합니다", ({ saved, systemDark, expected }) => {
  const html = renderLayout();
  const script = html.head.querySelector("script");

  expect(script).not.toBeNull();

  runInNewContext(script?.textContent ?? "", {
    document: html,
    window: {
      localStorage: {
        getItem(key: string) {
          expect(key).toBe("theme");
          if (saved instanceof Error) throw saved;
          return saved;
        },
      },
      matchMedia(query: string) {
        expect(query).toBe("(prefers-color-scheme: dark)");
        return { matches: systemDark };
      },
    },
  });

  expect(html.documentElement.dataset.theme).toBe(expected);
});

it("공유 미리보기와 대표 주소의 기준 주소를 세웁니다", () => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://finsight.example");

  const metadata = generateMetadata();

  expect(String(metadata.metadataBase)).toBe("https://finsight.example/");
  expect(metadata.openGraph).toMatchObject({ siteName: "FinSight", locale: "ko_KR", type: "website" });
  expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
});

it("프로덕션이 아니면 검색 수집을 막는 메타 태그를 답니다", () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  expect(generateMetadata().robots).toEqual({ index: false, follow: false });

  vi.stubEnv("VERCEL_ENV", "production");
  expect(generateMetadata().robots).toBeUndefined();
});

it("Google·네이버 소유 확인 값을 메타 태그로 넣습니다", () => {
  vi.stubEnv("GOOGLE_SITE_VERIFICATION", "g-code");
  vi.stubEnv("NAVER_SITE_VERIFICATION", "n-code");

  expect(generateMetadata().verification).toEqual({ google: "g-code", other: { "naver-site-verification": "n-code" } });
});
