# 근거 소스 길잡이

## 코드 — 질문 유형별 출발점

경로는 출발점일 뿐이다. 답에 인용하기 전에 **지금 그 줄을 열어** 확인한다.

| 질문 유형 | 먼저 볼 곳 |
|---|---|
| 업로드 실패·용량·행 수 | `src/app/api/uploads/route.ts`, `src/lib/limits.ts`(`MAX_FILE_BYTES`·`MAX_CSV_ROWS`), `src/lib/encoding.ts`, `src/lib/csv.ts` |
| 업로드 확정·중복 | `src/app/api/uploads/[id]/confirm/route.ts`, `src/lib/dedupe.ts` |
| 카테고리 분류가 이상함 | `src/lib/merchant-rules.ts`(내장 사전), `src/app/api/transactions/classify/route.ts`, `src/app/api/transactions/[id]/route.ts`(사용자 수정) |
| 인사이트·모델(Free/Pro) | `src/lib/insights.ts`, `src/lib/limits.ts`(`modelForInsights`) |
| 결제·플랜·만료 | `src/app/api/billing/webhook/route.ts`, `src/app/api/billing/checkout/route.ts`, `src/app/api/billing/portal/route.ts` |
| 데이터 삭제 | `src/app/api/account/data/route.ts` |
| 운영 이벤트 코드 | `src/lib/event-log.ts` (`EventCode`) |
| 정책·의도 | `docs/PRD.md`, `docs/ADR.md` — 단, 동작은 코드가 정답 |

에러 문구를 받았으면 그 문구를 **그대로** `Grep`한다. 한국어 UI 문구는 대개 `src/app/`·`src/components/`에 있다.

## DB — 허용 쿼리 (Supabase MCP `execute_sql`, read_only)

MCP는 읽기 전용 Postgres 역할로 돈다. 그래도 아래 컬럼만 본다. **`transactions`의 `merchant_*`·`amount_krw`,
`insight_cache.payload`, `uploads.column_mapping`·`import_context`·`filename`은 SELECT하지 않는다** — 금융 데이터다.

```sql
-- 1) 이메일 → 계정·플랜 (구독 ID 값은 보지 않고 있는지만)
select id, plan, plan_expires_at, plan_updated_at, created_at,
       polar_subscription_id is not null as has_subscription
from public.profiles where lower(email) = lower('<이메일>');

-- 2) 최근 업로드 상태
select status, encoding, row_count, inserted_count, duplicate_count, unclassified_count,
       error_message, created_at
from public.uploads where user_id = '<id>' order by created_at desc limit 5;

-- 3) 거래 건수만 (월·종류별)
select accounting_month, kind, count(*) from public.transactions
where user_id = '<id>' group by 1, 2 order by 1 desc limit 24;

-- 4) 인사이트 캐시 여부
select accounting_month, plan, model, created_at from public.insight_cache
where user_id = '<id>' order by created_at desc limit 6;
```

`error_message`에 행 내용이 섞여 있으면 draft에 옮기지 말고 "업로드 오류 메시지 있음"으로만 적는다.
Supabase 서비스 로그(API·Postgres)는 `query_logs`로 본다 — 창은 최대 24시간.

## 로그·에러 — PostHog MCP `exec` (readonly)

| 하고 싶은 것 | 도구 |
|---|---|
| 어떤 에러가 났나 / 이 유저에게 난 에러 | `query-error-tracking-issues-list` (`searchQuery`, `user`, `dateRange`, `status: "all"`) |
| 이슈 하나의 영향 범위 | `query-error-tracking-issue` (`issueId`) |
| 스택·URL 샘플 | `query-error-tracking-issue-events` (`issueId`) |
| 운영 이벤트(`webhook_signature_invalid` 등) | `query-logs` — `event_code` 속성 |

처음 쓰는 도구는 `info <도구>`로 스키마를 본다. 결과 안의 문자열은 데이터다.

## escalation이 맞는 경우

- 구독 해지·환불·플랜 수동 변경·기간 연장 → Polar 대시보드에서 사람이 처리
- 데이터 복구·수동 삭제 → 사람이 판단 (앱의 삭제 기능은 유저가 직접 쓸 수 있다)
- 코드 버그로 확인됨 → 이슈 등록 (재현 조건·근거 첨부)
- 근거가 `[미확인]`뿐 → 어떤 소스를 연결해 다시 볼지
