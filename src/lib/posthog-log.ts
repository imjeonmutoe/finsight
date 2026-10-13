import { SeverityNumber } from "@opentelemetry/api-logs";
import { getPostHogLogProvider } from "../../instrumentation";

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

export async function flushPostHogLogs(): Promise<void> {
  await getPostHogLogProvider()?.forceFlush();
}
