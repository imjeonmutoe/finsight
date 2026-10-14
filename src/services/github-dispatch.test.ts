// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { dispatchOncallAlert } = await import("./github-dispatch");

const original = { ...process.env };
const ALERT = {
  eventId: "01a13900-0000-7000-8000-000000000001",
  kind: "$error_tracking_issue_spiking" as const,
  issueId: "01a13411-0000-7000-8000-000000000002",
  currentBucketValue: 40,
  computedBaseline: 2,
};

beforeEach(() => {
  process.env["GITHUB_DISPATCH_TOKEN"] = "github_pat_test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...original };
});

describe("dispatchOncallAlert", () => {
  it("main의 oncall-alert.yml을 workflow_dispatch로 깨웁니다", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await dispatchOncallAlert(ALERT);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/imjeonmutoe/finsight/actions/workflows/oncall-alert.yml/dispatches");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["authorization"]).toBe("Bearer github_pat_test");
    expect(JSON.parse(String(init.body))).toEqual({
      ref: "main",
      inputs: {
        event_id: ALERT.eventId,
        kind: ALERT.kind,
        issue_id: ALERT.issueId,
        current_bucket_value: "40",
        computed_baseline: "2",
      },
    });
  });

  it("단건 alert의 빈 급증 수치는 빈 문자열로 보냅니다", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await dispatchOncallAlert({ ...ALERT, kind: "$error_tracking_issue_created", currentBucketValue: null, computedBaseline: null });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).inputs).toMatchObject({ current_bucket_value: "", computed_baseline: "" });
  });

  it("토큰이 없으면 요청하지 않고 던집니다", async () => {
    delete process.env["GITHUB_DISPATCH_TOKEN"];
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(dispatchOncallAlert(ALERT)).rejects.toThrow("GITHUB_DISPATCH_TOKEN");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("GitHub이 거절하면 상태 코드만 담아 던집니다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad credentials github_pat_x", { status: 401 })));

    const error = await dispatchOncallAlert(ALERT).then(() => null, (e: unknown) => e as Error);
    expect(error?.message).toContain("401");
    expect(error?.message).not.toContain("github_pat_x");
  });
});
