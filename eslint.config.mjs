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
      // 에이전트 worktree 체크아웃. 리포 사본이라 빌드 산출물까지 딸려 온다.
      ".claude/worktrees/**",
    ],
  },
  ...coreWebVitals,
];

export default config;
