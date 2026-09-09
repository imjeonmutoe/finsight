# Step 12: deploy

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — `## RLS`(검증 쿼리), `## 보안` 전체
- `/CLAUDE.md` — CRITICAL 규칙
- 이전 step 산출물: 전체. 특히 `.env.example`, `middleware.ts`, `supabase/migrations/0001_init.sql`

## 작업

프로덕션 배포와 배포 전 보안 검증.

### 1. 배포 전 보안 검증 — 배포보다 먼저 한다

**S1. 커밋 이력에 키가 있는지**
```bash
git log -p | grep -iE 'sk-ant|service_role|eyJ[A-Za-z0-9_-]{20,}' | head
```
**하나라도 나오면 배포를 중단하고 그 키를 즉시 폐기·재발급하라.** 이력에서 지우는 것만으로는 부족하다 — 이미 노출된 키는 노출된 것이다. 이 경우 `blocked`로 기록하고 사용자에게 알린다.

`.gitignore`에 `.env` 패턴이 있는지도 확인한다:
```bash
git check-ignore -v .env.local
```

**S2. RLS 누락** — 결과가 비어야 한다
```sql
select tablename from pg_tables where schemaname = 'public' and rowsecurity = false;
```

**S5. 클라이언트 번들에 시크릿이 없는지**
```bash
npm run build
grep -rIl -E 'service_role|sk-ant-|POLAR_ACCESS_TOKEN' .next/static/ && echo "!!! 시크릿 유출 !!!" || echo "번들 클린"
```

### 2. Vercel 배포

**Vercel MCP가 이 세션에 연결돼 있으면** MCP로 프로젝트를 연결하고 환경변수를 설정한다.
**연결돼 있지 않으면** `vercel` CLI를 쓴다. 둘 다 불가능하면 `blocked`로 기록하고 필요한 수동 절차를 정리해 사용자에게 넘긴다.

환경변수 (`.env.example`의 키 전부):
```
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
ANTHROPIC_API_KEY, POLAR_ACCESS_TOKEN, POLAR_WEBHOOK_SECRET, POLAR_PRO_PRODUCT_ID,
NEXT_PUBLIC_SITE_URL
```
`NEXT_PUBLIC_SITE_URL`은 프로덕션 도메인으로 설정한다.

`vercel.json`은 필요한 경우에만 만든다. Next.js App Router는 대부분 설정 없이 동작한다 — 빈 설정 파일을 습관적으로 만들지 마라.

### 3. 배포 후 외부 설정 갱신

- **Supabase** — Redirect URL 허용 목록에 프로덕션 도메인 추가 (OAuth 콜백)
- **Google Cloud Console** — OAuth 클라이언트의 승인된 리디렉션 URI에 프로덕션 도메인 추가
- **Polar** — 웹훅 엔드포인트를 프로덕션 URL(`https://.../api/billing/webhook`)로 설정

이 셋 중 하나라도 빠지면 로그인 또는 결제가 프로덕션에서만 실패한다. 로컬에서는 재현되지 않는다.

### 4. 프로덕션 스모크 검증

배포된 URL에서 확인한다:

1. 랜딩 접속, 라이트/다크 토글, 가격 원화 표기
2. `/privacy` 접근 가능, 국외 이전 표 존재
3. Google 로그인 → 대시보드 진입
4. 빈 상태에 카드사 CSV 가이드가 보이는가
5. 실제 카드 명세서 업로드 → 매핑 화면에서 **가맹점명이 한글로 정상 표시**되는가
6. 분류 진행률이 배치별로 올라가는가
7. **카테고리별 합계가 명세서 청구액과 정확히 일치하는가** — 할부·해외결제가 섞인 명세서로 확인
8. **같은 날·같은 가맹점·같은 금액 2건이 2건으로 남는가** (D1 회귀)
9. 같은 CSV 재업로드 → 전건 중복, 총액 불변
10. 거래 카테고리 수정 → 다른 CSV에서 같은 가맹점이 자동 분류되는가
11. Free 계정에서 DevTools Network → 대시보드 응답에 **Pro 상세 배열이 없는가**
12. 가맹점명이 `=HYPERLINK(...)`인 거래로 CSV 내보내기 → 셀이 `'=`로 시작하는가
13. 서명 없는 웹훅 POST → 401
14. Polar 테스트 결제 → 웹훅 → Pro 노출. 같은 웹훅 재전송 → 중복 처리 없음
15. 로그인 30분 후 새로고침 → 세션 유지
16. 업로드 삭제 → 확인 화면에 건수 표시, Storage 파일과 거래 행이 둘 다 사라짐

## Acceptance Criteria

```bash
npm run lint
npm run build
npm test
```

그리고 위 **보안 검증 S1·S2·S5 통과** + **스모크 검증 16항목 통과**.

## 검증 절차

1. 보안 검증을 먼저 실행한다. S1에서 키가 발견되면 즉시 `blocked`로 기록하고 중단하라.
2. 배포한다.
3. 스모크 검증 16항목을 순서대로 확인하고 결과를 기록한다.
4. 실패한 항목이 있으면 어느 step의 문제인지 특정해 `error_message`에 적는다. 여기서 고치려 하지 마라 — 해당 step을 `pending`으로 되돌려 재실행하는 게 맞다.
5. `phases/0-mvp/index.json`의 step 12를 업데이트한다. `summary`에 **프로덕션 URL**을 포함하라.

## 금지사항

- 보안 검증 전에 배포하지 마라. 이유: 커밋 이력에 키가 있으면 배포가 아니라 키 폐기가 먼저다.
- 스모크 검증에서 실패한 것을 이 step에서 고치지 마라. 이유: 이 step의 범위는 배포와 검증이다. 코드 수정은 해당 step을 되돌려 재실행하는 게 맞다. 여기서 고치면 어느 step의 산출물인지 추적이 끊긴다.
- 환경변수를 코드에 하드코딩하지 마라. 이유: 자명하다.
- `vercel.json`을 습관적으로 만들지 마라. 이유: Next.js App Router는 대부분 설정 없이 동작한다. 빈 설정은 나중에 오해를 부른다.
- 외부 서비스 설정(Supabase Redirect URL, Google OAuth URI, Polar 웹훅)을 건너뛰지 마라. 이유: 셋 다 프로덕션에서만 실패하고 로컬에서 재현되지 않는다.
