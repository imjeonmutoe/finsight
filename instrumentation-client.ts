import posthog from "posthog-js";
import { createBrowserSupabase } from "@/services/supabase";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
const identifiedUserStorageKey = "posthog_identified_user_id";

function identifiedUserId(): string | null {
  try {
    return window.localStorage.getItem(identifiedUserStorageKey);
  } catch {
    return null;
  }
}

function rememberIdentifiedUser(userId: string) {
  try {
    window.localStorage.setItem(identifiedUserStorageKey, userId);
  } catch {
    // Browser storage can be unavailable; identity still persists in posthog-js.
  }
}

function resetIdentifiedUser() {
  if (!identifiedUserId()) return;

  posthog.reset();
  try {
    window.localStorage.removeItem(identifiedUserStorageKey);
  } catch {
    // The next successful identification will overwrite the marker if storage returns.
  }
}

if (!projectToken || !host) {
  if (process.env.NODE_ENV !== "production") {
    const missingVariable = !projectToken
      ? "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN"
      : "NEXT_PUBLIC_POSTHOG_HOST";

    throw new Error(
      `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
    );
  }
} else {
  posthog.init(projectToken, {
    api_host: host,
    defaults: "2026-01-30",
    capture_exceptions: true,
    debug: process.env.NODE_ENV === "development",
    tracing_headers: [window.location.hostname],
  });

  const supabase = createBrowserSupabase();
  supabase.auth.onAuthStateChange((event, session) => {
    if ((event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "USER_UPDATED") && session?.user) {
      const { id, email } = session.user;
      const previousUserId = identifiedUserId();
      if (previousUserId && previousUserId !== id) posthog.reset();

      if (previousUserId !== id) {
        posthog.identify(id, email ? { email } : undefined);
        rememberIdentifiedUser(id);
      }
      return;
    }

    if (event === "SIGNED_OUT" || (event === "INITIAL_SESSION" && !session)) {
      resetIdentifiedUser();
    }
  });
}
