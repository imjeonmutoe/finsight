import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { CategoryBars } from "@/components/CategoryBars";
import { KpiCard } from "@/components/KpiCard";
import { LandingCta } from "@/components/LandingCta";
import { ThemeToggle } from "@/components/ThemeToggle";
import { requireUserId } from "@/lib/api";
import { createServerSupabase } from "@/services/supabase";
import type { MonthlySummary } from "@/types/analytics";

export const metadata: Metadata = {
  title: "FinSight — 카드 명세서 소비 분석",
  description:
    "카드사·은행에서 내려받은 CSV를 올리면 카테고리별 지출과 정기결제 누수를 정리해 보여줍니다.",
};

// 히어로 목업의 예시 숫자입니다. 합계는 아래 카테고리의 합과 일치시킵니다 —
// 랜딩에서부터 숫자가 어긋나 보이면 이 제품이 가장 먼저 잃는 것이 신뢰입니다.
const EXAMPLE_CATEGORIES: MonthlySummary["byCategory"] = [
  { category: "쇼핑", amountKrw: 304_000, count: 12 },
  { category: "식비", amountKrw: 283_300, count: 34 },
  { category: "교통", amountKrw: 139_700, count: 41 },
  { category: "구독/멤버십", amountKrw: 127_090, count: 4 },
  { category: "문화/여가", amountKrw: 97_800, count: 5 },
  { category: "카페/간식", amountKrw: 62_400, count: 18 },
];
const EXAMPLE_TOTAL_KRW = EXAMPLE_CATEGORIES.reduce((sum, item) => sum + item.amountKrw, 0);

const FEATURES: { title: string; body: string; figure: string; plan?: string }[] = [
  {
    title: "카테고리 자동 분류",
    body: "내 규칙 → 내장 가맹점 사전 → 남은 것만 Claude 순으로 분류합니다. 한 번 고치면 규칙으로 남아 다음부터 자동 적용됩니다.",
    figure: "예시 — 188건 중 142건을 규칙으로 분류하고 46건만 모델을 호출합니다.",
  },
  {
    title: "기간별 지출 추이",
    body: "월별·카테고리별 지출 변화를 한 화면에서 비교하고, 어떤 카테고리가 언제부터 늘었는지 짚어냅니다.",
    figure: "예시 — 배달 8월 ₩214,600, 5월 대비 +48.5% 증가",
    plan: "Pro",
  },
  {
    title: "구독 누수 탐지",
    body: "정기결제 판정과 월 합계, 금액 인상 여부를 모두 코드로 계산합니다. 모델에 합계를 계산시키지 않습니다.",
    figure: "예시 — 정기결제 4건, 월 ₩127,090",
    plan: "Pro",
  },
];

const FREE_FEATURES: string[] = [
  "업로드 · 원본 보관 월 1회",
  "카테고리 자동 분류",
  "해당 월 카테고리별 지출 요약",
  "거래별 카테고리 수정",
  "AI 월간 요약 (Sonnet)",
];

const PRO_FEATURES: string[] = [
  "업로드 · 원본 보관 무제한",
  "기간별 추이",
  "구독 누수 탐지",
  "이상거래 탐지",
  "AI 월간 요약 (Opus)",
  "절약 인사이트 · 이상거래 해석",
];

const DATA_HANDLING: string[] = [
  "원본 CSV는 비공개 Storage 버킷에 보관되며, 본인만 접근할 수 있습니다.",
  "거래 내용·가맹점명·금액을 로그에 남기지 않습니다. 오류 기록에는 행 번호만 남깁니다.",
  "모델에는 카드번호·계좌번호·거래 참조번호를 제거한 값만 보냅니다.",
  "설정 화면에서 금융 데이터를 언제든 삭제할 수 있습니다.",
];

