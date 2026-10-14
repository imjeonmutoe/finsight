import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";

let loggerProvider: LoggerProvider | null = null;

/**
 * 서버에서 나가는 이벤트·로그에 붙이는 배포 환경. 로컬 개발 서버도 같은 PostHog 프로젝트로 보내므로,
 * 이 표시가 없으면 개발 중 핫 리로드로 생긴 이벤트가 프로덕션 지표에 섞인다. Vercel 밖이면 development다.
 */
export function deploymentEnvironment(): string {
  return process.env.VERCEL_ENV ?? "development";
}

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
    resource: resourceFromAttributes({
      "service.name": "finsight",
      "deployment.environment.name": deploymentEnvironment(),
    }),
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
