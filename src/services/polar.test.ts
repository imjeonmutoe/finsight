// @vitest-environment node

import { createHmac, timingSafeEqual } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clientIpAddress, createCustomerPortalUrl, createProCheckout, verifyWebhookSignature,
} from "./polar";

vi.mock("server-only", () => ({}));
// 서명 비교가 실제로 timingSafeEqual을 타는지 보기 위해 감쌉니다. `===`는 타이밍 공격에 노출됩니다.
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

const original = { ...process.env };
const SECRET = `whsec_${Buffer.from("polar-sandbox-secret").toString("base64")}`;
const WEBHOOK_ID = "msg_2KWPBgLlAfxdpx2AI54pPJ85f4W";
const NOW = new Date("2026-09-17T12:00:00.000Z");
const SENT_AT = Math.floor(NOW.getTime() / 1000);
const PAYLOAD = JSON.stringify({ type: "subscription.active" });
const USER_ID = "00000000-0000-4000-8000-000000000001";

function sign(payload: string, timestamp: number, secret = SECRET, id = WEBHOOK_ID): string {
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest("base64")}`;
}

function headers(overrides: Record<string, string | null> = {}): Headers {
  const base: Record<string, string> = {
    "webhook-id": WEBHOOK_ID,
    "webhook-timestamp": String(SENT_AT),
    "webhook-signature": sign(PAYLOAD, SENT_AT),
  };
  const result = new Headers();
  for (const [name, value] of Object.entries({ ...base, ...overrides })) {
    if (value !== null) result.set(name, value);
  }
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env["POLAR_ACCESS_TOKEN"] = "polar_at_test";
  process.env["POLAR_WEBHOOK_SECRET"] = SECRET;
  process.env["POLAR_PRO_PRODUCT_ID"] = "11111111-1111-4111-8111-111111111111";
});

afterEach(() => {
  process.env = { ...original };
  vi.unstubAllGlobals();
});

describe("웹훅 서명 검증", () => {
  it("올바른 서명을 통과시킵니다", () => {
    expect(verifyWebhookSignature({
      secret: SECRET, headers: headers(), payload: PAYLOAD, now: NOW,
    })).toBe(true);
  });

  it("비교에 timingSafeEqual을 씁니다", () => {
    verifyWebhookSignature({ secret: SECRET, headers: headers(), payload: PAYLOAD, now: NOW });

    expect(vi.mocked(timingSafeEqual)).toHaveBeenCalled();
  });

  it.each(["webhook-id", "webhook-timestamp", "webhook-signature"])(
    "%s 헤더가 없으면 거절합니다",
    (name) => {
      expect(verifyWebhookSignature({
        secret: SECRET, headers: headers({ [name]: null }), payload: PAYLOAD, now: NOW,
      })).toBe(false);
    },
  );

  it("서명이 틀리면 거절합니다", () => {
    expect(verifyWebhookSignature({
      secret: SECRET,
      headers: headers({ "webhook-signature": sign(PAYLOAD, SENT_AT, `whsec_${Buffer.from("다른 시크릿").toString("base64")}`) }),
      payload: PAYLOAD,
      now: NOW,
    })).toBe(false);
  });

  it("본문이 바뀌면 거절합니다", () => {
    expect(verifyWebhookSignature({
      secret: SECRET, headers: headers(), payload: `${PAYLOAD} `, now: NOW,
    })).toBe(false);
  });

  it("서명한 webhook-id가 다르면 거절합니다", () => {
    expect(verifyWebhookSignature({
      secret: SECRET, headers: headers({ "webhook-id": "msg_other" }), payload: PAYLOAD, now: NOW,
    })).toBe(false);
  });

  it("길이가 다른 서명에도 예외 없이 거절합니다", () => {
    // timingSafeEqual은 길이가 다르면 던집니다. 그대로 두면 401 대신 500이 나갑니다.
    expect(verifyWebhookSignature({
      secret: SECRET, headers: headers({ "webhook-signature": "v1,YWJj" }), payload: PAYLOAD, now: NOW,
    })).toBe(false);
  });

  it("v1이 아닌 버전 표기를 거절합니다", () => {
    const value = sign(PAYLOAD, SENT_AT).slice("v1,".length);
    expect(verifyWebhookSignature({
      secret: SECRET, headers: headers({ "webhook-signature": `v0,${value}` }), payload: PAYLOAD, now: NOW,
    })).toBe(false);
  });

  it("키 교체 중 여러 서명이 오면 하나만 맞아도 통과시킵니다", () => {
    const valid = sign(PAYLOAD, SENT_AT);
    expect(verifyWebhookSignature({
      secret: SECRET,
      headers: headers({ "webhook-signature": `v1,YWJj ${valid}` }),
      payload: PAYLOAD,
      now: NOW,
    })).toBe(true);
  });

  it.each([
    { name: "오래된", offset: -301 },
    { name: "미래의", offset: 301 },
  ])("$name 타임스탬프는 재생 공격으로 보고 거절합니다", ({ offset }) => {
    const sentAt = SENT_AT + offset;
    expect(verifyWebhookSignature({
      secret: SECRET,
      headers: headers({
        "webhook-timestamp": String(sentAt),
        "webhook-signature": sign(PAYLOAD, sentAt),
      }),
      payload: PAYLOAD,
      now: NOW,
    })).toBe(false);
  });

  it("허용 범위 안의 타임스탬프는 통과시킵니다", () => {
    const sentAt = SENT_AT - 299;
    expect(verifyWebhookSignature({
      secret: SECRET,
      headers: headers({
        "webhook-timestamp": String(sentAt),
        "webhook-signature": sign(PAYLOAD, sentAt),
      }),
      payload: PAYLOAD,
      now: NOW,
    })).toBe(true);
  });

  it("숫자가 아닌 타임스탬프를 거절합니다", () => {
    expect(verifyWebhookSignature({
      secret: SECRET, headers: headers({ "webhook-timestamp": "yesterday" }), payload: PAYLOAD, now: NOW,
    })).toBe(false);
  });
});

describe("clientIpAddress", () => {
  it("x-forwarded-for의 첫 항목을 씁니다", () => {
    // 프록시가 뒤에 자기 IP를 덧붙입니다. 첫 항목만이 사용자의 IP입니다.
    const value = new Headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18" });

    expect(clientIpAddress(value)).toBe("203.0.113.7");
  });

  it("헤더가 없으면 null입니다", () => {
    expect(clientIpAddress(new Headers())).toBeNull();
  });

  it("빈 값이면 null입니다", () => {
    expect(clientIpAddress(new Headers({ "x-forwarded-for": " , 70.41.3.18" }))).toBeNull();
  });
});

describe("createProCheckout", () => {
  function mockFetch(response: { status: number; body: unknown }) {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(response.body), {
      status: response.status, headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("샌드박스 API에 사용자 IP와 함께 체크아웃을 만듭니다", async () => {
    const fetchMock = mockFetch({
      status: 201, body: { id: "checkout-1", url: "https://sandbox.polar.sh/checkout/abc" },
    });

    const url = await createProCheckout({
      userId: USER_ID,
      email: "user@example.com",
      ipAddress: "203.0.113.7",
      successUrl: "https://finsight.example/dashboard/settings?checkout=success",
    });

    expect(url).toBe("https://sandbox.polar.sh/checkout/abc");
    const [endpoint, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    // 프로덕션 토큰을 쓰지 않습니다. 샌드박스 호스트로만 호출합니다.
    expect(endpoint).toBe("https://sandbox-api.polar.sh/v1/checkouts/");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["authorization"]).toBe("Bearer polar_at_test");
    expect(JSON.parse(String(init.body))).toEqual({
      products: ["11111111-1111-4111-8111-111111111111"],
      success_url: "https://finsight.example/dashboard/settings?checkout=success",
      customer_email: "user@example.com",
      external_customer_id: USER_ID,
      // 빠뜨리면 Polar이 Vercel 서버(미국) IP로 지오로케이션해 한국 사용자에게 USD 가격이 뜹니다.
      customer_ip_address: "203.0.113.7",
      metadata: { user_id: USER_ID },
    });
  });

  it("IP를 못 찾으면 그 필드만 빼고 보냅니다", async () => {
    const fetchMock = mockFetch({ status: 201, body: { url: "https://sandbox.polar.sh/checkout/abc" } });

    await createProCheckout({
      userId: USER_ID, email: "user@example.com", ipAddress: null,
      successUrl: "https://finsight.example/dashboard/settings?checkout=success",
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).not.toHaveProperty("customer_ip_address");
  });

  it("Polar이 실패를 돌려주면 던집니다", async () => {
    mockFetch({ status: 422, body: { detail: "invalid product" } });

    await expect(createProCheckout({
      userId: USER_ID, email: "user@example.com", ipAddress: null,
      successUrl: "https://finsight.example/dashboard/settings?checkout=success",
    })).rejects.toThrow();
  });

  it("응답에 url이 없으면 던집니다", async () => {
    mockFetch({ status: 201, body: { id: "checkout-1" } });

    await expect(createProCheckout({
      userId: USER_ID, email: "user@example.com", ipAddress: null,
      successUrl: "https://finsight.example/dashboard/settings?checkout=success",
    })).rejects.toThrow();
  });

  it.each(["POLAR_ACCESS_TOKEN", "POLAR_PRO_PRODUCT_ID"])("%s가 없으면 던집니다", async (name) => {
    delete process.env[name];
    mockFetch({ status: 201, body: { url: "https://sandbox.polar.sh/checkout/abc" } });

    await expect(createProCheckout({
      userId: USER_ID, email: "user@example.com", ipAddress: null,
      successUrl: "https://finsight.example/dashboard/settings?checkout=success",
    })).rejects.toThrow();
  });
});

describe("createCustomerPortalUrl", () => {
  it("외부 고객 ID로 고객 세션을 만들어 포털 주소를 돌려줍니다", async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ customer_portal_url: "https://sandbox.polar.sh/portal?token=x" }),
      { status: 201, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const url = await createCustomerPortalUrl({
      userId: USER_ID, returnUrl: "https://finsight.example/dashboard/settings",
    });

    expect(url).toBe("https://sandbox.polar.sh/portal?token=x");
    const [endpoint, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(endpoint).toBe("https://sandbox-api.polar.sh/v1/customer-sessions/");
    expect(JSON.parse(String(init.body))).toEqual({
      external_customer_id: USER_ID,
      return_url: "https://finsight.example/dashboard/settings",
    });
  });

  it("고객이 아직 없으면 던집니다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));

    await expect(createCustomerPortalUrl({
      userId: USER_ID, returnUrl: "https://finsight.example/dashboard/settings",
    })).rejects.toThrow();
  });
});
