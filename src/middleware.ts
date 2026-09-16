import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicSupabaseCredentials } from "@/services/supabase";

// Next는 미들웨어를 `pagesDir ?? appDir`의 상위 폴더에서만 찾습니다. 이 리포는 `src/app`을
// 쓰므로 그 폴더는 `src/`입니다. 리포 루트에 두면 조용히 무시되어 세션 갱신이 통째로
// 사라집니다(빌드도 통과합니다).

const LOGIN_PATH = "/login";

function isProtected(pathname: string): boolean {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}

function toLogin(request: NextRequest): NextResponse {
  // 로그인 후 목적지는 서버가 정합니다. 요청에서 받은 경로로 되돌리면 오픈 리디렉트가 됩니다.
  return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
}

// 자격증명이 아직 채워지지 않은 로컬·CI에서 공개 화면(/ · /demo)까지 500이 되지 않게 합니다.
// 세션 갱신만 건너뛰고, 보호 경로는 아래에서 로그인으로 보내므로 잠금은 그대로입니다.
function configuredCredentials(): { url: string; anonKey: string } | null {
  try {
    const credentials = publicSupabaseCredentials();
    const protocol = new URL(credentials.url).protocol;
    return protocol === "https:" || protocol === "http:" ? credentials : null;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const credentials = configuredCredentials();
  if (!credentials) {
    return isProtected(request.nextUrl.pathname) ? toLogin(request) : NextResponse.next({ request });
  }

  const { url, anonKey } = credentials;
  let response = NextResponse.next({ request });
  const refreshHeaders: Record<string, string> = {};

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        // request에 먼저 씁니다. 그래야 바로 아래에서 다시 만드는 response가 새 토큰을 담은
        // 요청을 이번 요청의 Server Component로 넘깁니다. response에만 쓰면 브라우저는 새
        // 토큰을 받지만 이번 요청의 Server Component는 갱신 전 토큰을 보게 되어, 세션이
        // 산발적으로 끊깁니다.
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // 세션 쿠키가 실린 응답을 CDN이 캐싱하면 다른 사용자에게 같은 토큰이 나갑니다.
        Object.assign(refreshHeaders, headers);
        for (const [name, value] of Object.entries(headers)) {
          response.headers.set(name, value);
        }
      },
    },
  });

  // 응답을 확정하기 전에 호출해야 갱신된 토큰이 setAll로 들어옵니다.
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims?.sub && isProtected(request.nextUrl.pathname)) {
    const redirect = toLogin(request);
    // 만료된 세션은 setAll이 쿠키를 비우며 갱신합니다. 리디렉트 응답이 그 결과를 버리면
    // 다음 요청이 같은 실패를 반복합니다.
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    for (const [name, value] of Object.entries(refreshHeaders)) {
      redirect.headers.set(name, value);
    }
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    // `/api/billing/webhook`은 제외합니다. 인증 미들웨어에 걸리면 Polar 요청이 리디렉트되어
    // 웹훅이 영원히 실패합니다. 정적 파일은 세션과 무관하므로 함께 제외합니다.
    "/((?!_next/static|_next/image|favicon\\.ico|api/billing/webhook).*)",
  ],
};
