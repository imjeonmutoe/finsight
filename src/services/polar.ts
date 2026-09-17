import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// 샌드박스만 씁니다(PRD `## 프로젝트 성격`). 프로덕션 호스트를 여기에 넣지 않습니다.
const API_BASE = "https://sandbox-api.polar.sh";
// Standard Webhooks가 권고하는 재생 방지 허용 오차입니다.
const SIGNATURE_TOLERANCE_SECONDS = 300;
const SECRET_PREFIX = "whsec_";

const checkoutSchema = z.object({ url: z.url() });
const customerSessionSchema = z.object({ customer_portal_url: z.url() });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 환경변수가 없습니다. .env.local을 확인해 주세요.`);
  return value;
}

/**
 * Polar 체크아웃에 넘길 사용자 IP. 라우트 핸들러에서 만들어진 요청은 Vercel 서버의 IP를
 * 가지므로, 이 값을 빠뜨리면 Polar이 미국으로 지오로케이션해 한국 사용자에게 USD 가격을
 * 보여줍니다. 조직 기본 결제 통화를 KRW로 잡아도 마찬가지입니다.
 */
export function clientIpAddress(headers: Headers): string | null {
  // 프록시가 뒤에 자기 IP를 덧붙입니다. 첫 항목만이 사용자의 IP입니다.
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first ? first : null;
}

/**
 * Standard Webhooks 규격(2026-09-08 이후 발급 시크릿)의 서명을 검증합니다.
 * 그 이전에 발급된 시크릿은 Polar의 구 HMAC 방식이라 키 유도가 다릅니다 — 이 리포는
 * 새로 만든 샌드박스 조직만 쓰므로 새 규격만 구현합니다.
 */
export function verifyWebhookSignature({ secret, headers, payload, now }: {
  secret: string; headers: Headers; payload: string; now: Date;
}): boolean {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signature = headers.get("webhook-signature");
  if (!id || !timestamp || !signature) return false;

  const sentAt = Number(timestamp);
  if (!Number.isInteger(sentAt)) return false;
  if (Math.abs(Math.floor(now.getTime() / 1000) - sentAt) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.startsWith(SECRET_PREFIX)
    ? secret.slice(SECRET_PREFIX.length) : secret, "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest();

  // 키 교체 중에는 서명이 공백으로 구분돼 여러 개 옵니다. 하나라도 맞으면 통과입니다.
  return signature.split(" ").some((entry) => {
    const [version, value] = entry.split(",");
    if (version !== "v1" || value === undefined) return false;
    const received = Buffer.from(value, "base64");
    // 길이가 다르면 timingSafeEqual이 던집니다. 길이는 비밀이 아니므로 먼저 비교합니다.
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}

async function postJson(path: string, body: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${required("POLAR_ACCESS_TOKEN")}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  // 오류 본문에는 사용자 데이터가 섞일 수 있으므로 상태 코드만 남깁니다.
  if (!response.ok) throw new Error(`Polar ${path} 요청이 ${response.status}로 실패했습니다.`);
  return await response.json();
}

/** Pro 구독 체크아웃을 만들고 사용자를 보낼 주소를 돌려줍니다. */
export async function createProCheckout({ userId, email, ipAddress, successUrl }: {
  userId: string; email: string; ipAddress: string | null; successUrl: string;
}): Promise<string> {
  const productId = required("POLAR_PRO_PRODUCT_ID");
  const payload = await postJson("/v1/checkouts/", {
    products: [productId],
    success_url: successUrl,
    customer_email: email,
    // 웹훅에서 이 값으로 사용자를 찾습니다. body의 user_id를 신뢰하지 않기 위한 연결 고리입니다.
    external_customer_id: userId,
    ...(ipAddress === null ? {} : { customer_ip_address: ipAddress }),
    metadata: { user_id: userId },
  });
  return checkoutSchema.parse(payload).url;
}

/** Polar 고객 포털(결제 수단·영수증·해지) 주소를 만듭니다. */
export async function createCustomerPortalUrl({ userId, returnUrl }: {
  userId: string; returnUrl: string;
}): Promise<string> {
  const payload = await postJson("/v1/customer-sessions/", {
    external_customer_id: userId,
    return_url: returnUrl,
  });
  return customerSessionSchema.parse(payload).customer_portal_url;
}
