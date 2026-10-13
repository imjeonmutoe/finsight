import type { Metadata } from "next";
import Link from "next/link";
import { isPreviewDeployment, PREVIEW_ACCOUNTS } from "@/lib/preview-accounts";
import { signInAsPreviewAccount, signInWithGoogle } from "./actions";

// S2의 단일 목표는 Google 버튼 하나다(docs/ARCHITECTURE.md 화면 인벤토리).
// 소개 문구·기능 요약·요금제는 랜딩이 이미 했으므로 이 화면에 두지 않는다(docs/UX_GUIDE.md 3.3).
// 예외: Vercel 프리뷰 배포에서만 Google 버튼 아래에 시드 테스트 계정 로그인을 보조로 둔다(프리뷰 DB는 OAuth 콜백을 등록할 수 없다).

// 검색 결과에 로그인 화면이 따로 뜨지 않게 한다. 링크는 따라가도 된다.
export const metadata: Metadata = {
  title: "로그인 | FinSight",
  robots: { index: false, follow: true },
};

// 오류 코드는 받은 값을 그대로 보여주지 않고 정해진 문장으로만 옮긴다.
const ERROR_MESSAGE = "로그인을 완료하지 못했습니다. 아래 버튼으로 다시 시도해 주세요.";
const PREVIEW_ERROR_MESSAGE =
  "테스트 계정으로 로그인하지 못했습니다. 프리뷰 DB에 시드가 들어갔는지 확인해 주세요.";

const PLAN_LABEL = { free: "Free", pro: "Pro" } as const;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const preview = isPreviewDeployment();

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-6 py-16">
      <div className="w-full max-w-md rounded-md border border-border-default bg-bg p-8">
        <p className="text-sm font-medium text-muted">FinSight</p>
        <h1 className="mt-3 text-2xl font-semibold leading-snug text-text">로그인</h1>

        {error ? (
          <p role="alert" className="mt-4 text-sm leading-relaxed text-up">
            {error === "preview" ? PREVIEW_ERROR_MESSAGE : ERROR_MESSAGE}
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

        {preview ? (
          <section className="mt-6 border-t border-border-default pt-6">
            <h2 className="text-sm font-medium text-muted">프리뷰 전용</h2>
            <p className="mt-2 text-sm leading-relaxed text-text-body">
              이 화면은 미리보기 배포에서만 보입니다. 테스트 데이터가 들어 있는 계정으로 로그인합니다.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              {PREVIEW_ACCOUNTS.map((account) => (
                <form key={account.id} action={signInAsPreviewAccount}>
                  <input type="hidden" name="accountId" value={account.id} />
                  <button
                    type="submit"
                    className="w-full rounded-md border border-border-default px-4 py-2 text-sm text-text hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {PLAN_LABEL[account.plan]} 테스트 계정으로 로그인하기
                  </button>
                </form>
              ))}
            </div>
          </section>
        ) : null}

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
