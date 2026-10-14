import { SeverityNumber } from "@opentelemetry/api-logs";
import { after } from "next/server";
import { getPostHogLogProvider } from "./posthog-log-provider";

const loggerName = "finsight-posthog-integration";

export function logPostHogCapture(event: string): void {
  const provider = getPostHogLogProvider();
  if (!provider) return;

  provider.getLogger(loggerName).emit({
    body: "PostHog product analytics event captured",
    severityNumber: SeverityNumber.INFO,
    attributes: { analytics_event: event },
  });
}

/** event-log의 고정 코드를 PostHog 로그에 경고로 남긴다. 운영 로그가 요청을 실패시키지 않게 삼킨다. */
export function logPostHogOpsEvent(code: string): void {
  try {
    const provider = getPostHogLogProvider();
    if (!provider) return;
    provider.getLogger(loggerName).emit({
      body: "운영 이벤트",
      severityNumber: SeverityNumber.WARN,
      severityText: "WARN",
      attributes: { event_code: code },
    });
    after(flushPostHogLogs);
  } catch {
    // 설정 누락·요청 밖 호출은 Vercel 함수 로그(console.warn)만으로 충분하다.
  }
}

export async function flushPostHogLogs(): Promise<void> {
  await getPostHogLogProvider()?.forceFlush();
}