const SECONDARY = "rounded-md border border-border-default px-4 py-2 text-sm text-text hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const NAV_LINK = "text-sm text-muted hover:text-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const LINK = "text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * S1과 S1b를 가르는 것은 세션 유무뿐입니다. 자격증명이 채워지지 않은 환경에서도
 * 공개 화면은 떠야 하므로(미들웨어와 같은 규약) 실패는 익명으로 취급합니다.
 */
async function isSignedIn(): Promise<boolean> {
  try {
    return (await requireUserId(createServerSupabase(await cookies()))) !== null;
  } catch {
    return false;
  }
}

function PricingTier({ name, price, note, features, highlight }: {
  name: string;
  price: string;
  note: string;
  features: string[];
  highlight?: boolean;
}) {
  return (
    // 강조는 반경이 아니라 테두리 색으로 합니다(UI_GUIDE `### 카드`).
    <section
      aria-labelledby={`plan-${name}`}
      className={`min-w-0 space-y-4 rounded-md border bg-surface p-5 ${highlight ? "border-text" : "border-border-default"}`}
    >
      <h3 id={`plan-${name}`} className="text-sm font-medium leading-snug text-muted">{name}</h3>
      {/* 숫자와 단위는 붙여 씁니다(UI_GUIDE `### 문구 작성`). */}
      <p className="flex flex-wrap items-baseline">
        <span className="font-mono text-3xl font-semibold whitespace-nowrap tabular-nums text-text">{price}</span>
        <span className="text-sm text-muted">/월</span>
      </p>
      <p className="text-sm leading-relaxed text-text-body">{note}</p>
      <ul className="space-y-2">
        {features.map((feature) => (
          <li key={feature} className="text-sm leading-relaxed text-text-body">{feature}</li>
        ))}
      </ul>
    </section>
  );
}

