import { runInNewContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import RootLayout from "@/app/layout";

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
