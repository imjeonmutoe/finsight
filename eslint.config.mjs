import coreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  {
    ignores: [
      ".next/**",
      "coverage/**",
      "node_modules/**",
      "next-env.d.ts",
      // 디자인 레퍼런스 프로토타입. 브라우저 전역(React, window.FS, window.Landing)에
      // 의존하는 원본 그대로의 사본이라 프로젝트 lint 규칙 대상이 아니다.
      ".claude/skills/**/prototype/**",
    ],
  },
  ...coreWebVitals,
];

export default config;
