// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { PREVIEW_ACCOUNTS, PREVIEW_PASSWORD } = await import("./preview-accounts");

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
