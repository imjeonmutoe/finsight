// @vitest-environment node

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CookieMethodsServer } from "@supabase/ssr";

const { createServerClient } = vi.hoisted(() => ({ createServerClient: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient }));

const original = { ...process.env };
const REFRESHED = { name: "sb-token", value: "새 토큰", options: { path: "/" } };
const REFRESH_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
};

// getClaims()가 토큰을 갱신하면 supabase-ssr이 setAll을 호출합니다. 실제 클라이언트가 하는
// 일을 그대로 흉내 내 미들웨어가 그 쿠키를 어디에 쓰는지 봅니다.
function mockSupabase({ sub, refresh }: { sub?: string; refresh: boolean }) {
  createServerClient.mockImplementation((
    _url: string,
    _key: string,
    options: { cookies: CookieMethodsServer },
  ) => ({
    auth: {
      getClaims: async () => {
        if (refresh) options.cookies.setAll?.([REFRESHED], REFRESH_HEADERS);
        return sub ? { data: { claims: { sub } }, error: null } : { data: null, error: null };
      },
    },
  }));
}

function request(path: string) {
  return new NextRequest(new URL(path, "https://finsight.example"));
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://project.supabase.co";
  process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] = "anon-key";
});

afterEach(() => {
  process.env = { ...original };
});

describe("세션 갱신", () => {
  it("갱신된 쿠키를 request와 response 양쪽에 기록합니다", async () => {
    // 한쪽만 쓰면 세션이 산발적으로 끊깁니다. request는 이번 요청의 Server Component가
    // 새 토큰을 보게 하고, response는 브라우저가 새 토큰을 저장하게 합니다.
    mockSupabase({ sub: "user-1", refresh: true });
    const { middleware } = await import("./middleware");
    const incoming = request("/dashboard");

    const response = await middleware(incoming);

    expect(incoming.cookies.get("sb-token")?.value).toBe("새 토큰");
    expect(response.cookies.get("sb-token")?.value).toBe("새 토큰");
  });

  it("갱신 응답에 캐시 제어 헤더를 걸어 CDN 캐싱을 막습니다", async () => {
    mockSupabase({ sub: "user-1", refresh: true });
    const { middleware } = await import("./middleware");

    const response = await middleware(request("/dashboard"));

    for (const [name, value] of Object.entries(REFRESH_HEADERS)) {
      expect(response.headers.get(name)).toBe(value);
    }
  });

  it("리디렉트할 때도 갱신된 쿠키를 잃지 않습니다", async () => {
    // 만료된 세션은 setAll로 쿠키를 비웁니다. 리디렉트 응답이 그 쿠키를 버리면
    // 다음 요청이 같은 실패를 반복합니다.
    mockSupabase({ refresh: true });
    const { middleware } = await import("./middleware");

    const response = await middleware(request("/dashboard"));

    expect(response.status).toBe(307);
    expect(response.cookies.get("sb-token")?.value).toBe("새 토큰");
  });

  it("공개 자격증명으로 서버 클라이언트를 만듭니다", async () => {
    mockSupabase({ sub: "user-1", refresh: false });
    const { middleware } = await import("./middleware");

    await middleware(request("/"));

    expect(createServerClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "anon-key",
      expect.anything(),
    );
  });

  it("쿠키 어댑터가 getAll·setAll 시그니처입니다", async () => {
    mockSupabase({ sub: "user-1", refresh: false });
    const { middleware } = await import("./middleware");
    const incoming = request("/");
    incoming.cookies.set("sb-token", "기존 토큰");

    await middleware(incoming);
    const call = createServerClient.mock.calls[0] as unknown as [string, string, { cookies: CookieMethodsServer & Record<string, unknown> }] | undefined;
    const adapter = call?.[2].cookies;

    expect(adapter?.getAll()).toEqual([{ name: "sb-token", value: "기존 토큰" }]);
    expect(typeof adapter?.setAll).toBe("function");
    expect(adapter?.get).toBeUndefined();
    expect(adapter?.set).toBeUndefined();
    expect(adapter?.remove).toBeUndefined();
  });
});

