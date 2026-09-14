import { runInNewContext } from "node:vm";
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import Home from "@/app/page";
import RootLayout from "@/app/layout";

it("최소 페이지를 jsdom에서 렌더하고 DOM 매처로 확인합니다", () => {
  render(<Home />);

  expect(screen.getByRole("heading", { name: "FinSight", level: 1 })).toBeVisible();
  expect(screen.getByText("서비스를 준비하고 있습니다.")).toBeInTheDocument();
});

it.each([
  { saved: "light", systemDark: true, expected: "light" },
  { saved: "dark", systemDark: false, expected: "dark" },
  { saved: null, systemDark: true, expected: "dark" },
  { saved: null, systemDark: false, expected: "light" },
  { saved: "unknown", systemDark: true, expected: "dark" },
  { saved: new Error("저장소를 읽을 수 없습니다."), systemDark: true, expected: "dark" },
])("저장된 테마 $saved, 시스템 다크 $systemDark이면 $expected로 초기화합니다", ({ saved, systemDark, expected }) => {
  const html = new DOMParser().parseFromString(
    renderToStaticMarkup(<RootLayout><Home /></RootLayout>),
    "text/html",
  );
  const script = html.head.querySelector("script");

  expect(html.documentElement.lang).toBe("ko");
  expect(html.body.classList.contains("bg-bg")).toBe(true);
  expect(html.body.classList.contains("text-text")).toBe(true);
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
