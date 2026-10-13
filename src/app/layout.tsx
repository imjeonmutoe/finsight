import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
// 계측은 이것 하나다. 이벤트 테이블도 직접 작성한 추적 코드도 두지 않는다(step 10).
import { Analytics } from "@vercel/analytics/next";
// Pretendard — 한글 본문 서체. dynamic subset은 92개 woff2를 unicode-range로 쪼개
// 두어 브라우저가 화면에 실제로 쓰인 글자의 청크만 받는다. 통짜 variable 파일은
// 2.0MB라 쓸 수 없다. 이 서체를 쓰는 이유는 시스템 폰트로 두면 macOS는 Apple SD
// Gothic Neo, Windows는 맑은 고딕이 잡혀 같은 화면이 OS마다 다르게 보이기 때문이다.
// 패키지 파일을 그대로 쓰지 않고 굵기 축을 400~700으로 자른 사본을 쓴다 — 청크가 약 30%
// 작다. OFL 예약 이름 때문에 패밀리 이름은 FinSight Sans다 (scripts/gen_pretendard.py).
import "./fonts/pretendard.css";
import "./globals.css";
import { isIndexable, SHARED_OPEN_GRAPH, SITE_NAME, siteUrl, siteVerification } from "@/lib/site";

// 숫자 전용 서체. next/font가 빌드 타임에 self-host하므로 외부 요청이 없다.
// preload하지 않는다 — 금액이 없는 화면(개인정보 처리방침 등)에서도 31KB를 첫 렌더 전에
// CSS와 대역을 나눠 받게 되기 때문이다. 쓰는 화면에서만 받는다. 라틴 계열만 받는다 — 한글은
// 이 서체에 닿지 않으며 globals.css의 Pretendard가 담당한다.
//
// 굵기를 500·600 둘로 고정한 이유: 본문 숫자는 500이지만 UI_GUIDE의 타이포그래피 표가
// 큰 숫자(KPI)를 font-semibold(600)로 정한다. 500만 받으면 브라우저가 600을 합성 볼드로
// 그려 숫자가 뭉개진다. 가변 폰트로 100~800 전 굵기를 담으면 preload가 40KB인데 두 굵기만
// 받으면 그 절반 수준이다. 굵기를 더 쓰게 되면 여기 배열에 추가한다.
//
// fallback에 Pretendard를 둔 이유: JetBrains Mono에는 원화 기호 U+20A9 글리프가 없다.
// 그러면 ₩만 next/font가 만드는 로컬 fallback face(Arial 기반, 전 범위를 덮는다)로 떨어져
// 숫자의 2.1배 폭으로 그려지고 OS마다 달라진다 — Pretendard를 들인 이유와 같은 문제가
// 금액에서 되살아난다. 그 face는 --font-jetbrains 변수 안에 들어 있어 globals.css의 뒤쪽
// 후보로는 우회할 수 없다(adjustFontFallback: false는 Next 16.3.4에서 효과가 없다).
// fallback으로 주면 그 face보다 앞에 놓여 ₩를 Pretendard가 가져간다.
const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-jetbrains",
  display: "swap",
  preload: false,
  fallback: ["FinSight Sans"],
});

// 환경 변수로 갈리는 값(기준 주소·수집 허용·소유 확인)이 있어 함수로 둔다. 요청 시점 API를 쓰지 않으므로
// 빌드 때 한 번 계산된다.
export function generateMetadata(): Metadata {
  return {
    metadataBase: siteUrl(),
    // 하위 페이지는 "로그인"처럼 짧게 쓰고 서비스 이름은 템플릿이 붙인다.
    title: { default: "FinSight — 카드 명세서 소비 분석", template: `%s | ${SITE_NAME}` },
    // 실제 동작만 적는다. 원본 CSV는 ADR-004에 따라 계좌·카드번호째로 비공개 버킷에 보관하며,
    // 자르지 않는다. AI에 가는 것은 정제된 가맹점명과 금액뿐이다(lib/sanitize.ts).
    description:
      "카드 명세서 CSV를 올리면 카테고리별 소비 분해와 요약을 보여줍니다. 원본 파일은 본인만 접근할 수 있는 비공개 저장소에 보관하며, AI에는 계좌·카드번호를 가린 가맹점명과 금액만 전송합니다.",
    // 공유 이미지는 app/opengraph-image.png를 Next가 자동으로 붙인다.
    // og:url은 페이지별로 다르므로 여기 두지 않는다(lib/site.ts의 pageMetadata).
    openGraph: SHARED_OPEN_GRAPH,
    twitter: { card: "summary_large_image" },
    verification: siteVerification(),
    // 프리뷰는 robots.txt로도 막지만, 링크를 타고 들어온 크롤러를 위해 페이지에도 단다.
    ...(isIndexable() ? {} : { robots: { index: false, follow: false } }),
  };
}

// 고정된 코드만 실행한다. 사용자 선택은 테마 이름으로만 읽는다.
const themeScript = `
(function () {
  var theme;
  try {
    theme = window.localStorage.getItem("theme");
  } catch {}
  if (theme !== "light" && theme !== "dark") {
    theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.dataset.theme = theme;
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={jetBrainsMono.variable} suppressHydrationWarning>
      <head>
        <script id="theme-init">{themeScript}</script>
      </head>
      <body className="bg-bg text-text antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
