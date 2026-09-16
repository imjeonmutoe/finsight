import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next dev`가 AGENTS.md에만 안내 블록을 덧붙여 CLAUDE.md와 어긋나게 한다.
  // 같은 내용을 두 규칙 파일에 직접 적었으므로 자동 생성은 끈다.
  agentRules: false,
};

export default nextConfig;
