/**
 * 운영자가 알아야 하는 이벤트를 Vercel 함수 로그에 남긴다.
 * 고정된 코드만 받는다. 금융 데이터를 로그에 남기지 않는 규칙을 호출하는 쪽의 주의가 아니라
 * 타입으로 지키려는 것이다 — 메시지·추가 필드 자리를 만들지 마라.
 */
export type EventCode =
  | "webhook_signature_invalid"
  | "webhook_plan_update_failed"
  | "insight_cache_unavailable"
  | "insight_cache_read_failed"
  | "insight_cache_write_failed";

export function logEvent(event: EventCode): void {
  console.warn(JSON.stringify({ event }));
}
