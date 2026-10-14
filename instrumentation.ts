import type { Instrumentation } from "next";
import { getPostHogLogProvider } from "@/services/posthog-log-provider";

export function register() {
  getPostHogLogProvider();
}

/**
 * 라우트 핸들러·서버 컴포넌트·서버 액션에서 처리되지 않은 예외를 PostHog에 보낸다.
 * posthog-node의 예외 자동 수집은 Next가 먼저 잡는 오류를 보지 못한다.
 * request.path는 쿼리 문자열을 담을 수 있어 라우트 파일 경로만 쓴다.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const digest = typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : undefined;
  const { captureServerException } = await import("@/services/posthog-server");
  await captureServerException(error, {
    route_path: context.routePath,
    route_type: context.routeType,
    method: request.method,
    ...(digest ? { digest } : {}),
  });
};
