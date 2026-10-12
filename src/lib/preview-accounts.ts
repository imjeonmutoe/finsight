import "server-only";

// Supabase 프리뷰 브랜치의 seed.sql만 만드는 계정이다. 프로덕션 DB에는 존재하지 않는다.
// 비밀번호를 클라이언트 번들로 보내지 않도록 서버 모듈에서만 import한다.
export type PreviewAccount = { id: string; email: string; plan: "free" | "pro" };

export const PREVIEW_ACCOUNTS: readonly PreviewAccount[] = [
  { id: "5eed0000-0000-4000-8000-000000000001", email: "free@finsight.test", plan: "free" },
  { id: "5eed0000-0000-4000-8000-000000000002", email: "pro@finsight.test", plan: "pro" },
];

export const PREVIEW_PASSWORD: string = "finsight-preview-only";

// VERCEL_ENV는 Vercel이 서버 런타임에 넣는 값이다. NODE_ENV·호스트 이름·NEXT_PUBLIC_*로 판정하지 않는다 —
// NEXT_PUBLIC_*는 빌드 시점에 고정돼 클라이언트로 나가고, 호스트 판정은 커스텀 도메인에서 틀린다.
export function isPreviewDeployment(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL_ENV === "preview";
}
