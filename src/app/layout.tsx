import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FinSight",
  description: "카드 명세서와 은행 거래내역을 분석해 지출을 보여줍니다.",
};

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
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script id="theme-init">{themeScript}</script>
      </head>
      <body className="bg-bg text-text antialiased">{children}</body>
    </html>
  );
}
