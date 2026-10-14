// @vitest-environment node

import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data: unknown; error: unknown };

const { from, createServiceSupabase } = vi.hoisted(() => {
  const fromFn = vi.fn();
  return { from: fromFn, createServiceSupabase: vi.fn(() => ({ from: fromFn })) };
});
const { logEvent } = vi.hoisted(() => ({ logEvent: vi.fn() }));
const { dispatchOncallAlert } = vi.hoisted(() => ({ dispatchOncallAlert: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/services/supabase-service", () => ({ createServiceSupabase }));
vi.mock("@/services/github-dispatch", () => ({ dispatchOncallAlert }));
vi.mock("@/lib/event-log", () => ({ logEvent }));

const { POST } = await import("./route");

const original = { ...process.env };
const SECRET = `whsec_${Buffer.from("posthog-alert-secret").toString("base64")}`;
const NOW = new Date("2026-10-14T06:00:00.000Z");
const EVENT_ID = "01a13900-0000-7000-8000-000000000001";
const ISSUE_ID = "01a13411-0000-7000-8000-000000000002";

// 실제 서명 검증을 그대로 태웁니다(Polar 웹훅 테스트와 같은 이유).
function signed(payload: string, { id = "msg_1", sentAt = Math.floor(NOW.getTime() / 1000) } = {}) {
  const key = Buffer.from(SECRET.slice("whsec_".length), "base64");
  const digest = createHmac("sha256", key).update(`${id}.${sentAt}.${payload}`).digest("base64");
  return { "webhook-id": id, "webhook-timestamp": String(sentAt), "webhook-signature": `v1,${digest}` };
}

function alert(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    event_id: EVENT_ID,
    kind: "$error_tracking_issue_spiking",
    issue_id: ISSUE_ID,
    // PostHog 템플릿은 값을 문자열로 채웁니다. 단건 alert에서는 빈 문자열입니다.
    current_bucket_value: "40",
    computed_baseline: "2",
    // 이슈 이름·설명은 받아도 쓰지 않습니다 — 예외 메시지에 사용자 데이터가 섞일 수 있습니다.
    name: "TypeError",
    ...overrides,
  });
}

function request(payload: string, headers: Record<string, string> = signed(payload)): Request {
  return new Request("http://local/api/oncall/alert", {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: payload,
  });
}

/** insert(...)·delete().eq(...)를 흉내 내며 호출 인자를 모아 둡니다. */
function table(results: { insert?: Result; delete?: Result } = {}) {
  const calls: Record<string, unknown[]> = {};
  const chain = (result: Result) => {
    const api: Record<string, unknown> = {
      then: (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve),
    };
    api["eq"] = vi.fn((...args: unknown[]) => {
      calls["eq"] = args;
      return api;
    });
    return api;
  };
  const api = {
    calls,
    insert: vi.fn((...args: unknown[]) => {
      calls["insert"] = args;
      return chain(results.insert ?? { data: null, error: null });
    }),
    delete: vi.fn(() => {
      calls["delete"] = [];
      return chain(results.delete ?? { data: null, error: null });
    }),
  };
  from.mockReturnValue(api);
  return api;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  process.env["POSTHOG_ALERT_WEBHOOK_SECRET"] = SECRET;
  dispatchOncallAlert.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  process.env = { ...original };
});

describe("시크릿·서명", () => {
  it("시크릿이 없으면 500을 돌려주고 아무것도 하지 않습니다", async () => {
    delete process.env["POSTHOG_ALERT_WEBHOOK_SECRET"];
    const t = table();

    const response = await POST(request(alert()));

    expect(response.status).toBe(500);
    expect(t.insert).not.toHaveBeenCalled();
  });

  it.each<{ name: string; headers: Record<string, string> }>([
    { name: "서명 헤더 없음", headers: {} },
    { name: "다른 시크릿으로 서명", headers: { ...signed(alert()), "webhook-signature": "v1,AAAA" } },
    { name: "5분 넘게 지난 서명", headers: signed(alert(), { sentAt: Math.floor(NOW.getTime() / 1000) - 301 }) },
  ])("$name → 401, 저장·위임 없음", async ({ headers }) => {
    const t = table();

    const response = await POST(request(alert(), headers));

    expect(response.status).toBe(401);
    expect(logEvent).toHaveBeenCalledWith("oncall_alert_signature_invalid");
    expect(t.insert).not.toHaveBeenCalled();
    expect(dispatchOncallAlert).not.toHaveBeenCalled();
  });

  it("본문이 바뀌면 서명이 맞지 않습니다", async () => {
    const t = table();

    const response = await POST(request(alert({ issue_id: EVENT_ID }), signed(alert())));

    expect(response.status).toBe(401);
    expect(t.insert).not.toHaveBeenCalled();
  });
});

