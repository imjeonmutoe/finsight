"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

const DESTRUCTIVE = "rounded-md border border-up px-4 py-2 text-sm text-up hover:bg-up/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:border-border-default disabled:text-disabled disabled:hover:bg-transparent";
const INPUT = "rounded-md border border-border-default bg-bg px-3 py-2 text-sm text-text placeholder:text-disabled focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// 라우트의 CONFIRM_PHRASE와 같은 값입니다. 라우트 모듈은 server-only라 여기서 불러올 수 없습니다.
const CONFIRM_PHRASE = "삭제";
const NETWORK_ERROR = "요청을 보내지 못했습니다. 연결을 확인하고 다시 시도해 주세요.";
const DELETE_ERROR = "금융 데이터를 지우지 못했습니다. 잠시 후 다시 시도해 주세요.";

export function DeleteDataForm() {
  const router = useRouter();
  const inputId = useId();
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    setDone(false);
    let response: Response;
    try {
      response = await fetch("/api/account/data", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: CONFIRM_PHRASE }),
      });
    } catch {
      setBusy(false);
      setError(NETWORK_ERROR);
      return;
    }
    const body = await response.json().catch(() => ({})) as { message?: unknown };
    setBusy(false);
    if (!response.ok) {
      setError(typeof body.message === "string" ? body.message : DELETE_ERROR);
      return;
    }
    setPhrase("");
    setDone(true);
    router.refresh();
  }

  return (
    <section
      aria-labelledby="delete-data-heading"
      className="max-w-2xl space-y-4 rounded-md border border-border-default bg-surface p-5"
    >
      <h2 id="delete-data-heading" className="text-sm font-medium leading-snug text-text">금융 데이터 삭제</h2>

      <p className="text-sm leading-relaxed text-text-body">
        보관 중인 원본 파일·거래·가맹점 규칙·카드·계좌를 모두 지웁니다. AI 월간 요약 캐시도 함께 지웁니다.
      </p>
      <p className="text-sm leading-relaxed text-text-body">
        계정과 구독 상태는 그대로 둡니다. 계정 삭제는 개인정보처리방침의 문의 경로로 접수합니다.
      </p>
      {/* 개인정보처리방침과 같은 문장을 씁니다. 지울 수 없는 것을 지운다고 말하지 않습니다. */}
      <p className="text-sm leading-relaxed text-text-body">
        Anthropic에 이미 전송된 데이터는 회수할 수 없습니다.
      </p>
      {/* 업로드 한도는 업로드 이력으로 셉니다(ADR-005, 카운터 테이블 금지). 이력이 사라지면
          이번 달 횟수도 함께 초기화됩니다. 사용자가 겪게 될 상태 변화라 미리 말합니다. */}
      <p className="text-sm leading-relaxed text-muted">
        이번 달 업로드 횟수는 업로드 이력으로 세므로, 이력이 사라지면 이번 달 횟수도 함께 초기화됩니다.
      </p>

      <div className="space-y-3">
        <label htmlFor={inputId} className="block text-sm leading-relaxed text-text-body">
          지우려면 아래에 &quot;{CONFIRM_PHRASE}&quot;를 입력해 주세요. 되돌릴 수 없습니다.
        </label>
        <input
          id={inputId} type="text" value={phrase} autoComplete="off"
          className={INPUT} placeholder={CONFIRM_PHRASE}
          onChange={(event) => setPhrase(event.target.value)}
        />
      </div>

      {error && <p role="alert" className="text-sm leading-relaxed text-up">{error}</p>}
      {done && (
        <p role="status" className="text-sm leading-relaxed text-muted">
          금융 데이터를 모두 지웠습니다. 새 명세서를 올리면 처음부터 다시 쌓입니다.
        </p>
      )}

      {/* 브라우저 confirm을 쓰지 않습니다. 확인은 위의 문구 입력이 대신합니다. */}
      <button
        type="button" className={DESTRUCTIVE} disabled={phrase !== CONFIRM_PHRASE || busy}
        onClick={() => { void submit(); }}
      >
        금융 데이터 삭제하기
      </button>
    </section>
  );
}
