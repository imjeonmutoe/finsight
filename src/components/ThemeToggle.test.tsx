import { fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "./ThemeToggle";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("테마 토글", () => {
  it("현재 테마가 다크면 라이트로 바꾸는 버튼을 보여줍니다", () => {
    // layout.tsx의 인라인 스크립트가 첫 페인트 전에 세워 두는 값입니다.
    document.documentElement.dataset.theme = "dark";

    render(<ThemeToggle />);

    expect(screen.getByRole("button", { name: "라이트 모드로 전환" })).toBeVisible();
  });

  it("누르면 data-theme과 localStorage를 함께 바꿉니다", async () => {
    document.documentElement.dataset.theme = "light";

    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: "다크 모드로 전환" }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("theme")).toBe("dark");
    expect(await screen.findByRole("button", { name: "라이트 모드로 전환" })).toBeVisible();
  });

  it("다시 누르면 라이트로 되돌리고 그 선택도 저장합니다", async () => {
    document.documentElement.dataset.theme = "dark";

    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: "라이트 모드로 전환" }));

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem("theme")).toBe("light");
    expect(await screen.findByRole("button", { name: "다크 모드로 전환" })).toBeVisible();
  });

  it("문서 밖에서 테마가 바뀌어도 라벨이 따라갑니다", async () => {
    document.documentElement.dataset.theme = "light";

    render(<ThemeToggle />);
    document.documentElement.dataset.theme = "dark";

    expect(await screen.findByRole("button", { name: "라이트 모드로 전환" })).toBeVisible();
  });

  it("서버 렌더에서는 두 라벨을 모두 내려 CSS가 data-theme으로 하나만 보이게 합니다", () => {
    // 하이드레이션 뒤 라벨이 '테마 전환'에서 길어지면 좁은 폭에서 내비가 줄바꿈되어 본문이 밀립니다(CLS).
    // 인라인 스크립트가 첫 페인트 전에 data-theme을 세우므로 CSS로 고르면 첫 페인트부터 최종 폭입니다.
    const html = renderToString(<ThemeToggle />);

    expect(html).toContain("다크 모드로 전환");
    expect(html).toContain("라이트 모드로 전환");
    expect(html).toContain("in-data-[theme=dark]:hidden");
    expect(html).toContain("hidden in-data-[theme=dark]:inline");
  });

  it("테마가 아직 정해지지 않았으면 단정하지 않고 다크를 먼저 제안합니다", async () => {
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole("button"));

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("저장소에 쓸 수 없어도 테마 전환은 동작합니다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("저장소에 쓸 수 없습니다.");
    });
    document.documentElement.dataset.theme = "light";

    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: "다크 모드로 전환" }));

    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
