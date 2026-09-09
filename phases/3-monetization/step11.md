# Step 11: billing

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — `## 데이터 흐름 → 결제`, `## 데이터 모델`(`profiles`), `## 인증`(matcher 제외), `## 보안`
- `/docs/ADR.md` — ADR-005(Free/Pro 경계)
- 이전 step 산출물: `src/app/dashboard/settings/page.tsx`(플랜 섹션을 여기에 덧붙인다), `src/services/supabase.ts`, `middleware.ts`, `src/types/billing.ts`

**작업 시작 전에 Polar 공식 문서를 확인하라.** 특히 어떤 웹훅 이벤트가 "구독 실제 종료"를 의미하는지 — 취소 **예약**과 실제 **종료**는 다른 이벤트다.

## 작업

### 1. 체크아웃

Pro 업그레이드 → Polar Checkout 리디렉트.

**체크아웃 세션 생성 시 `customer_ip_address`에 사용자의 실제 IP를 전달한다.**
빠뜨리면 Polar이 요청 출처(Vercel 서버, 미국)로 지오로케이션을 판단해 **한국 사용자에게 USD 가격이 표시된다.** 조직 기본 결제 통화를 KRW로 설정해도 이 파라미터가 없으면 소용없다.

IP는 `x-forwarded-for` 헤더 첫 항목에서 가져온다.

### 2. `POST /api/billing/webhook`

**서명 검증**
- `crypto.timingSafeEqual`로 비교한다. `===`는 타이밍 공격에 노출된다
- 검증 실패 → **401**
- 타임스탬프로 재생 공격을 막는다

**멱등 — 별도 테이블 없이**
핸들러가 하는 일은 `UPDATE profiles`뿐이라 재실행해도 결과가 같다. 이벤트 테이블을 만들지 마라.
순서가 뒤바뀐 이벤트만 막는다: **이벤트 타임스탬프가 `profiles.plan_updated_at`보다 오래됐으면 무시**한다.

**플랜 전이**
- 결제 완료 → `plan='pro'`, `polar_customer_id`, `polar_subscription_id`, `plan_updated_at` 갱신
- **구독이 실제로 종료됐다는 이벤트에서만 `plan='free'`로 내린다.** 취소 "예약" 이벤트는 무시한다. 어떤 이벤트가 실제 종료인지는 Polar 문서에서 확정하라
- Polar이 만료일만 주는 방식이라면 `plan_expires_at`에 기록한다(컬럼이 이미 있다). 게이팅 조건 `plan='pro' AND (plan_expires_at IS NULL OR plan_expires_at > now())`이 양쪽을 커버한다
- 결제 실패 → `plan='free'`

**강등 시 거래 데이터를 지우지 마라.** Pro 화면만 잠근다. 데이터를 지우면 복귀 동기가 같이 사라진다.

**미들웨어 matcher 확인**
step 3에서 `/api/billing/webhook`을 matcher에서 제외했는지 반드시 확인한다. 안 돼 있으면 인증 미들웨어가 Polar 요청을 `/login`으로 리디렉트해 웹훅이 영원히 실패한다. 로그에는 아무것도 안 남고 Polar 대시보드에만 실패가 쌓인다.

웹훅은 사용자 컨텍스트가 없으므로 service role 클라이언트를 쓴다. 그 경우 `user_id`(또는 `polar_customer_id`)를 코드에서 명시적으로 좁힌다.

### 3. 설정 페이지에 플랜 섹션 추가

step 9가 만든 `/dashboard/settings`에 **덧붙인다.** 새 페이지를 만들지 마라.
- Free → "Pro로 업그레이드" 버튼 (체크아웃으로)
- Pro → 현재 플랜, 다음 결제일, Polar 고객 포털 링크

### 4. 결제 복귀 처리

체크아웃 완료 후 돌아왔을 때 웹훅이 아직 안 왔을 수 있다(E16). 복귀 화면에서 플랜을 몇 초간 폴링하고, 그동안 "결제를 확인하는 중입니다"를 보여준다. 무한 폴링하지 말고 상한(예: 10초)을 둔다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm test
```

**TDD 가드: `route.ts`와 컴포넌트는 테스트 파일이 먼저 있어야 한다.**

테스트에 반드시 포함할 것:
- 서명이 없거나 틀린 요청 → **401**
- 서명 비교에 `timingSafeEqual`을 쓰는가
- **같은 웹훅을 두 번 보내도 결과가 동일한가** (멱등)
- 오래된 타임스탬프의 이벤트 → 무시되는가
- Free 사용자 JWT로 자기 profiles의 플랜·만료일·Polar ID 변경이 거부되고, 검증된 웹훅만 변경할 수 있는가
- 강등 이벤트 후에도 `transactions` 행이 남아 있는가
- 체크아웃 세션 생성 시 `customer_ip_address`가 전달되는가

수동 확인:
```bash
# Polar 테스트 결제 → 웹훅 수신 → profiles.plan='pro' → Pro 섹션 노출
# Polar 대시보드에서 같은 이벤트 재전송 → 중복 처리되지 않는지
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. Polar 계정이나 키가 없으면 → `"status": "blocked"`, `"blocked_reason": "Polar 계정·Pro 상품 미생성. 필요한 값: POLAR_ACCESS_TOKEN, POLAR_WEBHOOK_SECRET, POLAR_PRO_PRODUCT_ID. 조직 기본 결제 통화를 KRW로 설정 필요"` 후 즉시 중단.
3. 아키텍처 체크리스트:
   - 서명 비교가 `timingSafeEqual`인가?
   - 이벤트 테이블을 만들지 않았는가?
   - `customer_ip_address`를 전달하는가?
   - 미들웨어 matcher에서 웹훅 경로가 제외돼 있는가?
   - 강등 시 거래 데이터를 지우지 않는가?
   - 설정 페이지를 새로 만들지 않고 기존 것에 덧붙였는가?
4. `phases/3-monetization/index.json`의 step 11을 업데이트한다.

## 금지사항

- 서명 비교에 `===`를 쓰지 마라. 이유: 타이밍 공격에 노출된다. `crypto.timingSafeEqual`을 써라.
- 웹훅 이벤트 테이블을 만들지 마라. 이유: 핸들러가 `UPDATE profiles`만 해서 이미 멱등하다. 안 쓰는 테이블에 RLS 정책까지 관리하게 된다.
- `customer_ip_address`를 빠뜨리지 마라. 이유: 한국 사용자에게 USD 가격이 뜬다. 조직 통화 설정만으로는 해결되지 않는다.
- 취소 "예약" 이벤트에서 `plan='free'`로 내리지 마라. 이유: 사용자가 결제한 기간이 남아 있는데 기능이 잠긴다.
- 강등 시 거래 데이터를 삭제하지 마라. 이유: 복귀 동기가 사라진다. Pro 화면만 잠근다.
- 새 설정 페이지를 만들지 마라. 이유: step 9의 `/dashboard/settings`에 덧붙인다.
- 미들웨어 matcher를 확인 없이 지나치지 마라. 이유: 제외돼 있지 않으면 웹훅이 조용히 전부 실패하고 로그에도 안 남는다.
