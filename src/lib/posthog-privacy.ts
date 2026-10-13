// PostHog로 금융 데이터가 나가지 않게 하는 규칙을 브라우저·서버가 함께 쓴다(ADR-017).

type CapturedEvent = { event: string; properties?: Record<string, unknown> } | null;

/**
 * 예외 이벤트의 메시지를 지운다. 메시지에는 거래 내용이 섞일 수 있다(CLAUDE.md 금융 데이터 로그 금지).
 * 타입과 스택 프레임은 남겨 이슈 묶음과 위치 추적은 그대로 된다.
 */
export function redactExceptionEvent<T extends CapturedEvent>(event: T): T {
  if (!event || event.event !== "$exception") return event;
  const list = event.properties?.$exception_list;
  const properties: Record<string, unknown> = { ...event.properties };
  delete properties.$exception_message;
  if (Array.isArray(list)) {
    properties.$exception_list = list.map((item: Record<string, unknown>) => ({ ...item, value: "[redacted]" }));
  }
  return { ...event, properties };
}

/** 거래 목록의 aria-label·셀 텍스트에 가맹점명과 금액이 들어 있어 자동 수집과 녹화에서 가린다. */
export const BROWSER_PRIVACY_OPTIONS = {
  mask_all_text: true,
  mask_all_element_attributes: true,
  session_recording: { maskAllInputs: true, maskTextSelector: "*" },
  before_send: redactExceptionEvent,
};
