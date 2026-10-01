import { z } from "zod";
import { errorResponse, jsonResponse } from "@/lib/api";
import { verifyWebhookSignature } from "@/services/polar";
import { createServiceSupabase } from "@/services/supabase-service";
import type { Plan } from "@/types/billing";

// 상태가 active·trialing이면 Pro로 올리는 이벤트들입니다. `subscription.canceled`도 여기 있습니다 —
// 그것은 기간 말 해지 "예약"이고 구독은 여전히 active라서, 플랜은 유지하고 `ends_at`만 기록합니다.
const SUBSCRIPTION_EVENTS = new Set([
  "subscription.created", "subscription.active", "subscription.updated",
  "subscription.canceled", "subscription.uncanceled", "subscription.cycled",
]);
// 실제 종료입니다. Polar 문서 기준 구독이 확정적으로 회수되는 유일한 이벤트이고, 결제 실패도
// dunning이 끝나면 이 이벤트로 옵니다. 취소 예약과 혼동하면 낸 기간을 못 쓰게 됩니다.
const REVOKED_EVENT = "subscription.revoked";
const ACTIVE_STATUSES = new Set(["active", "trialing"]);

const envelopeSchema = z.object({ type: z.string() });
const eventSchema = z.object({
  data: z.object({
    id: z.uuid(),
    status: z.string(),
    customer_id: z.uuid(),
    created_at: z.string(),
    modified_at: z.string().nullish(),
    ends_at: z.string().nullish(),
    customer: z.object({ external_id: z.string().nullish() }).nullish(),
    metadata: z.object({ user_id: z.string().optional() }).nullish(),
  }),
});

function isoOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function planFor(type: string, status: string): Plan | null {
  if (type === REVOKED_EVENT) return "free";
  if (SUBSCRIPTION_EVENTS.has(type) && ACTIVE_STATUSES.has(status)) return "pro";
  return null;
}

const ignored = () => jsonResponse({ received: true, applied: false });

/**
 * Polar 웹훅. 하는 일이 `UPDATE profiles` 하나뿐이라 재실행해도 결과가 같습니다 —
 * 이벤트 테이블을 두지 않습니다(ADR 데이터 모델). 순서가 뒤바뀐 이벤트만 아래
 * `plan_updated_at` 비교로 막습니다.
 *
 * 미들웨어 matcher는 이 경로를 제외합니다(`src/middleware.ts`). 걸리면 Polar 요청이
 * /login으로 리디렉트돼 웹훅이 조용히 전부 실패합니다.
 */
export async function POST(request: Request) {
  const secret = process.env.POLAR_WEBHOOK_SECRET;
  if (!secret) {
    return errorResponse(500, "WEBHOOK_NOT_CONFIGURED", "웹훅 시크릿이 설정되지 않았습니다.");
  }

  const payload = await request.text();
  if (!verifyWebhookSignature({ secret, headers: request.headers, payload, now: new Date() })) {
    return errorResponse(401, "INVALID_SIGNATURE", "서명을 확인하지 못했습니다.");
  }

  let body: unknown;
  try {
    body = JSON.parse(payload);
  } catch {
    return errorResponse(400, "INVALID_PAYLOAD", "본문을 읽지 못했습니다.");
  }

  const envelope = envelopeSchema.safeParse(body);
  if (!envelope.success) return errorResponse(400, "INVALID_PAYLOAD", "본문을 읽지 못했습니다.");
  // 구독 이벤트가 아니면 data 모양이 아예 다릅니다. 스키마를 태우기 전에 걸러냅니다.
  const type = envelope.data.type;
  if (type !== REVOKED_EVENT && !SUBSCRIPTION_EVENTS.has(type)) return ignored();

  const event = eventSchema.safeParse(body);
  if (!event.success) return errorResponse(400, "INVALID_PAYLOAD", "구독 정보를 읽지 못했습니다.");
  const subscription = event.data.data;

  // 체크아웃에서 넣어 둔 연결 고리입니다. 둘 다 없으면 어느 계정의 결제인지 알 수 없습니다.
  const claimed = subscription.customer?.external_id ?? subscription.metadata?.user_id ?? null;
  const userId = z.uuid().safeParse(claimed);
  if (!userId.success) {
    return errorResponse(400, "UNMAPPED_CUSTOMER", "결제와 연결된 계정을 찾지 못했습니다.");
  }

  const plan = planFor(type, subscription.status);
  if (plan === null) return ignored();

  // 이벤트가 만들어진 시각입니다. 전달 시각(webhook-timestamp)은 재시도마다 바뀌어
  // 순서 판정에 쓸 수 없습니다.
  const eventAt = isoOrNull(subscription.modified_at) ?? isoOrNull(subscription.created_at);
  if (eventAt === null) return errorResponse(400, "INVALID_PAYLOAD", "이벤트 시각을 읽지 못했습니다.");

  let service: ReturnType<typeof createServiceSupabase>;
  try {
    service = createServiceSupabase();
  } catch {
    return errorResponse(503, "BILLING_UNAVAILABLE", "지금은 구독 상태를 갱신할 수 없습니다.");
  }

  // 강등해도 거래·업로드는 그대로 둡니다. Pro 화면만 잠깁니다.
  // `lt`가 순서 역전과 재전송을 함께 막습니다 — 같은 이벤트가 다시 오면 0행을 바꿉니다.
  const { data, error } = await service.from("profiles").update({
    plan,
    plan_expires_at: isoOrNull(subscription.ends_at),
    polar_customer_id: subscription.customer_id,
    polar_subscription_id: subscription.id,
    plan_updated_at: eventAt,
  }).eq("id", userId.data).lt("plan_updated_at", eventAt).select("id");

  if (error) {
    return errorResponse(500, "PLAN_UPDATE_FAILED", "구독 상태를 갱신하지 못했습니다.");
  }

  return jsonResponse({ received: true, applied: (data ?? []).length > 0 });
}
