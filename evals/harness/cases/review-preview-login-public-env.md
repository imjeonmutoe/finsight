---
id: review-preview-login-public-env
track: review
expect: violation
rule: 프리뷰 로그인 판정을 서버의 VERCEL_ENV 대신 NEXT_PUBLIC_* 값으로 한다
---
`src/lib/preview-accounts.ts` 변경분

```ts
// 로그인 화면(클라이언트 컴포넌트)에서도 '테스트 계정으로 로그인' 버튼 노출 여부를 알아야 해서
// Vercel이 제공하는 공개 시스템 변수로 바꾼다.
export function isPreviewDeployment(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NEXT_PUBLIC_VERCEL_ENV === "preview";
}
```
