// @vitest-environment node

import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn(() => ({ kind: "service" })) }));
vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

const SERVICE_KEY = "SUPABASE_SERVICE_ROLE_KEY";
const url = "https://project.supabase.co";
const serviceKey = "service-role-key";
const original = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env["NEXT_PUBLIC_SUPABASE_URL"] = url;
  process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] = "anon-key";
  process.env[SERVICE_KEY] = serviceKey;
});

afterEach(() => {
  process.env = { ...original };
});

describe("createServiceSupabase", () => {
  it("service role 키로 만들고 세션을 저장하지 않습니다", async () => {
    const { createServiceSupabase } = await import("./supabase-service");

    expect(createServiceSupabase()).toEqual({ kind: "service" });
    expect(createClient).toHaveBeenCalledWith(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  it("service role 키는 NEXT_PUBLIC_ 접두사 없는 변수에서만 읽습니다", async () => {
    delete process.env[SERVICE_KEY];
    process.env["NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY"] = "유출된 키";
    const { createServiceSupabase } = await import("./supabase-service");

    expect(() => createServiceSupabase()).toThrow(SERVICE_KEY);
    expect(createClient).not.toHaveBeenCalled();
  });
});

it("server-only를 불러와 Client Component에서 import하면 빌드가 실패합니다", async () => {
  // service role 팩토리를 브라우저용 팩토리와 같은 모듈에 두면 Client Component가
  // 실수로 import해도 빌드가 통과한다. 경계 위반을 빌드 단계에서 잡기 위해 모듈을 나눴다.
  const source = await readFile(new URL("./supabase-service.ts", import.meta.url), "utf8");
  expect(source).toMatch(/^import "server-only";/m);
});

it("브라우저용 모듈은 service role 팩토리를 내보내지 않습니다", async () => {
  const mod = await import("./supabase");
  expect(mod).not.toHaveProperty("createServiceSupabase");
});
