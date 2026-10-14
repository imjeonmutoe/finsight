import type { Metadata } from "next";
import Link from "next/link";
import { MAX_CSV_ROWS, MAX_FILE_BYTES } from "@/lib/limits";
import { jsonLdText, pageMetadata, siteUrl } from "@/lib/site";
import { CATEGORIES } from "@/types/category";

const PATH = "/guide/card-statement-analysis";
const TITLE = "카드 명세서 분석하는 법";
const DESCRIPTION =
  "카드사·은행에서 명세서 파일을 내려받아 올리고, 카테고리별 지출과 정기결제를 확인하는 순서를 안내합니다. 총지출을 명세서와 대조하는 법도 함께 설명합니다.";

// 검색으로 들어오는 안내 글이다. 카드사별 메뉴 경로는 직접 확인할 수 없고 자주 바뀌어 적지 않는다(ADR-018).
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...pageMetadata(PATH),
};

// 제약 숫자는 업로드 화면과 같은 상수에서 가져온다. 글과 제품이 따로 놀면 안내가 틀린다.
const MEGABYTE = 1_000_000;
const rowFormat = new Intl.NumberFormat("ko-KR");

const LINK = "text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const SECONDARY = "rounded-md border border-border-default px-4 py-2 text-sm text-text hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const BODY = "text-sm leading-relaxed text-text-body";
const H2 = "text-sm font-medium leading-snug text-muted";