export default async function Home() {
  const signedIn = await isSignedIn();

  return (
    <div className="font-sans">
      <header className="border-b border-border-default">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <p className="text-sm font-medium text-text">FinSight</p>
          <nav aria-label="랜딩" className="flex flex-wrap items-center gap-4">
            <a href="#features" className={NAV_LINK}>기능</a>
            <a href="#pricing" className={NAV_LINK}>요금제</a>
            <a href="#data" className={NAV_LINK}>데이터 처리</a>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-10 px-6 py-16">
        {/* 중앙 정렬은 랜딩 히어로 한 곳만 허용합니다(UI_GUIDE `## 레이아웃`). */}
        <section aria-labelledby="hero-heading" className="space-y-6 text-center">
          <p className="text-sm text-muted">CSV 기반 지출 분석</p>
          <h1 id="hero-heading" className="text-4xl font-semibold leading-snug text-text sm:text-5xl">
            지출이 어디로 새는지
          </h1>
          <p className="mx-auto max-w-2xl text-sm leading-relaxed text-text-body">
            카드사·은행에서 내려받은 CSV를 올리면 카테고리별 지출과 정기결제 누수를 정리해 보여줍니다.
            가계부에 손으로 입력하지 않습니다.
          </p>
          <p className="mx-auto max-w-2xl text-sm leading-relaxed text-muted">
            파일을 올리면 매핑 확인까지 1분, 요약까지 5분입니다.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <LandingCta signedIn={signedIn} />
            <Link href="/demo" className={SECONDARY}>샘플 대시보드 보기</Link>
          </div>
        </section>

        {/* 기능 이름보다 숫자가 먼저 보여야 합니다(UX_GUIDE 3.1). 대시보드와 같은 컴포넌트를 씁니다. */}
        <section aria-label="결과 화면 예시" data-testid="hero-mock" className="space-y-4">
          <div className="grid items-start gap-4 lg:grid-cols-3">
            <KpiCard
              label="이번 달 총지출"
              amountKrw={EXAMPLE_TOTAL_KRW}
              deltaPercent={12.4}
              hint="지출에서 환불을 차감했습니다."
            />
            <div className="min-w-0 space-y-5 rounded-md border border-border-default bg-surface p-5 lg:col-span-2">
              <h2 className="text-sm font-medium leading-snug text-muted">카테고리별 지출</h2>
              <CategoryBars items={EXAMPLE_CATEGORIES} totalKrw={EXAMPLE_TOTAL_KRW} />
            </div>
          </div>
          <p className="text-sm leading-relaxed text-muted">
            예시 숫자입니다. 실제 명세서가 아닙니다. 완성된 화면은 샘플 대시보드에서 직접 만져볼 수 있습니다.
          </p>
        </section>

        <section id="features" aria-labelledby="features-heading" data-testid="features" className="space-y-4">
          <h2 id="features-heading" className="text-sm font-medium leading-snug text-muted">기능</h2>
          <div className="grid gap-4 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="min-w-0 space-y-3 rounded-md border border-border-default bg-surface p-5">
                {feature.plan && <p className="text-xs font-medium text-muted">{feature.plan}</p>}
                <h3 className="text-sm font-medium leading-snug text-text">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-text-body">{feature.body}</p>
                <p className="text-sm leading-relaxed text-muted">{feature.figure}</p>
              </div>
            ))}
          </div>
          <p className="text-sm leading-relaxed text-muted">
            숫자는 모두 코드로 계산한 값이며, 요약 문장은 그 값을 근거로 작성됩니다.
          </p>
        </section>

        <section id="pricing" aria-labelledby="pricing-heading" data-testid="pricing" className="space-y-4">
          <h2 id="pricing-heading" className="text-sm font-medium leading-snug text-muted">요금제</h2>
          <p className="text-sm leading-relaxed text-text-body">
            여러 달치 데이터가 쌓여야 의미가 생기는 기능입니다. Free에서도 업로드는 계속 쌓입니다.
          </p>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <PricingTier
              name="Free"
              price="₩0"
              note="KST 캘린더 월 기준 업로드 1회입니다. 한도에 닿아도 열람·수정·재분류는 계속 됩니다."
              features={FREE_FEATURES}
            />
            <PricingTier
              highlight
              name="Pro"
              price="₩9,900"
              note="언제든 해지할 수 있습니다. 월간 단일 플랜이며 연간 플랜은 두지 않습니다."
              features={PRO_FEATURES}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <LandingCta signedIn={signedIn} />
            <p className="text-sm leading-relaxed text-muted">
              결제는 Polar 샌드박스로 처리하며 실제 청구는 발생하지 않습니다.
            </p>
          </div>
        </section>

        <section id="data" aria-labelledby="data-heading" data-testid="data-handling" className="space-y-4">
          <h2 id="data-heading" className="text-sm font-medium leading-snug text-muted">데이터 처리</h2>
          <ul className="space-y-2">
            {DATA_HANDLING.map((item) => (
              <li key={item} className="text-sm leading-relaxed text-text-body">{item}</li>
            ))}
          </ul>
          <p className="text-sm leading-relaxed text-muted">
            수집 항목과 국외 이전 대상은 <Link href="/privacy" className={LINK}>개인정보처리방침</Link>에 적어 두었습니다.
          </p>
        </section>

        <section aria-labelledby="cta-heading" className="space-y-4 rounded-md border border-border-default bg-surface p-5">
          <h2 id="cta-heading" className="text-2xl font-semibold leading-snug text-text">명세서 한 장으로 시작합니다</h2>
          <p className="text-sm leading-relaxed text-text-body">
            카드번호와 계좌번호는 받지 않고, 카드사에서 내려받은 CSV 파일만 사용합니다.
          </p>
          <div className="flex flex-wrap gap-3">
            <LandingCta signedIn={signedIn} />
          </div>
        </section>
      </main>

      <footer className="border-t border-border-default">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-6">
          <p className="text-sm text-muted">© 2026 FinSight — 포트폴리오 데모</p>
          <Link href="/privacy" className={LINK}>개인정보처리방침</Link>
        </div>
      </footer>
    </div>
  );
}
