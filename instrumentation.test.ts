// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

const { captureServerException } = vi.hoisted(() => ({ captureServerException: vi.fn() }));
vi.mock("@/lib/posthog-server", () => ({ captureServerException }));

const { onRequestError } = await import("./instrumentation");

const request = { path: "/dashboard?month=2026-01", method: "GET", headers: {} };
const context = {
  routerKind: "App Router", routePath: "/dashboard", routeType: "render",
  renderSource: "react-server-components", revalidateReason: undefined, renderType: "dynamic",
} as const;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("서버 요청 오류 보고", () => {
  it("라우트 파일 경로·종류·메서드·digest만 붙여 PostHog에 보냅니다", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    const error = Object.assign(new Error("실패"), { digest: "123" });

    await onRequestError(error, request, context);

    expect(captureServerException).toHaveBeenCalledWith(error, {
      route_path: "/dashboard", route_type: "render", method: "GET", digest: "123",
    });
  });

  it("Edge 런타임에서는 보내지 않습니다", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    await onRequestError(new Error("실패"), request, context);
    expect(captureServerException).not.toHaveBeenCalled();
  });
});
