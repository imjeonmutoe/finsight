import type { Metadata } from "next";

export const SITE_NAME = "FinSight";

// 검색엔진에 수집을 허용하는 공개 페이지. 대시보드는 로그인 뒤라 넣지 않는다.
export const PUBLIC_PATHS = ["/", "/demo", "/privacy", "/guide/card-statement-analysis"] as const;

/**
 * 대표 주소(canonical)·공유 이미지·사이트맵의 절대 주소 기준점.
 * NEXT_PUBLIC_SITE_URL이 없으면 Vercel이 모든 배포에 넣어 주는 프로덕션 주소를 쓴다 —
 * 프리뷰에서도 canonical이 프로덕션을 가리키게 된다.
 */
export function siteUrl(env: NodeJS.ProcessEnv = process.env): URL {
  if (env.NEXT_PUBLIC_SITE_URL) return new URL(env.NEXT_PUBLIC_SITE_URL);
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return new URL(`https://${env.VERCEL_PROJECT_PRODUCTION_URL}`);
  return new URL("http://localhost:3000");
}

// 공유 태그의 공통 부분. 페이지가 openGraph를 따로 주면 레이아웃 것도, 루트의 opengraph-image.png도
// 통째로 덮인다(필드 단위로 합치지 않는다). 그래서 이미지를 여기서 명시하고 페이지 쪽에서도 함께 넣는다.
// alt는 app/opengraph-image.alt.txt와 같은 문장이다.
export const SHARED_OPEN_GRAPH = {
  siteName: SITE_NAME,
  locale: "ko_KR",
  type: "website",
  images: [{ url: "/opengraph-image.png", width: 1200, height: 630, alt: "FinSight — 카드 명세서 분석. 이번 달 총지출 예시와 카테고리별 지출 막대" }],
};

// 공개 페이지의 대표 주소와 og:url을 같은 경로로 맞춘다. 상대 경로는 metadataBase가 절대 주소로 바꾼다.
export function pageMetadata(path: (typeof PUBLIC_PATHS)[number]): Pick<Metadata, "alternates" | "openGraph"> {
  return { alternates: { canonical: path }, openGraph: { ...SHARED_OPEN_GRAPH, url: path } };
}

// 프로덕션 배포만 수집을 허용한다. 프리뷰에는 테스트 계정 비밀번호 로그인이 열려 있어
// 검색에 걸리면 안 된다. 판정은 isPreviewDeployment와 같은 이유로 VERCEL_ENV만 본다.
export function isIndexable(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL_ENV === "production";
}

// Google Search Console·네이버 서치어드바이저 소유 확인. 공개되는 값이라 비밀이 아니다.
export function siteVerification(env: NodeJS.ProcessEnv = process.env): NonNullable<Metadata["verification"]> {
  return {
    ...(env.GOOGLE_SITE_VERIFICATION ? { google: env.GOOGLE_SITE_VERIFICATION } : {}),
    ...(env.NAVER_SITE_VERIFICATION ? { other: { "naver-site-verification": env.NAVER_SITE_VERIFICATION } } : {}),
  };
}

// JSON-LD를 <script> 자식 텍스트로 넣기 위한 직렬화. dangerouslySetInnerHTML을 쓰지 않으므로
// `</script>`로 태그를 닫고 나가는 것만 막으면 된다.
export function jsonLdText(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
