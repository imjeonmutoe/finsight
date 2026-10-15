import { initPostHogBrowser } from "@/services/posthog-browser";
import { createBrowserSupabase } from "@/services/supabase";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

// 키가 없으면 초기화하지 않는다. 로컬은 일부러 비운다 — 개발 서버 에러가 prod 프로젝트에 섞이면
// oncall alert가 공개 Issue를 연다(CLAUDE.md `oncall — prod alert 1차 방어선`).
if (projectToken && host) {
  initPostHogBrowser(projectToken, host, createBrowserSupabase());
}
