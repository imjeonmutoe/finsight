import { fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("posthog-js", () => ({ default: { captureException } }));

const { default: GlobalError } = await import("./global-error");

const error = Object.assign(new Error("스타벅스 4,500원 처리 중 실패"), { digest: "abc123" });

afterEach(() => {
  vi.clearAllMocks();
});

describe("전역 에러 화면", () => {
  it("한국어 문서로 원인과 다음 행동을 보여 주고 에러 내용은 표시하지 않습니다", () => {
    const html = new DOMParser().parseFromString(
      renderToStaticMarkup(<GlobalError error={error} retry={() => undefined} reset={() => undefined} />),
      "text/html",
    );

    expect(html.documentElement.lang).toBe("ko");
    expect(html.body.classList.contains("bg-bg")).toBe(true);
    expect(html.querySelector("h1")?.textContent).toBe("화면을 불러오지 못했습니다");
    expect(html.body.textContent).not.toContain("스타벅스");
    expect(html.body.textContent).not.toMatch(/Application error|client-side exception/);
  });

  it("에러를 PostHog에 보내고 다시 시도하기로 재시도합니다", () => {
    const retry = vi.fn();
    render(<GlobalError error={error} retry={retry} reset={() => undefined} />);

    expect(captureException).toHaveBeenCalledWith(error);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도하기" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
