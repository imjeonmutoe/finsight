import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FinSight — 카드 명세서 소비 분석",
  description:
    "카드 명세서 CSV를 올리면 카테고리별 소비 분해와 요약을 보여줍니다. 카드번호는 저장 전에 뒤 4자리만 남기고 폐기하며, AI에는 전송되지 않습니다.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
