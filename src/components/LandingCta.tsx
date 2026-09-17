import Link from "next/link";

// 대시보드·업로드 화면과 같은 primary 버튼 클래스입니다(UI_GUIDE `## 버튼`).
// 랜딩 전용 버튼을 따로 만들지 않습니다 — 랜딩과 대시보드가 같은 톤을 씁니다.
const PRIMARY = "rounded-md bg-text px-4 py-2 text-sm font-medium text-bg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** S1은 로그인으로, S1b는 대시보드로 보냅니다. 익명 사용자에게만 로그인을 권합니다. */
export function LandingCta({ signedIn }: { signedIn: boolean }) {
  return (
    <Link href={signedIn ? "/dashboard" : "/login"} className={PRIMARY}>
      {signedIn ? "대시보드로" : "Google로 시작하기"}
    </Link>
  );
}
