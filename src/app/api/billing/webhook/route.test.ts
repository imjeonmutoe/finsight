// @vitest-environment node

import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data: unknown; error: unknown };

const { from, createServiceSupabase } = vi.hoisted(() => {
  const fromFn = vi.fn();
  return { from: fromFn, createServiceSupabase: vi.fn(() => ({ from: fromFn })) };
});
vi.mock("server-only", () => ({}));
vi.mock("@/services/supabase-service", () => ({ createServiceSupabase }));

const original = { ...process.env };
const SECRET = `whsec_${Buffer.from("polar-sandbox-secret").toString("base64")}`;
const NOW = new Date("2026-09-17T12:00:00.000Z");
const USER_ID = "00000000-0000-4000-8000-000000000001";
const CUSTOMER_ID = "22222222-2222-4222-8222-222222222222";
const SUBSCRIPTION_ID = "33333333-3333-4333-8333-333333333333";

// 실제 서명 검증을 그대로 태웁니다. 검증을 모킹하면 401 테스트가 아무것도 지키지 못합니다.
function signed(payload: string, { id = "msg_1", sentAt = Math.floor(NOW.getTime() / 1000) } = {}) {
  const key = Buffer.from(SECRET.slice("whsec_".length), "base64");
  const digest = createHmac("sha256", key).update(`${id}.${sentAt}.${payload}`).digest("base64");
  return { "webhook-id": id, "webhook-timestamp": String(sentAt), "webhook-signature": `v1,${digest}` };
}

function event({
  type = "subscription.active",
  status = "active",
  endsAt = null as string | null,
  modifiedAt = "2026-09-17T11:59:00.000Z" as string | null,
  externalId = USER_ID as string | null,
  metadata = undefined as Record<string, unknown> | undefined,
} = {}) {
  return JSON.stringify({
    type,
    data: {
      id: SUBSCRIPTION_ID,
      status,
      customer_id: CUSTOMER_ID,
      ends_at: endsAt,
      created_at: "2026-09-17T11:58:00.000Z",
      modified_at: modifiedAt,
      customer: { id: CUSTOMER_ID, external_id: externalId },
      ...(metadata === undefined ? {} : { metadata }),
    },
  });
}

function request(payload: string, headers: Record<string, string> = signed(payload)): Request {
  return new Request("http://local/api/billing/webhook", {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: payload,
  });
}

/** update(...).eq(...).lt(...).select(...)를 흉내 내며 호출 인자를 모아 둡니다. */
function profiles(result: Result) {
  const calls: Record<string, unknown[]> = {};
  const api: Record<string, unknown> = {
    then: (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve),
    calls,
  };
  for (const name of ["update", "eq", "lt", "select", "delete"]) {
    api[name] = vi.fn((...args: unknown[]) => {
      calls[name] = args;
      return api;
    });
  }
  return api as Record<string, ReturnType<typeof vi.fn>> & { calls: Record<string, unknown[]> };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  process.env["POLAR_WEBHOOK_SECRET"] = SECRET;
});

afterEach(() => {
  vi.useRealTimers();
  process.env = { ...original };
});

