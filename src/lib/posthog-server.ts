import { headers } from "next/headers";
import { after } from "next/server";
import { PostHog } from "posthog-node";
import { flushPostHogLogs, logPostHogCapture } from "./posthog-log";

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
  await posthog.flush();

  logPostHogCapture(event);
  after(flushPostHogLogs);
}
