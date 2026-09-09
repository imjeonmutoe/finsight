# Step 12: deploy

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — `## RLS`(검증 쿼리), `## 보안` 전체
- `/CLAUDE.md` — CRITICAL 규칙
- 이전 step 산출물: 전체. 특히 `.env.example`, `middleware.ts`, `supabase/migrations/0001_init.sql`

## 작업

프로덕션 배포와 배포 전 보안 검증.

### 1. 배포 전 보안 검증 — 배포보다 먼저 한다

**S1. 커밋 이력의 실제 비밀값 후보 검사**

[Gitleaks 공식 사용법](https://github.com/gitleaks/gitleaks#usage)을 확인하고 사용 버전을 검증 기록에 남긴다. 검사 보고서는 저장소 밖 임시 디렉토리에 만들고 값은 마스킹한다:

```bash
scan_report_dir="$(mktemp -d)"
gitleaks version
gitleaks git --log-opts="--all" --redact=100 --report-format=json --report-path="$scan_report_dir/history.json" .
```

- 종료 코드와 검사 완료 여부·보고서를 함께 확인한다. 기본 검출 종료 코드는 1이지만 비정상 종료가 곧 후보 검출이라는 뜻은 아니다. 실행 오류/도구 부재는 검사 성공으로 처리하지 않는다. 검사를 완료할 수 없으면 미검증 사유를 기록한다
- `SUPABASE_SERVICE_ROLE_KEY` 같은 변수 이름, 설명 문자열, 검사 명령 자체는 유출 증거가 아니다. JWT 후보는 payload의 role을 로컬에서 확인해 공개 anon 키와 service_role 자격증명을 구분한다. 값은 로그·보고 메시지에 출력하지 않는다
- 후보별 파일·커밋·규칙 ID와 확인 결과를 기록한다. 검증된 비밀값 노출이면 배포를 중단하고 해당 자격증명을 폐기·재발급한다. 판단 불가 후보는 검토 미완료로 남기고 유출 확정이라고 보고하지 않는다. 오탐은 값/위치 단위 근거로 제외하며 문서 전체나 과거 이력 전체를 allowlist하지 않는다
- 검사 규칙 검증에는 격리된 합성 fixture를 사용한다. 변수명·설명·형식이 아닌 긴 식별자는 통과하고, 지원하는 provider 키 형태/JWT service_role 형태의 합성 값은 후보로 검출되어야 한다. 실제 키는 fixture에 넣지 않는다

`.gitignore`에 `.env` 패턴이 있는지도 확인한다:
```bash
git check-ignore -v .env.local
```

**S2. RLS 누락** — 결과가 비어야 한다
```sql
select tablename from pg_tables where schemaname = 'public' and rowsecurity = false;
```

추가로 실제 일반 사용자 JWT로 자기 profiles의 plan·만료일·Polar ID INSERT/UPDATE/DELETE, llm_usage 변경/RPC 호출, 다른 사용자의 출처·업로드 참조가 거부되는지 검증한다. RLS 활성화 쿼리만으로 통과시키지 않는다.

**S5. 클라이언트 번들에 시크릿이 없는지**
```bash
npm run build
gitleaks dir --redact=100 --report-format=json --report-path="$scan_report_dir/bundle.json" .next/static/
```

S1과 같은 후보 판정을 적용한다. 추가로 배포 환경의 실제 서버 시크릿 값과 `.next/static` 내용을 로컬 메모리에서 비교해 일치 여부만 기록한다. 값을 명령행 인자·로그·보고서에 넣지 않는다. 키 이름만 나타난 것을 실제 값 유출로 판정하지 않는다. 스캐너가 모든 provider 형식을 지원한다고 가정하지 않는다.

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
7. **카드 청구월별 지출-환불이 명세서 청구액과 일치하는가** — 할부·해외결제 포함. 은행 입출금 순액과 혼동하지 않는다
8. **같은 날·같은 가맹점·같은 금액 2건이 2건으로 남는가** (D1 회귀)
9. 같은 출처의 같은 CSV 재업로드 → 기존 업로드 재사용, 매핑 호출 0회, 총액 불변
10. 거래 카테고리 수정 → 다른 CSV에서 같은 가맹점이 자동 분류되는가
11. Free 계정에서 DevTools Network → 대시보드 응답에 **Pro 상세 배열이 없는가**
12. 가맹점명이 `=HYPERLINK(...)`인 거래로 CSV 내보내기 → 셀이 `'=`로 시작하는가
13. 서명 없는 웹훅 POST → 401
14. Polar 테스트 결제 → 웹훅 → Pro 노출. 같은 웹훅 재전송 → 중복 처리 없음
15. 로그인 30분 후 새로고침 → 세션 유지
16. 업로드 삭제 → 확인 화면에 건수 표시, Storage 파일과 거래 행이 둘 다 사라짐
17. 서로 다른 카드에서 같은 날짜·가맹점·금액 결제 → 정상 거래 2건 유지
18. 번호 없는 겹치는 기간 파일 → 자동 제거 없이 중복 확인, 부분 파일의 정상 거래 보존
19. 급여 300만 원 + 지출 100만 원 + 카드대금 이체 100만 원 → 총지출 100만 원. 환불만 차감
20. 합성 계좌/카드번호가 포함된 CSV → 매핑 SDK payload에 원본 헤더·셀·요약문 없음
21. 파일 4,000,000 bytes 이하의 허용 multipart 요청 성공, 파일/body 상한 초과는 413
22. 호출 한도·동시 요청 → 추가 모델 호출 방지, 재시도 시각 표시. 금융 데이터 삭제 후에도 사용량 유지

## Acceptance Criteria

```bash
npm run lint
npm run build
npm test
```

그리고 위 **보안 검증 S1·S2·S5 통과** + **스모크 검증 22항목 통과**. 한도·동시성·payload 상세 검사는 격리된 스테이징의 합성 데이터/테스트 계정으로 재현하고, 프로덕션에서는 동일 설정과 일반 흐름을 확인한다.

## 검증 절차

1. 보안 검증을 먼저 실행한다. 실제 비밀값 노출 또는 미해결 후보/검사 오류가 있으면 해당 사유를 구분해 기록하고 배포하지 않는다. 실제 노출로 확인된 자격증명만 폐기·재발급한다.
2. 배포한다.
3. 스모크 검증 22항목을 순서대로 확인하고 환경·결과를 기록한다.
4. 실패한 항목이 있으면 어느 step의 문제인지 특정해 `error_message`에 적는다. 여기서 고치려 하지 마라 — 해당 step을 `pending`으로 되돌려 재실행하는 게 맞다.
5. `phases/0-mvp/index.json`의 step 12를 업데이트한다. `summary`에 **프로덕션 URL**을 포함하라.

## 금지사항

- 보안 검증 전에 배포하지 마라. 이유: 커밋 이력에 키가 있으면 배포가 아니라 키 폐기가 먼저다.
- 스모크 검증에서 실패한 것을 이 step에서 고치지 마라. 이유: 이 step의 범위는 배포와 검증이다. 코드 수정은 해당 step을 되돌려 재실행하는 게 맞다. 여기서 고치면 어느 step의 산출물인지 추적이 끊긴다.
- 환경변수를 코드에 하드코딩하지 마라. 이유: 자명하다.
- `vercel.json`을 습관적으로 만들지 마라. 이유: Next.js App Router는 대부분 설정 없이 동작한다. 빈 설정은 나중에 오해를 부른다.
- 외부 서비스 설정(Supabase Redirect URL, Google OAuth URI, Polar 웹훅)을 건너뛰지 마라. 이유: 셋 다 프로덕션에서만 실패하고 로컬에서 재현되지 않는다.
