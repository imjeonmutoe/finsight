// 스캐폴드 프리뷰. docs/UI_GUIDE.md의 토큰이 실제로 렌더되는지 눈으로 확인하는 페이지다.
// 랜딩 페이지는 phases/3-monetization의 step 12에서 이 자리를 대체한다.

const COLORS = [
  { name: "bg", swatch: "bg-bg", use: "페이지 배경" },
  { name: "surface", swatch: "bg-surface", use: "카드" },
  { name: "surface-2", swatch: "bg-surface-2", use: "테이블 헤더, 호버" },
  { name: "border-default", swatch: "bg-border-default", use: "모든 테두리" },
  { name: "text", swatch: "bg-text", use: "주 텍스트, 숫자" },
  { name: "text-body", swatch: "bg-text-body", use: "본문" },
  { name: "muted", swatch: "bg-muted", use: "보조, 라벨" },
  { name: "disabled", swatch: "bg-disabled", use: "비활성, placeholder" },
  { name: "up", swatch: "bg-up", use: "지출 증가, 경고" },
  { name: "down", swatch: "bg-down", use: "지출 감소, 성공" },
  { name: "neutral-line", swatch: "bg-neutral-line", use: "차트 기준선" },
  { name: "accent", swatch: "bg-accent", use: "링크, 포커스 링" },
];

// 자릿수가 다른 금액들. tabular-nums가 걸려 있으면 우측 정렬에서 자리가 맞는다.
const AMOUNTS = ["₩5,900", "₩127,090", "₩1,873,400", "₩482,000"];

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function Panel({ theme, label }: { theme: "light" | "dark"; label: string }) {
  return (
    <div data-theme={theme} className="rounded-md border border-border-default bg-bg p-6 space-y-8">
      <p className="text-xs font-medium text-muted">{label}</p>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted">색 토큰</h2>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
          {COLORS.map((c) => (
            <li key={c.name} className="flex items-center gap-3">
              <span className={`${c.swatch} size-6 shrink-0 rounded-sm border border-border-default`} />
              <span className="min-w-0">
                <span className="block text-xs text-text">{c.name}</span>
                <span className="block text-xs text-muted">{c.use}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted">타이포그래피</h2>
        <p className="text-2xl font-semibold text-text leading-snug">페이지 제목입니다</p>
        <p className="text-3xl font-semibold tabular-nums text-text">₩1,234,567</p>
        <p className="text-sm text-text-body leading-relaxed">
          본문입니다. 정기결제 4건을 찾았습니다. 이 문장이 어절 중간에서 끊기지 않아야 합니다.
        </p>
        <p className="text-xs font-medium text-muted">카드 라벨</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted">컴포넌트</h2>
        <div className="rounded-md border border-border-default bg-surface p-5">
          <p className="text-xs font-medium text-muted">총지출 (지출 − 환불)</p>
          <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-text">₩482,000</p>
          <p className="mt-1 text-sm text-text-body">
            전월 대비 <span className="font-mono tabular-nums text-up">+12.4%</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className={`rounded-md bg-text px-4 py-2 text-sm font-medium text-bg hover:opacity-90 ${FOCUS}`}>
            저장하기
          </button>
          <button className={`rounded-md border border-border-default px-4 py-2 text-sm text-text hover:bg-surface-2 ${FOCUS}`}>
            취소
          </button>
          <button className={`rounded-md border border-up px-4 py-2 text-sm text-up hover:bg-up/10 ${FOCUS}`}>
            삭제하기
          </button>
          <button className={`text-sm text-muted underline-offset-4 hover:text-text hover:underline ${FOCUS}`}>
            더 보기
          </button>
        </div>
        <input
          readOnly
          placeholder="가맹점 검색"
          className="w-full rounded-md border border-border-default bg-bg px-3 py-2 text-sm text-text placeholder:text-disabled focus:border-accent"
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted">금액 정렬 (tabular-nums)</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-2">
              <th className="px-3 py-2 text-left text-xs font-medium text-muted">가맹점</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-muted">금액</th>
            </tr>
          </thead>
          <tbody>
            {AMOUNTS.map((a, i) => (
              <tr key={a} className="border-b border-border-default">
                <td className="px-3 py-2 text-text">{["스타벅스 역삼점", "정기결제 합계", "신한카드 대금 납부", "8월 총지출"][i]}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-text">{a}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted">한글 줄바꿈 (keep-all)</h2>
        <div className="w-44 rounded-md border border-border-default bg-surface p-3">
          <p className="text-sm text-text-body leading-relaxed">
            이번 달 무료 업로드를 이미 사용했습니다. 다음 달 1일에 초기화됩니다.
          </p>
        </div>
      </section>
    </div>
  );
}

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-16 space-y-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-text">FinSight 디자인 토큰 프리뷰</h1>
        <p className="text-sm text-text-body leading-relaxed">
          docs/UI_GUIDE.md의 토큰이 실제로 렌더되는지 확인하는 스캐폴드 페이지입니다.
          본문은 Pretendard, 숫자는 JetBrains Mono입니다.
        </p>
      </header>
      <div className="grid gap-6 md:grid-cols-2">
        <Panel theme="light" label="라이트" />
        <Panel theme="dark" label="다크" />
      </div>
    </main>
  );
}
