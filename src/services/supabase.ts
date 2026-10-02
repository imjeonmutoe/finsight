import { createBrowserClient, createServerClient, type CookieOptions } from "@supabase/ssr";

// 이 모듈은 `next/headers`를 불러오지 않습니다. Client Component가 createBrowserSupabase를
// 쓰려면 이 모듈을 함께 불러오는데, next/headers가 들어 있으면 그 번들이 통째로 빌드에
// 실패합니다. 그래서 쿠키 저장소는 호출하는 쪽이 `await cookies()`로 주입합니다.
// (src/lib/queries.ts가 Supabase 클라이언트를 주입받는 것과 같은 규약)
type CookieStore = {
  getAll(): { name: string; value: string }[];
  set(name: string, value: string, options?: CookieOptions): void;
};

// 환경변수는 반드시 `process.env.NEXT_PUBLIC_*` 리터럴로 읽습니다. Next는 이 형태의 정적
// 표현식만 클라이언트 번들에 인라인하므로, 변수 키로 감싸 읽으면 브라우저에서 값이 사라집니다.
// 그래서 이름과 값을 따로 받습니다.
export function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} 환경변수가 없습니다. .env.local을 확인해 주세요.`);
  }
  return value;
}

/**
 * 공개 자격증명. 브라우저와 미들웨어가 함께 씁니다.
 * service role 키는 여기 넣지 않습니다 — 클라이언트 번들에 들어가면 즉시 유출입니다.
 */
export function publicSupabaseCredentials(): { url: string; anonKey: string } {
  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    anonKey: required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  };
}

/** Client Component용. */
export function createBrowserSupabase() {
  const { url, anonKey } = publicSupabaseCredentials();
  return createBrowserClient(url, anonKey);
}

/** Server Component · Route Handler · Server Action용. `createServerSupabase(await cookies())`. */
export function createServerSupabase(cookieStore: CookieStore) {
  const { url, anonKey } = publicSupabaseCredentials();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component는 쿠키를 쓸 수 없습니다. 토큰 갱신은 middleware가 담당하므로
          // 여기서 실패해도 세션은 유지됩니다.
        }
      },
    },
  });
}

// service role 팩토리는 `./supabase-service`에 있다. `server-only`를 걸기 위해 나눴다 —
// 이 모듈은 Client Component도 불러오므로 여기 두면 브라우저 번들 경계를 빌드가 못 지킨다.