describe("서명 검증", () => {
  it.each<{ name: string; headers: Record<string, string> }>([
    { name: "서명 헤더가 없으면", headers: {} },
    { name: "서명이 틀리면", headers: { "webhook-id": "msg_1", "webhook-timestamp": String(Math.floor(NOW.getTime() / 1000)), "webhook-signature": "v1,YWJjZGVm" } },
  ])("$name 401이며 profiles를 건드리지 않습니다", async ({ headers }) => {
    const { POST } = await import("./route");

    const response = await POST(request(event(), headers));

    expect(response.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it("본문이 바뀐 재전송은 401입니다", async () => {
    const headers = signed(event());
    const { POST } = await import("./route");

    const response = await POST(request(event({ status: "canceled" }), headers));

    expect(response.status).toBe(401);
  });

  it("오래된 타임스탬프는 재생 공격으로 보고 401입니다", async () => {
    const payload = event();
    const { POST } = await import("./route");

    const response = await POST(request(payload, signed(payload, { sentAt: Math.floor(NOW.getTime() / 1000) - 3_600 })));

    expect(response.status).toBe(401);
  });

  it("시크릿이 없으면 500이며 서명 없는 요청을 통과시키지 않습니다", async () => {
    delete process.env["POLAR_WEBHOOK_SECRET"];
    const { POST } = await import("./route");

    const response = await POST(request(event(), {}));

    expect(response.status).toBe(500);
    expect(from).not.toHaveBeenCalled();
  });
});

describe("플랜 전이", () => {
  it("구독이 활성화되면 Pro로 올리고 Polar 식별자를 함께 기록합니다", async () => {
    const table = profiles({ data: [{ id: USER_ID }], error: null });
    from.mockReturnValue(table);
    const payload = event();
    const { POST } = await import("./route");

    const response = await POST(request(payload));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, applied: true });
    expect(createServiceSupabase).toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith("profiles");
    expect(table.calls["update"]?.[0]).toEqual({
      plan: "pro",
      plan_expires_at: null,
      polar_customer_id: CUSTOMER_ID,
      polar_subscription_id: SUBSCRIPTION_ID,
      plan_updated_at: "2026-09-17T11:59:00.000Z",
    });
    // service role은 RLS를 우회하므로 user_id를 코드에서 명시적으로 좁힙니다.
    expect(table.calls["eq"]).toEqual(["id", USER_ID]);
  });

  it.each([
    "subscription.created", "subscription.active", "subscription.updated",
    "subscription.uncanceled", "subscription.cycled",
  ])("%s에서 상태가 active면 Pro입니다", async (type) => {
    const table = profiles({ data: [{ id: USER_ID }], error: null });
    from.mockReturnValue(table);
    const { POST } = await import("./route");

    await POST(request(event({ type })));

    expect((table.calls["update"]?.[0] as { plan: string }).plan).toBe("pro");
  });

  it("체험 중(trialing)도 Pro입니다", async () => {
    const table = profiles({ data: [{ id: USER_ID }], error: null });
    from.mockReturnValue(table);
    const { POST } = await import("./route");

    await POST(request(event({ status: "trialing" })));

    expect((table.calls["update"]?.[0] as { plan: string }).plan).toBe("pro");
  });

  it("결제 전 incomplete 상태는 Pro로 올리지 않습니다", async () => {
    const { POST } = await import("./route");

    const response = await POST(request(event({ type: "subscription.created", status: "incomplete" })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, applied: false });
    expect(from).not.toHaveBeenCalled();
  });

  it("해지 예약(subscription.canceled)에서는 Pro를 유지하고 종료일만 기록합니다", async () => {
    // 사용자가 결제한 기간이 남아 있습니다. 여기서 내리면 낸 만큼을 못 씁니다.
    const table = profiles({ data: [{ id: USER_ID }], error: null });
    from.mockReturnValue(table);
    const { POST } = await import("./route");

    await POST(request(event({
      type: "subscription.canceled", status: "active", endsAt: "2026-10-17T12:00:00.000Z",
    })));

    expect(table.calls["update"]?.[0]).toMatchObject({
      plan: "pro", plan_expires_at: "2026-10-17T12:00:00.000Z",
    });
  });

  it("구독이 실제로 종료되면(subscription.revoked) Free로 내립니다", async () => {
    const table = profiles({ data: [{ id: USER_ID }], error: null });
    from.mockReturnValue(table);
    const { POST } = await import("./route");

    await POST(request(event({
      type: "subscription.revoked", status: "canceled", endsAt: "2026-10-17T12:00:00.000Z",
    })));

    expect((table.calls["update"]?.[0] as { plan: string }).plan).toBe("free");
  });

  it("강등은 profiles만 고치고 거래 데이터를 지우지 않습니다", async () => {
    // 데이터를 지우면 복귀 동기가 함께 사라집니다. Pro 화면만 잠급니다.
    const table = profiles({ data: [{ id: USER_ID }], error: null });
    from.mockReturnValue(table);
    const { POST } = await import("./route");

    await POST(request(event({ type: "subscription.revoked", status: "canceled" })));

    expect(from.mock.calls.map(([name]) => name)).toEqual(["profiles"]);
    expect(table.delete).not.toHaveBeenCalled();
  });

  it.each(["subscription.past_due", "order.paid", "checkout.updated", "benefit_grant.created"])(
    "%s는 처리 대상이 아니므로 profiles를 건드리지 않습니다",
    async (type) => {
      const { POST } = await import("./route");

      const response = await POST(request(event({ type, status: "past_due" })));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ received: true, applied: false });
      expect(from).not.toHaveBeenCalled();
    },
  );
});

