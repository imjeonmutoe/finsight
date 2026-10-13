import type { Instrumentation } from "next";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";

let loggerProvider: LoggerProvider | null = null;

export function getPostHogLogProvider(): LoggerProvider | null {
  if (process.env.NEXT_RUNTIME === "edge") return null;

  const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

  if (!projectToken || !host) {
    if (process.env.NODE_ENV !== "production") {
      const missingVariable = !projectToken
        ? "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN"
        : "NEXT_PUBLIC_POSTHOG_HOST";
      throw new Error(
        `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
      );
    }
    return null;
  }

  loggerProvider ??= new LoggerProvider({
    resource: resourceFromAttributes({ "service.name": "finsight" }),
    processors: [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({
          url: `${host.replace(/\/$/, "")}/i/v1/logs`,
          headers: {
            Authorization: `Bearer ${projectToken}`,
            "Content-Type": "application/json",
          },
        }),
      }),
    ],
  });

  return loggerProvider;
}

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
  const { captureServerException } = await import("@/lib/posthog-server");
  await captureServerException(error, {
    route_path: context.routePath,
    route_type: context.routeType,
    method: request.method,
    ...(digest ? { digest } : {}),
  });
};
