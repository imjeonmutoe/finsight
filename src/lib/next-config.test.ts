// @vitest-environment node

import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

async function headersFor(source: string): Promise<Map<string, string>> {
  const rules = (await nextConfig.headers?.()) ?? [];
  const rule = rules.find((entry) => entry.source === source);
  return new Map((rule?.headers ?? []).map(({ key, value }) => [key.toLowerCase(), value]));
}

describe("보안 응답 헤더", () => {
  it("모든 경로에 클릭재킹 방어를 겁니다", async () => {
    // 금융 대시보드를 남의 페이지 iframe에 띄워 버튼을 누르게 하는 공격을 막습니다.
    // frame-ancestors가 표준이고, X-Frame-Options는 그것을 모르는 브라우저용입니다.
    const headers = await headersFor("/:path*");
    expect(headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(headers.get("x-frame-options")).toBe("DENY");
  });

  it("MIME 스니핑·리퍼러 유출·불필요한 브라우저 권한을 막습니다", async () => {
    const headers = await headersFor("/:path*");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("permissions-policy")).toBe("camera=(), microphone=(), geolocation=()");
  });

  it("CSP가 스크립트·스타일·폼 제출을 제한하지 않습니다", async () => {
    // 인라인 테마 스크립트(layout.tsx)와 Vercel Analytics가 있어 script-src를 걸려면 nonce가 필요합니다.
    // form-action은 결제 폼의 Polar 리디렉트를 막을 수 있습니다. 둘 다 이 헤더의 범위 밖입니다.
    const csp = (await headersFor("/:path*")).get("content-security-policy") ?? "";
    expect(csp).not.toMatch(/script-src|style-src|default-src|form-action/);
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("object-src 'none'");
  });
});
