// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { PREVIEW_ACCOUNTS, PREVIEW_PASSWORD, isPreviewDeployment } = await import("./preview-accounts");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("프리뷰 계정", () => {
  it("Free와 Pro 계정을 하나씩 둡니다", () => {
    expect(PREVIEW_ACCOUNTS.map((account) => account.plan).sort()).toEqual(["free", "pro"]);
  });

  it("고정 UUID와 실제가 아닌 도메인의 이메일을 씁니다", () => {
    for (const account of PREVIEW_ACCOUNTS) {
      expect(account.id).toMatch(UUID);
      expect(account.email).toMatch(/^[a-z0-9.-]+@finsight\.test$/);
    }
    expect(new Set(PREVIEW_ACCOUNTS.map((account) => account.id)).size).toBe(PREVIEW_ACCOUNTS.length);
    expect(new Set(PREVIEW_ACCOUNTS.map((account) => account.email)).size).toBe(PREVIEW_ACCOUNTS.length);
  });

  it("비밀번호가 비어 있지 않습니다", () => {
    expect(PREVIEW_PASSWORD.length).toBeGreaterThanOrEqual(12);
  });
});

// Next의 타입 보강이 NODE_ENV를 필수로 둔다. 판정에 쓰이지 않는 값이므로 production으로 채운다.
function env(vars: Record<string, string>): NodeJS.ProcessEnv {
  return { NODE_ENV: "production", ...vars } as NodeJS.ProcessEnv;
}

describe("isPreviewDeployment", () => {
  it("Vercel 프리뷰 배포에서만 참입니다", () => {
    expect(isPreviewDeployment(env({ VERCEL_ENV: "preview" }))).toBe(true);
  });

  it("프로덕션·개발·미설정에서는 거짓입니다", () => {
    expect(isPreviewDeployment(env({ VERCEL_ENV: "production" }))).toBe(false);
    expect(isPreviewDeployment(env({ VERCEL_ENV: "development" }))).toBe(false);
    expect(isPreviewDeployment(env({}))).toBe(false);
  });

  it("NODE_ENV로 판정하지 않습니다", () => {
    expect(isPreviewDeployment(env({ NODE_ENV: "development" }))).toBe(false);
  });
});