describe("보호 경로", () => {
  it.each(["/dashboard", "/dashboard/upload", "/dashboard/settings"])(
    "비로그인 상태로 %s에 오면 /login으로 보냅니다",
    async (path) => {
      mockSupabase({ refresh: false });
      const { middleware } = await import("./middleware");

      const response = await middleware(request(path));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("https://finsight.example/login");
    },
  );

  it("돌아갈 경로를 URL 파라미터로 싣지 않습니다", async () => {
    // 오픈 리디렉트를 막기 위해 로그인 후 목적지는 서버가 정합니다.
    mockSupabase({ refresh: false });
    const { middleware } = await import("./middleware");

    const response = await middleware(request("/dashboard?next=https://evil.example"));

    expect(response.headers.get("location")).toBe("https://finsight.example/login");
  });

  it("로그인 상태면 /dashboard를 통과시킵니다", async () => {
    mockSupabase({ sub: "user-1", refresh: false });
    const { middleware } = await import("./middleware");

    const response = await middleware(request("/dashboard"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it.each(["/", "/demo", "/login", "/privacy"])(
    "비로그인 상태여도 공개 경로 %s는 통과시킵니다",
    async (path) => {
      mockSupabase({ refresh: false });
      const { middleware } = await import("./middleware");

      const response = await middleware(request(path));

      expect(response.status).toBe(200);
    },
  );
});

describe("Supabase 자격증명이 없는 환경", () => {
  // 로컬·CI에는 자리표시자만 있을 수 있습니다. 그래도 공개 화면(/ · /demo)은 떠야 합니다.
  beforeEach(() => {
    mockSupabase({ refresh: false });
  });

  it.each([
    { name: "값이 없으면", url: undefined },
    { name: "URL 형식이 아니면", url: "your-project-id.supabase.co" },
  ])("$name 세션 갱신을 건너뛰고 공개 경로를 통과시킵니다", async ({ url }) => {
    if (url === undefined) delete process.env["NEXT_PUBLIC_SUPABASE_URL"];
    else process.env["NEXT_PUBLIC_SUPABASE_URL"] = url;
    const { middleware } = await import("./middleware");

    const response = await middleware(request("/demo"));

    expect(response.status).toBe(200);
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("보호 경로는 여전히 /login으로 보냅니다", async () => {
    // 자격증명이 없다고 대시보드를 열어주면 잠금이 풀립니다.
    delete process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];
    const { middleware } = await import("./middleware");

    const response = await middleware(request("/dashboard"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://finsight.example/login");
  });
});

describe("matcher", () => {
  // Next는 matcher 문자열을 경로 정규식으로 컴파일합니다. 여기서는 제외 규칙만 보면
  // 되므로 같은 패턴을 정규식으로 직접 확인합니다.
  async function runs(pathname: string) {
    const { config } = await import("./middleware");
    return config.matcher.some((pattern) => new RegExp(`^${pattern}$`).test(pathname));
  }

  it("Polar 웹훅을 미들웨어에서 제외합니다", async () => {
    // 인증 미들웨어에 걸리면 Polar 요청이 리디렉트되어 웹훅이 영원히 실패합니다.
    expect(await runs("/api/billing/webhook")).toBe(false);
  });

  it.each(["/_next/static/chunk.js", "/_next/image", "/favicon.ico"])(
    "정적 파일 %s를 제외합니다",
    async (path) => {
      expect(await runs(path)).toBe(false);
    },
  );

  it.each(["/", "/login", "/dashboard", "/dashboard/upload", "/auth/callback", "/api/uploads"])(
    "%s에서는 미들웨어가 돕니다",
    async (path) => {
      expect(await runs(path)).toBe(true);
    },
  );
});
