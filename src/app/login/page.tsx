import Link from "next/link";
import { signInWithGoogle } from "./actions";

// S2의 단일 목표는 Google 버튼 하나다(docs/ARCHITECTURE.md 화면 인벤토리).
// 소개 문구·기능 요약·요금제는 랜딩이 이미 했으므로 이 화면에 두지 않는다(docs/UX_GUIDE.md 3.3).

// 오류 코드는 받은 값을 그대로 보여주지 않고 정해진 문장으로만 옮긴다.
const ERROR_MESSAGE = "로그인을 완료하지 못했습니다. 아래 버튼으로 다시 시도해 주세요.";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const failed = Boolean((await searchParams).error);

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-6 py-16">
      <div className="w-full max-w-md rounded-md border border-border-default bg-bg p-8">
        <p className="text-sm font-medium text-muted">FinSight</p>
        <h1 className="mt-3 text-2xl font-semibold leading-snug text-text">로그인</h1>

        {failed ? (
          <p role="alert" className="mt-4 text-sm leading-relaxed text-up">
            {ERROR_MESSAGE}
          </p>
        ) : null}

        <form action={signInWithGoogle} className="mt-6">
          <button
            type="submit"
            className="w-full rounded-md bg-text px-4 py-2 text-sm font-medium text-bg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Google로 계속하기
          </button>
        </form>

        <p className="mt-4 text-sm leading-relaxed text-text-body">
          카드번호와 계좌번호는 받지 않고, 카드사에서 내려받은 CSV 파일만 사용합니다.
        </p>

        <p className="mt-6 text-sm leading-relaxed text-muted">
          <Link
            href="/privacy"
            className="text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            개인정보처리방침
          </Link>
        </p>
      </div>
    </main>
  );
}