describe("멱등과 순서", () => {
  it("같은 웹훅을 두 번 보내도 같은 갱신만 시도합니다", async () => {
    const table = profiles({ data: [{ id: USER_ID }], error: null });
    from.mockReturnValue(table);
    const payload = event();
    const headers = signed(payload);
    const { POST } = await import("./route");

    const first = await POST(request(payload, headers));
    const firstBody = await first.json() as unknown;
    const firstUpdate = table.calls["update"]?.[0];
    const second = await POST(request(payload, headers));

    expect(second.status).toBe(first.status);
    await expect(second.json()).resolves.toEqual(firstBody);
    expect(table.calls["update"]?.[0]).toEqual(firstUpdate);
    // 이벤트 테이블을 만들지 않았습니다. 재실행해도 결과가 같은 UPDATE 하나뿐입니다.
    expect(from.mock.calls.map(([name]) => name)).toEqual(["profiles", "profiles"]);
  });

  it("이벤트 시각보다 최근에 갱신된 프로필은 건드리지 않습니다", async () => {
    // 순서가 뒤바뀐 이벤트를 막는 조건입니다. 조건에 걸리면 UPDATE가 0행을 바꿉니다.
    const table = profiles({ data: [], error: null });
    from.mockReturnValue(table);
    const { POST } = await import("./route");

    const response = await POST(request(event()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, applied: false });
    expect(table.calls["lt"]).toEqual(["plan_updated_at", "2026-09-17T11:59:00.000Z"]);
  });

  it("modified_at이 없으면 created_at을 이벤트 시각으로 씁니다", async () => {
    const table = profiles({ data: [{ id: USER_ID }], error: null });
    from.mockReturnValue(table);
    const { POST } = await import("./route");

    await POST(request(event({ modifiedAt: null })));

    expect(table.calls["lt"]).toEqual(["plan_updated_at", "2026-09-17T11:58:00.000Z"]);
  });
});

describe("사용자 식별", () => {
  it("external_id가 없으면 metadata.user_id로 찾습니다", async () => {
    const table = profiles({ data: [{ id: USER_ID }], error: null });
    from.mockReturnValue(table);
    const { POST } = await import("./route");

    await POST(request(event({ externalId: null, metadata: { user_id: USER_ID } })));

    expect(table.calls["eq"]).toEqual(["id", USER_ID]);
  });

  it("사용자를 찾을 수 없으면 400으로 실패를 드러냅니다", async () => {
    // 조용히 200을 주면 결제가 반영되지 않은 채 Polar 대시보드에도 아무 흔적이 없습니다.
    const { POST } = await import("./route");

    const response = await POST(request(event({ externalId: null })));

    expect(response.status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it("UUID가 아닌 식별자를 거절합니다", async () => {
    const { POST } = await import("./route");

    const response = await POST(request(event({ externalId: "not-a-uuid" })));

    expect(response.status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });
});

describe("잘못된 요청", () => {
  it("JSON이 아니면 400입니다", async () => {
    const payload = "not json";
    const { POST } = await import("./route");

    const response = await POST(request(payload, signed(payload)));

    expect(response.status).toBe(400);
  });

  it("스키마에 맞지 않으면 400입니다", async () => {
    const payload = JSON.stringify({ type: "subscription.active", data: { id: SUBSCRIPTION_ID } });
    const { POST } = await import("./route");

    const response = await POST(request(payload, signed(payload)));

    expect(response.status).toBe(400);
  });

  it("DB 오류는 500으로 돌려 Polar이 재시도하게 합니다", async () => {
    from.mockReturnValue(profiles({ data: null, error: { message: "boom" } }));
    const { POST } = await import("./route");

    const response = await POST(request(event()));

    expect(response.status).toBe(500);
  });

  it("service role 키가 없으면 503입니다", async () => {
    createServiceSupabase.mockImplementationOnce(() => { throw new Error("no key"); });
    const { POST } = await import("./route");

    const response = await POST(request(event()));

    expect(response.status).toBe(503);
  });
});
