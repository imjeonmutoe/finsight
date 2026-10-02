// @vitest-environment node

import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CookieMethodsServer } from "@supabase/ssr";

const { createBrowserClient, createServerClient } = vi.hoisted(() => ({
  createBrowserClient: vi.fn(() => ({ kind: "browser" })),
  createServerClient: vi.fn(() => ({ kind: "server" })),
}));
vi.mock("@supabase/ssr", () => ({ createBrowserClient, createServerClient }));

const URL_KEY = "NEXT_PUBLIC_SUPABASE_URL";
const ANON_KEY = "NEXT_PUBLIC_SUPABASE_ANON_KEY";
const url = "https://project.supabase.co";
const anonKey = "anon-key";

// 각 테스트가 환경변수를 지웠다 되돌릴 수 있도록 원본을 보관합니다.
const original = { ...process.env };

// createServerClient에 넘어간 쿠키 어댑터를 꺼냅니다. 어댑터 모양(getAll/setAll)이
// 이 step의 핵심 사양이므로 호출 인자에서 직접 확인합니다.
function serverCookieAdapter(index = 0): CookieMethodsServer {
  const call = createServerClient.mock.calls[index] as unknown as [string, string, { cookies: CookieMethodsServer }] | undefined;
  if (!call) throw new Error("서버 클라이언트 생성 호출이 없습니다.");
  return call[2].cookies;
}

function cookieStore() {
  return { getAll: vi.fn(() => [{ name: "sb-token", value: "값" }]), set: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env[URL_KEY] = url;
  process.env[ANON_KEY] = anonKey;
});

afterEach(() => {
  process.env = { ...original };
});

it("모듈을 불러오는 것만으로는 클라이언트를 만들지 않습니다", async () => {
  // 모듈 최상위에서 클라이언트를 만들면 환경변수 없이 도는 next build가 깨집니다.
  await import("./supabase");

  expect(createBrowserClient).not.toHaveBeenCalled();
  expect(createServerClient).not.toHaveBeenCalled();
});

it("next/headers를 불러오지 않습니다", async () => {
  // 이 모듈은 Client Component가 createBrowserSupabase를 쓰려고 함께 불러옵니다.
  // next/headers를 import하면 그 번들이 통째로 빌드에 실패합니다.
  const source = await readFile(new URL("./supabase.ts", import.meta.url), "utf-8");

  expect(source).not.toMatch(/from\s+["']next\/headers["']/);
});

it("브라우저 클라이언트를 공개 환경변수로 만듭니다", async () => {
  const { createBrowserSupabase } = await import("./supabase");

  expect(createBrowserSupabase()).toEqual({ kind: "browser" });
  expect(createBrowserClient).toHaveBeenCalledWith(url, anonKey);
});

describe("createServerSupabase", () => {
  it("공개 환경변수와 주입받은 쿠키 저장소로 서버 클라이언트를 만듭니다", async () => {
    const { createServerSupabase } = await import("./supabase");

    expect(createServerSupabase(cookieStore())).toEqual({ kind: "server" });
    expect(createServerClient).toHaveBeenCalledWith(url, anonKey, expect.anything());
  });

  it("쿠키 어댑터가 getAll·setAll 시그니처입니다", async () => {
    const { createServerSupabase } = await import("./supabase");
    createServerSupabase(cookieStore());
    const adapter = serverCookieAdapter() as CookieMethodsServer & Record<string, unknown>;

    expect(typeof adapter.getAll).toBe("function");
    expect(typeof adapter.setAll).toBe("function");
    // 구 @supabase/auth-helpers-nextjs의 get/set/remove 시그니처를 쓰지 않습니다.
    expect(adapter.get).toBeUndefined();
    expect(adapter.set).toBeUndefined();
    expect(adapter.remove).toBeUndefined();
  });

  it("쿠키를 읽고 씁니다", async () => {
    const store = cookieStore();
    const { createServerSupabase } = await import("./supabase");
    createServerSupabase(store);
    const adapter = serverCookieAdapter();

    expect(adapter.getAll()).toEqual([{ name: "sb-token", value: "값" }]);
    adapter.setAll?.([{ name: "sb-token", value: "새 값", options: { path: "/" } }], {});
    expect(store.set).toHaveBeenCalledWith("sb-token", "새 값", { path: "/" });
  });

  it("쿠키를 쓸 수 없는 Server Component에서는 setAll이 실패를 삼킵니다", async () => {
    const store = cookieStore();
    store.set.mockImplementation(() => {
      throw new Error("Cookies can only be modified in a Server Action or Route Handler");
    });
    const { createServerSupabase } = await import("./supabase");
    createServerSupabase(store);
    const adapter = serverCookieAdapter();

    // 세션 갱신은 미들웨어가 담당하므로 Server Component의 쓰기 실패는 정상 경로입니다.
    expect(() => adapter.setAll?.([{ name: "sb-token", value: "새 값", options: {} }], {})).not.toThrow();
  });
});

it.each([
  { name: URL_KEY },
  { name: ANON_KEY },
])("$name이 없으면 한국어 오류를 던집니다", async ({ name }) => {
  delete process.env[name];
  const { createBrowserSupabase } = await import("./supabase");

  expect(() => createBrowserSupabase()).toThrow(new RegExp(`${name} 환경변수가 없습니다`));
});
