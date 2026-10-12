import "server-only";

// Supabase 프리뷰 브랜치의 seed.sql만 만드는 계정이다. 프로덕션 DB에는 존재하지 않는다.
// 비밀번호를 클라이언트 번들로 보내지 않도록 서버 모듈에서만 import한다.
export type PreviewAccount = { id: string; email: string; plan: "free" | "pro" };

export const PREVIEW_ACCOUNTS: readonly PreviewAccount[] = [
  { id: "5eed0000-0000-4000-8000-000000000001", email: "free@finsight.test", plan: "free" },
  { id: "5eed0000-0000-4000-8000-000000000002", email: "pro@finsight.test", plan: "pro" },
];

export const PREVIEW_PASSWORD: string = "finsight-preview-only";
