import { headers } from "next/headers";
import { after } from "next/server";
import { PostHog } from "posthog-node";
import { flushPostHogLogs, logPostHogCapture } from "./posthog-log";
import { redactExceptionEvent } from "@/lib/posthog-privacy";

let client: PostHog | null = null;

export function getPostHogClient(): PostHog | null {
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

  client ??= new PostHog(projectToken, {
    host,
    enableExceptionAutocapture: true,
    privacyMode: true,
    before_send: redactExceptionEvent,
    flushAt: 1,
    flushInterval: 0,
  });
  return client;
}

export async function captureServerEvent({
  distinctId,
  event,
  properties,
}: {
  distinctId: string;
  event: string;
  properties?: Record<string, boolean | number | string>;
}) {
  const posthog = getPostHogClient();
  if (!posthog) return;

  const sessionId = (await headers()).get("x-posthog-session-id");
  posthog.capture({
    distinctId,
    event,
    properties: {
      ...(properties ?? {}),
      ...(sessionId ? { $session_id: sessionId } : {}),
    },
  });
  // 계측 실패가 이미 끝난 저장을 500으로 바꾸지 않게 한다.
  try {
    await posthog.flush();
  } catch {
    return;
  }

  logPostHogCapture(event);
  after(flushPostHogLogs);
}

/** 제품상 의미 있는 실패(한도·용량·매핑·분류·결제)를 한 이벤트 이름으로 모은다. 코드는 errorResponse의 고정 코드다. */
export async function trackApiFailure(distinctId: string, route: string, status: number, errorCode: string) {
  await captureServerEvent({
    distinctId,
    event: "api_request_failed",
    properties: { route, status, error_code: errorCode },
  });
}

/** 처리되지 않은 서버 예외. 메시지는 before_send가 지운다. 오류 보고가 또 다른 오류를 만들지 않게 삼킨다. */
export async function captureServerException(error: unknown, properties: Record<string, string>) {
  try {
    const posthog = getPostHogClient();
    if (!posthog) return;
    posthog.captureException(error, undefined, properties);
    await posthog.flush();
  } catch {
    // 보고 실패는 무시한다.
  }
}
