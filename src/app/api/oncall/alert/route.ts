import { z } from "zod";
import { errorResponse, jsonResponse } from "@/lib/api";
import { logEvent } from "@/lib/event-log";
import { dispatchOncallAlert } from "@/services/github-dispatch";
// Polar와 같은 Standard Webhooks 규격입니다(PostHog HTTP Webhook 목적지의 signing secret).
import { verifyWebhookSignature } from "@/services/polar";
import { createServiceSupabase } from "@/services/supabase-service";

const ALERT_KINDS = [
  "$error_tracking_issue_created",
  "$error_tracking_issue_reopened",
  "$error_tracking_issue_spiking",
] as const;
const UNIQUE_VIOLATION = "23505";

// 급증 수치는 PostHog 템플릿이 문자열로 채웁니다. 단건 alert에서는 비어 있습니다.
const metric = z.union([z.number(), z.string()]).nullish().transform((value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
});
// 이름·설명·스택은 읽지 않습니다. 예외 메시지에 사용자 데이터가 섞일 수 있습니다.
const alertSchema = z.object({
  event_id: z.uuid(),
  kind: z.string(),
  issue_id: z.uuid(),
  current_bucket_value: metric,
  computed_baseline: metric,
});

/**
 * PostHog error tracking alert(단건: 이슈 생성·재발 / 급증) 웹훅. 하는 일은 세 가지뿐입니다 —
 * 서명 검증 → event_id 선삽입(멱등) → CI 위임. 노이즈·신호 판정과 escalation은
 * `.github/workflows/oncall-alert.yml`이 합니다. 여기서는 LLM을 부르지 않습니다.
 *
 * 미들웨어 matcher는 이 경로를 제외합니다(`src/middleware.ts`).
 */
export async function POST(request: Request) {
  const secret = process.env.POSTHOG_ALERT_WEBHOOK_SECRET;
  if (!secret) {
    return errorResponse(500, "WEBHOOK_NOT_CONFIGURED", "웹훅 시크릿이 설정되지 않았습니다.");
  }

  const payload = await request.text();
  if (!verifyWebhookSignature({ secret, headers: request.headers, payload, now: new Date() })) {
    logEvent("oncall_alert_signature_invalid");
    return errorResponse(401, "INVALID_SIGNATURE", "서명을 확인하지 못했습니다.");
  }

  let body: unknown;
  try {
    body = JSON.parse(payload);
  } catch {
    return errorResponse(400, "INVALID_PAYLOAD", "본문을 읽지 못했습니다.");
  }
  const parsed = alertSchema.safeParse(body);
  if (!parsed.success) return errorResponse(400, "INVALID_PAYLOAD", "alert 정보를 읽지 못했습니다.");
  const alert = parsed.data;
  const kind = ALERT_KINDS.find((k) => k === alert.kind);
  if (!kind) return jsonResponse({ received: true, dispatched: false });

  let service: ReturnType<typeof createServiceSupabase>;
  try {
    service = createServiceSupabase();
  } catch {
    return errorResponse(503, "ALERT_STORE_UNAVAILABLE", "지금은 alert를 받을 수 없습니다.");
  }

  // 위임보다 먼저 넣습니다. PostHog의 재전송·중복 전송은 기본 키 충돌로 여기서 멈춥니다.
  const events = service.from("oncall_alert_events");
  const { error } = await events.insert({ event_id: alert.event_id, kind, issue_id: alert.issue_id });
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return jsonResponse({ received: true, duplicate: true, dispatched: false });
    logEvent("oncall_alert_store_failed");
    return errorResponse(503, "ALERT_STORE_FAILED", "alert를 기록하지 못했습니다.");
  }

  try {
    await dispatchOncallAlert({
      eventId: alert.event_id,
      kind,
      issueId: alert.issue_id,
      currentBucketValue: alert.current_bucket_value,
      computedBaseline: alert.computed_baseline,
    });
  } catch {
    // 지우지 않으면 PostHog의 재전송이 '이미 받음'으로 걸러져 alert가 조용히 사라집니다.
    logEvent("oncall_alert_dispatch_failed");
    await service.from("oncall_alert_events").delete().eq("event_id", alert.event_id);
    return errorResponse(502, "ALERT_DISPATCH_FAILED", "분석 작업을 시작하지 못했습니다.");
  }

  return jsonResponse({ received: true, dispatched: true }, 202);
}