export default function GuidePage() {
  const url = siteUrl().href;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: TITLE,
    description: DESCRIPTION,
    inLanguage: "ko",
    mainEntityOfPage: new URL(PATH, url).href,
    datePublished: "2026-10-13",
    author: { "@id": `${url}#organization` },
    publisher: { "@id": `${url}#organization` },
  };

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-6 py-16 font-sans">
      <script type="application/ld+json">{jsonLdText(jsonLd)}</script>
      <header className="space-y-3">
        <p className="text-sm text-muted">FinSight 가이드</p>
        <h1 className="text-2xl font-semibold leading-snug text-text">{TITLE}</h1>
        <p className={BODY}>
          카드 명세서를 분석하면 한 달 지출이 어느 카테고리로 나갔는지, 매달 빠져나가는 정기결제가 무엇인지 알 수
          있습니다. 가계부에 한 줄씩 옮겨 적지 않아도 됩니다. 카드사나 은행에서 내려받은 파일 하나면 충분합니다.
        </p>
      </header>

      <section aria-labelledby="step-download" className="space-y-3">
        <h2 id="step-download" className={H2}>1. 명세서 파일 내려받기</h2>
        <p className={BODY}>
          카드사·은행 웹사이트에 로그인해 이용내역 조회나 이용대금명세서 화면을 엽니다. 화면에 있는 엑셀 또는 CSV
          내려받기 버튼으로 파일을 받습니다. 메뉴 이름은 카드사마다 다르지만, 내려받기 버튼은 대개 조회 결과 표 근처에
          있습니다.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li className={BODY}>
            CSV 파일과 카드사가 주는 엑셀(.xls) 파일을 그대로 올릴 수 있습니다. 확장자를 바꾸지 않아도 됩니다.
          </li>
          <li className={BODY}>
            .xlsx 파일은 읽지 못합니다. 스프레드시트 프로그램에서 열어 CSV로 저장한 뒤 올려 주세요.
          </li>
          <li className={BODY}>
            <span className="font-mono tabular-nums">파일당 {MAX_FILE_BYTES / MEGABYTE}MB</span>,{" "}
            <span className="font-mono tabular-nums">{rowFormat.format(MAX_CSV_ROWS)}행까지</span> 올릴 수 있습니다.
            EUC-KR·UTF-8 인코딩은 자동으로 감지합니다.
          </li>
          <li className={BODY}>
            여러 달치를 한 파일로 받아 두면 유리합니다. 정기결제 탐지와 기간별 추이는 몇 달치가 쌓여야 결과가 나옵니다.
          </li>
        </ul>
      </section>

      <section aria-labelledby="step-mapping" className="space-y-3">
        <h2 id="step-mapping" className={H2}>2. 파일 올리고 컬럼 확인하기</h2>
        <p className={BODY}>
          카드사마다 명세서의 열 이름과 순서가 다릅니다. 파일을 올리면 FinSight가 어느 열이 날짜·가맹점·금액인지
          추론해 표로 보여줍니다. 맞으면 그대로 저장하고, 틀린 것만 고치면 됩니다.
        </p>
        <p className={BODY}>
          추론에는 원본 값을 보내지 않고 열의 의미와 형식 정보만 씁니다. 카드번호·계좌번호가 든 열은 제거된 상태로
          표시됩니다. 같은 카드의 명세서를 다시 올리면 이미 저장된 거래는 중복으로 걸러지고, 애매한 거래는 추가할지 물어봅니다.
        </p>
      </section>

      <section aria-labelledby="step-category" className="space-y-3">
        <h2 id="step-category" className={H2}>3. 카테고리 분류 확인하기</h2>
        <p className={BODY}>
          거래는 아래 {CATEGORIES.length}개 카테고리 중 하나로 분류됩니다. 내가 고친 규칙을 먼저 적용하고, 다음으로
          내장 가맹점 사전을 적용합니다. 둘 다 못 잡은 거래만 AI가 분류합니다.
        </p>
        <ul aria-label="카테고리 목록" className="flex flex-wrap gap-2">
          {CATEGORIES.map((category) => (
            <li key={category} className="rounded-md border border-border-default px-2 py-1 text-sm text-text-body">
              {category}
            </li>
          ))}
        </ul>
        <p className={BODY}>
          분류가 틀린 거래는 거래 목록에서 바로 고칠 수 있습니다. 한 번 고친 가맹점은 규칙으로 남아 다음 달 명세서에도
          자동으로 적용됩니다.
        </p>
      </section>

      <section aria-labelledby="step-read" className="space-y-3">
        <h2 id="step-read" className={H2}>4. 결과 읽는 법</h2>
        <p className={BODY}>
          총지출은 지출에서 환불을 뺀 금액입니다. 급여 같은 수입과 내 계좌 사이의 이체는 넣지 않습니다. 명세서와
          대조할 때는 이 정의를 기준으로 보면 됩니다.
        </p>
        <p className={BODY}>
          합계·비율·증감은 모두 코드로 계산합니다. AI 월간 요약은 이미 계산된 숫자를 설명하는 문장만 쓰며, 문장마다
          근거가 된 거래를 열어 볼 수 있습니다.
        </p>
      </section>

      <section aria-labelledby="step-recurring" className="space-y-3">
        <h2 id="step-recurring" className={H2}>정기결제 누수 찾기</h2>
        {/* 판정 기준은 src/lib/analytics.ts의 detectSubscriptions와 같다. 기준을 바꾸면 이 문단도 고친다. */}
        <p className={BODY}>
          같은 가맹점에서 26~35일 간격으로 3번 이상, 비슷한 금액(평균 대비 10% 이내)이 결제되면 정기결제로 봅니다.
          직전 결제보다 10% 넘게 오른 구독은 금액 인상으로 따로 표시합니다. 정기결제 탐지는 Pro 기능입니다.
        </p>
      </section>

      <section aria-labelledby="privacy-heading" className="space-y-3">
        <h2 id="privacy-heading" className={H2}>개인정보는 어떻게 다루나요</h2>
        <p className={BODY}>
          카드번호와 계좌번호는 입력받지 않습니다. 거래 내용·가맹점명·금액은 서버 로그에 남기지 않고, 설정 화면에서
          금융 데이터를 언제든 삭제할 수 있습니다. 자세한 내용은{" "}
          <Link href="/privacy" className={LINK}>개인정보처리방침</Link>에 있습니다.
        </p>
      </section>

      <section aria-label="다음 행동" className="space-y-3 rounded-md border border-border-default bg-surface p-5">
        <p className={BODY}>
          파일이 아직 없다면 샘플 데이터로 만든 대시보드에서 결과 화면을 먼저 볼 수 있습니다.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/demo" className={SECONDARY}>샘플 대시보드 보기</Link>
        </div>
      </section>

      <footer className="border-t border-border-default pt-6">
        <Link href="/" className={LINK}>FinSight 홈으로</Link>
      </footer>
    </main>
  );
}
