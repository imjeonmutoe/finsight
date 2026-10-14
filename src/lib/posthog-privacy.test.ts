import { describe, expect, it } from "vitest";
import { BROWSER_PRIVACY_OPTIONS, redactExceptionEvent } from "./posthog-privacy";

const frames = [{ filename: "app/page.tsx", function: "render", lineno: 3 }];

describe("PostHog 예외 이벤트 정제", () => {
  it("예외 메시지를 지우고 타입과 스택은 남깁니다", () => {
    const event = {
      event: "$exception",
      properties: {
        $exception_list: [{ type: "Error", value: "스타벅스 4,500원 처리 실패", stacktrace: { type: "raw", frames } }],
        $exception_message: "스타벅스 4,500원 처리 실패",
        $exception_level: "error",
      },
    };

    const redacted = redactExceptionEvent(event);

    expect(JSON.stringify(redacted)).not.toContain("스타벅스");
    expect(redacted?.properties.$exception_list).toEqual([
      { type: "Error", value: "[redacted]", stacktrace: { type: "raw", frames } },
    ]);
    expect(redacted?.properties.$exception_level).toBe("error");
  });

  it("예외가 아닌 이벤트는 그대로 둡니다", () => {
    const event = { event: "$pageview", properties: { $current_url: "/dashboard" } };
    expect(redactExceptionEvent(event)).toBe(event);
  });

  it("null은 null로 돌려줍니다", () => {
    expect(redactExceptionEvent(null)).toBeNull();
  });
});

describe("브라우저 수집 설정", () => {
  it("자동 수집과 녹화에서 화면 텍스트·속성을 가립니다", () => {
    // 거래 목록의 aria-label·셀 텍스트에 가맹점명과 금액이 들어 있다.
    expect(BROWSER_PRIVACY_OPTIONS).toMatchObject({
      mask_all_text: true,
      mask_all_element_attributes: true,
      session_recording: { maskAllInputs: true, maskTextSelector: "*" },
    });
    expect(BROWSER_PRIVACY_OPTIONS.before_send).toBe(redactExceptionEvent);
  });
});
