import posthog from "posthog-js";
import { createBrowserSupabase } from "@/services/supabase";
import { BROWSER_PRIVACY_OPTIONS } from "./posthog-privacy";

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

export function initPostHogBrowser(projectToken: string, host: string): void {
  posthog.init(projectToken, {
    api_host: host,
    defaults: "2026-01-30",
    capture_exceptions: true,
    debug: process.env.NODE_ENV === "development",
    tracing_headers: [window.location.hostname],
    ...BROWSER_PRIVACY_OPTIONS,
  });

  const supabase = createBrowserSupabase();
  supabase.auth.onAuthStateChange((event, session) => {
    if ((event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "USER_UPDATED") && session?.user) {
      const { id } = session.user;
      const previousUserId = identifiedUserId();
      if (previousUserId && previousUserId !== id) posthog.reset();

      // 이메일은 보내지 않는다. 사람은 Supabase user id로 찾는다(ADR-017).
      if (previousUserId !== id) {
        posthog.identify(id);
        rememberIdentifiedUser(id);
      }
      return;
    }

    if (event === "SIGNED_OUT" || (event === "INITIAL_SESSION" && !session)) {
      resetIdentifiedUser();
    }
  });
}