describe("본문", () => {
  it.each([
    ["JSON이 아님", "not-json"],
    ["event_id가 UUID가 아님", alert({ event_id: "abc" })],
    ["issue_id 없음", alert({ issue_id: undefined })],
  ])("%s → 400", async (_name, payload) => {
    const t = table();

    const response = await POST(request(payload));

    expect(response.status).toBe(400);
    expect(t.insert).not.toHaveBeenCalled();
  });

  it("error tracking alert가 아닌 이벤트는 저장하지 않고 200으로 넘깁니다", async () => {
    const t = table();

    const response = await POST(request(alert({ kind: "$pageview" })));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ dispatched: false });
    expect(t.insert).not.toHaveBeenCalled();
  });
});

describe("멱등 · 위임", () => {
  it("event_id를 먼저 넣고 나서 CI에 위임합니다", async () => {
    const t = table();
    const order: string[] = [];
    t.insert.mockImplementationOnce((...args: unknown[]) => {
      order.push("insert");
      t.calls["insert"] = args;
      return { then: (resolve: (value: Result) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve) };
    });
    dispatchOncallAlert.mockImplementationOnce(async () => {
      order.push("dispatch");
    });

    const response = await POST(request(alert()));

    expect(response.status).toBe(202);
    expect(from).toHaveBeenCalledWith("oncall_alert_events");
    expect(t.calls["insert"]).toEqual([{ event_id: EVENT_ID, kind: "$error_tracking_issue_spiking", issue_id: ISSUE_ID }]);
    expect(order).toEqual(["insert", "dispatch"]);
    expect(dispatchOncallAlert).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      kind: "$error_tracking_issue_spiking",
      issueId: ISSUE_ID,
      currentBucketValue: 40,
      computedBaseline: 2,
    });
  });

  it("단건 alert는 급증 수치를 null로 넘깁니다", async () => {
    table();

    await POST(request(alert({ kind: "$error_tracking_issue_created", current_bucket_value: "", computed_baseline: "" })));

    expect(dispatchOncallAlert).toHaveBeenCalledWith(expect.objectContaining({
      kind: "$error_tracking_issue_created", currentBucketValue: null, computedBaseline: null,
    }));
  });

  it("이미 받은 event_id면 위임하지 않고 200을 돌려줍니다", async () => {
    table({ insert: { data: null, error: { code: "23505" } } });

    const response = await POST(request(alert()));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ duplicate: true, dispatched: false });
    expect(dispatchOncallAlert).not.toHaveBeenCalled();
  });

  it("저장에 실패하면 위임하지 않고 503으로 재전송을 받습니다", async () => {
    table({ insert: { data: null, error: { code: "08006" } } });

    const response = await POST(request(alert()));

    expect(response.status).toBe(503);
    expect(logEvent).toHaveBeenCalledWith("oncall_alert_store_failed");
    expect(dispatchOncallAlert).not.toHaveBeenCalled();
  });

  it("service role 클라이언트를 못 만들면 503입니다", async () => {
    createServiceSupabase.mockImplementationOnce(() => {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.");
    });

    const response = await POST(request(alert()));

    expect(response.status).toBe(503);
    expect(dispatchOncallAlert).not.toHaveBeenCalled();
  });

  it("위임에 실패하면 넣은 event_id를 지우고 502로 재전송을 받습니다", async () => {
    // 지우지 않으면 PostHog의 재전송이 '이미 받음'으로 걸러져 alert가 조용히 사라집니다.
    const t = table();
    dispatchOncallAlert.mockRejectedValueOnce(new Error("GitHub workflow_dispatch 요청이 401로 실패했습니다."));

    const response = await POST(request(alert()));

    expect(response.status).toBe(502);
    expect(logEvent).toHaveBeenCalledWith("oncall_alert_dispatch_failed");
    expect(t.delete).toHaveBeenCalled();
    expect(t.calls["eq"]).toEqual(["event_id", EVENT_ID]);
  });
});
