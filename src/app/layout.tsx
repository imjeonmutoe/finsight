import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
// Pretendard — 한글 본문 서체. dynamic subset은 92개 woff2를 unicode-range로 쪼개
// 두어 브라우저가 화면에 실제로 쓰인 글자의 청크만 받는다. 통짜 variable 파일은
// 2.0MB라 쓸 수 없다. 이 서체를 쓰는 이유는 시스템 폰트로 두면 macOS는 Apple SD
// Gothic Neo, Windows는 맑은 고딕이 잡혀 같은 화면이 OS마다 다르게 보이기 때문이다.
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

// 숫자 전용 서체. next/font가 빌드 타임에 self-host하므로 외부 요청이 없고,
// 폰트 파일을 preload해 FOUT이 생기지 않는다. 라틴 서브셋만 받는다 — 한글은
// 이 서체에 닿지 않으며 globals.css의 Pretendard가 담당한다.
//
// weight를 500 하나로 고정한 이유: 디자인 레퍼런스가 숫자를 항상 500으로 쓴다
// (.claude/skills/finsight-design SKILL.md). 가변 폰트로 두면 100~800 전 굵기를
// 담아 preload가 40KB인데, 500만 받으면 21KB다. 금액만 칠하는 서체에 그 차이는
// 크다. 다른 굵기가 필요해지면 여기서 배열에 추가한다.
const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FinSight — 카드 명세서 소비 분석",
  description:
    "카드 명세서 CSV를 올리면 카테고리별 소비 분해와 요약을 보여줍니다. 카드번호는 저장 전에 뒤 4자리만 남기고 폐기하며, AI에는 전송되지 않습니다.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={jetBrainsMono.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
