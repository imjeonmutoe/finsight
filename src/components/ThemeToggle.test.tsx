import { fireEvent, render, screen } from "@testing-library/react";
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

  it("테마가 아직 정해지지 않았으면 단정하지 않고 다크를 먼저 제안합니다", async () => {
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole("button", { name: "테마 전환" }));

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
