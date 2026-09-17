import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "개인정보처리방침 | FinSight",
  description: "FinSight가 수집하는 항목, 처리 목적, 보유 기간, 국외 이전 대상과 삭제 요청 방법을 안내합니다.",
};

// 계정 삭제 셀프서비스는 MVP 제외이므로(docs/PRD.md) 접수 경로를 하나 명시합니다.
// 리포 이슈 트래커는 이 데모에서 실제로 열려 있는 유일한 공개 접수 창구입니다.
const CONTACT_URL = "https://github.com/imjeonmutoe/finsight/issues";

const TRANSFERS: { processor: string; country: string; items: string; purpose: string }[] = [
  {
    processor: "Anthropic",
    country: "미국",
    items: "매핑용 컬럼 인덱스·의미/형식 정보, 정제된 가맹점명·금액·날짜·내부 거래 ID·집계값",
    purpose: "컬럼 매핑, 카테고리 분류, 요약 문장 생성",
  },
  { processor: "Supabase", country: "미국", items: "계정 정보, 원본 CSV, 거래 내역", purpose: "인증·데이터 저장" },
  { processor: "Vercel", country: "미국", items: "접속 로그", purpose: "호스팅" },
  { processor: "Polar", country: "미국", items: "결제 정보", purpose: "구독 결제" },
];

const COLLECTED: string[] = [
  "Google 계정 이메일 — 로그인과 본인 식별에 씁니다.",
  "업로드한 CSV 원본 — 비공개 Storage 버킷에 보관하며 본인만 접근할 수 있습니다.",
  "파싱된 거래 내역 — 날짜·가맹점명·금액·카테고리·거래 유형입니다.",
  "구독 결제 정보 — Polar가 처리하며 카드번호는 FinSight 서버에 저장하지 않습니다.",
];

const LINK = "text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const CELL = "px-4 py-3 align-top text-sm leading-relaxed text-text-body";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-10 px-6 py-16 font-sans">
      <header className="space-y-3">
        <p className="text-sm text-muted">FinSight</p>
        <h1 className="text-2xl font-semibold leading-snug text-text">개인정보처리방침</h1>
        <p className="text-sm leading-relaxed text-text-body">
          FinSight는 카드 명세서 CSV를 분석하는 포트폴리오 데모입니다. 카드번호와 계좌번호를 입력받지 않으며,
          카드사·은행에서 내려받은 파일만 사용합니다.
        </p>
      </header>

      <section aria-labelledby="collected-heading" className="space-y-3">
        <h2 id="collected-heading" className="text-sm font-medium leading-snug text-muted">수집 항목</h2>
        <ul className="space-y-2">
          {COLLECTED.map((item) => (
            <li key={item} className="text-sm leading-relaxed text-text-body">{item}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="purpose-heading" className="space-y-3">
        <h2 id="purpose-heading" className="text-sm font-medium leading-snug text-muted">처리 목적</h2>
        <p className="text-sm leading-relaxed text-text-body">
          지출 분석 및 시각화에만 씁니다. 카테고리별 지출 요약, 기간별 추이, 정기결제·이상거래 탐지, AI 월간 요약을
          만드는 것이 전부입니다. 광고와 제3자 판매에 쓰지 않습니다.
        </p>
        <p className="text-sm leading-relaxed text-text-body">
          거래 내용·가맹점명·금액은 서버 로그에 남기지 않습니다. 오류 기록에는 행 번호만 남깁니다.
        </p>
      </section>

      <section aria-labelledby="retention-heading" className="space-y-3">
        <h2 id="retention-heading" className="text-sm font-medium leading-snug text-muted">보유 기간</h2>
        <p className="text-sm leading-relaxed text-text-body">
          사용자가 삭제할 때까지 보관합니다. 자동 만료 정책은 두지 않습니다. 계정을 삭제하면 원본 파일과 파생 데이터를
          모두 삭제합니다.
        </p>
      </section>

      <section aria-labelledby="transfer-heading" className="space-y-3">
        <h2 id="transfer-heading" className="text-sm font-medium leading-snug text-muted">국외 이전</h2>
        <p className="text-sm leading-relaxed text-text-body">
          아래 수탁자에게 처리를 위탁하며, 처리 위치는 모두 국외입니다.
        </p>
        <div className="overflow-x-auto rounded-md border border-border-default">
          <table className="w-full min-w-3xl border-collapse text-left">
            <caption className="px-4 py-3 text-left text-sm leading-relaxed text-muted">
              국외 이전 수탁자와 이전 항목
            </caption>
            <thead className="bg-surface-2">
              <tr>
                <th scope="col" className="px-4 py-3 text-xs font-medium text-muted">수탁자</th>
                <th scope="col" className="px-4 py-3 text-xs font-medium text-muted">국가</th>
                <th scope="col" className="px-4 py-3 text-xs font-medium text-muted">이전 항목</th>
                <th scope="col" className="px-4 py-3 text-xs font-medium text-muted">목적</th>
              </tr>
            </thead>
            <tbody>
              {TRANSFERS.map((transfer) => (
                <tr key={transfer.processor} className="border-t border-border-default">
                  <th scope="row" className="px-4 py-3 align-top text-sm font-medium text-text">{transfer.processor}</th>
                  <td className={CELL}>{transfer.country}</td>
                  <td className={CELL}>{transfer.items}</td>
                  <td className={CELL}>{transfer.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm leading-relaxed text-up">
          Anthropic에 이미 전송된 데이터는 회수할 수 없습니다. 전송 전에 카드번호·계좌번호·거래 참조번호를 제거하고
          가맹점명에 섞인 번호와 연락처를 가리지만, 전송된 뒤에는 되돌릴 수 없습니다.
        </p>
      </section>

      <section aria-labelledby="deletion-heading" className="space-y-3">
        <h2 id="deletion-heading" className="text-sm font-medium leading-snug text-muted">삭제 요청 방법</h2>
        <p className="text-sm leading-relaxed text-text-body">
          설정 화면의 금융 데이터 삭제는 원본 CSV·거래 내역·업로드 이력·가맹점 규칙·카드·계좌 출처를 삭제합니다.
          계정과 구독 상태는 그대로 둡니다.
        </p>
        <p className="text-sm leading-relaxed text-text-body">
          계정 자체의 삭제는 아래 경로로 접수합니다. 접수하면 저장된 파일과 거래 내역을 함께 삭제합니다.
        </p>
        <p className="text-sm leading-relaxed">
          <a href={CONTACT_URL} className={LINK}>계정 삭제 요청 접수</a>
        </p>
      </section>

      <footer className="border-t border-border-default pt-6">
        <Link href="/" className={LINK}>FinSight 홈으로</Link>
      </footer>
    </main>
  );
}
