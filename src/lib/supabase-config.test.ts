// @vitest-environment node

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// TOML 파서를 의존성으로 들이지 않는다(ADR-010). 섹션 단위 텍스트로 확인한다.
const path = new URL("../../supabase/config.toml", import.meta.url);
const text = existsSync(path) ? readFileSync(path, "utf8") : "";

const headers = text
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l.startsWith("["));

// `[name]` 헤더부터 다음 헤더 전까지의 본문. 주석 줄은 뺀다.
function section(name: string): string[] {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.trim() === `[${name}]`);
  if (start === -1) return [];
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const t = line.trim();
    if (t.startsWith("[")) break;
    if (t && !t.startsWith("#")) body.push(t.replace(/\s+/g, " "));
  }
  return body;
}

describe("supabase/config.toml", () => {
  it("파일이 있다", () => {
    expect(text, "supabase/config.toml이 없다. Branching은 이 파일로 프리뷰 브랜치 설정을 정한다").not.toBe("");
  });

  it("Storage 버킷을 선언하지 않는다", () => {
    const bad = headers.filter((h) => h.startsWith("[storage.buckets"));
    expect(
      bad,
      "config.toml의 버킷은 PR을 머지하면 프로덕션에 배포되어 마이그레이션이 만든 statements 버킷 설정을 덮어쓸 수 있다",
    ).toEqual([]);
  });

  it("Edge Function을 선언하지 않는다", () => {
    const bad = headers.filter((h) => h.startsWith("[functions"));
    expect(bad, "config.toml의 함수는 PR을 머지하면 프로덕션에 배포된다").toEqual([]);
  });

  it("프리뷰 브랜치에 seed.sql을 넣는다", () => {
    const seed = section("db.seed");
    expect(seed, "[db.seed]가 켜져 있어야 프리뷰 브랜치에 테스트 사용자가 생긴다").toContain("enabled = true");
    expect(seed, "[db.seed]의 sql_paths가 ./seed.sql 하나여야 한다").toContain('sql_paths = ["./seed.sql"]');
  });

  it("Google OAuth를 켜지 않는다", () => {
    expect(
      headers,
      "프리뷰 브랜치마다 콜백 주소가 바뀌어 Google Console에 등록할 수 없다. 켜 두면 실패하는 로그인 버튼만 남는다",
    ).not.toContain("[auth.external.google]");
  });

  it("가입을 막는다", () => {
    // [auth] enable_signup이 GoTrue의 DISABLE_SIGNUP이다. 시드가 SQL로 만든 사용자는 영향받지 않는다.
    expect(section("auth"), "프리뷰에서 아무나 가입할 수 없어야 한다 — [auth] enable_signup = false").toContain(
      "enable_signup = false",
    );
  });

  it("이메일·비밀번호 로그인을 켜 둔다", () => {
    // [auth.email] enable_signup은 이름과 달리 이메일 공급자 자체(EXTERNAL_EMAIL_ENABLED)를 켜고 끈다.
    // false로 두면 가입뿐 아니라 비밀번호 로그인까지 막힌다.
    const email = section("auth.email");
    expect(
      email,
      "[auth.email] enable_signup = true여야 이메일 공급자가 켜져 프리뷰에서 비밀번호로 로그인할 수 있다",
    ).toContain("enable_signup = true");
    expect(email, "시드 사용자는 확인된 상태로 만들므로 이메일 확인을 끈다").toContain("enable_confirmations = false");
  });
});
