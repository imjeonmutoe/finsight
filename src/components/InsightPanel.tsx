import type { Plan } from "@/types/billing";

// 모델이 쓴 문장에는 사용자가 올린 CSV에서 온 임의 문자열이 섞일 수 있다. React 기본
// 이스케이프가 유일한 방어선이므로 dangerouslySetInnerHTML을 쓰지 않는다.
export function InsightPanel({ insight, plan }: {
  insight: { headline: string; items: { text: string; transactionIds: string[] }[] } | null;
  plan: Plan;
}) {
  // 근거로 링크되지 않는 문장은 올리지 않는다(docs/UX_GUIDE.md 3.6).
  const items = (insight?.items ?? []).filter((item) => item.transactionIds.length > 0);

  return (
    <section aria-labelledby="insight-heading" className="space-y-4 rounded-md border border-border-default bg-surface p-5">
      <h2 id="insight-heading" className="text-sm font-medium leading-snug text-muted">AI 월간 요약</h2>

      {insight === null ? (
        <p className="text-sm leading-relaxed text-up">
          AI 월간 요약을 만들지 못했습니다. 잠시 후 다시 열어 주세요. 나머지 지출 요약은 그대로 볼 수 있습니다.
        </p>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-text">{insight.headline}</p>
          {items.length === 0 ? (
            <p className="text-sm leading-relaxed text-muted">근거 거래를 연결할 수 있는 문장이 없습니다.</p>
          ) : (
            <ul className="space-y-4">
              {items.map((item) => (
                <li key={item.text} className="space-y-1">
                  <p className="text-sm leading-relaxed text-text-body">{item.text}</p>
                  <a
                    href={`#transaction-${item.transactionIds[0]}`}
                    className="inline-block text-sm text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    근거 거래 {item.transactionIds.length}건 보기
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <p className="text-sm leading-relaxed text-muted">
        숫자는 모두 코드로 계산한 값이며, 요약 문장은 그 값을 근거로 작성됩니다.
        {plan === "free" && " Pro는 추이·구독·이상거래까지 입력에 더해 절약 제안을 받습니다."}
      </p>
    </section>
  );
}
