import type { NextConfig } from "next";

// 스크립트·스타일은 제한하지 않습니다. 인라인 테마 스크립트(layout.tsx)와 Vercel Analytics가 있어
// script-src를 걸려면 nonce와 동적 렌더링이 필요합니다. form-action도 두지 않습니다 — 결제 폼의
// Polar 리디렉트를 막을 수 있습니다. 여기 있는 지시어는 어느 화면도 깨지 않는 것만입니다.
const CONTENT_SECURITY_POLICY = ["frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'"].join("; ");

const nextConfig: NextConfig = {
  // `next dev`가 AGENTS.md에만 안내 블록을 덧붙여 CLAUDE.md와 어긋나게 한다.
  // 같은 내용을 두 규칙 파일에 직접 적었으므로 자동 생성은 끈다.
  agentRules: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // 금융 대시보드를 남의 iframe에 띄워 누르게 하는 클릭재킹을 막습니다.
          // X-Frame-Options는 frame-ancestors를 모르는 브라우저용입니다.
          { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
