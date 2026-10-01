import "server-only";

import { createClient } from "@supabase/supabase-js";
import { publicSupabaseCredentials, required } from "./supabase";

/**
 * service role. 웹훅·인증된 계정 삭제·인사이트 캐시 기록에만 씁니다.
 * RLS를 우회하므로 사용자 요청 경로에서 쓰지 않습니다.
 */
export function createServiceSupabase() {
  const { url } = publicSupabaseCredentials();
  const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
