# 브라우저 테스트 시나리오

화면을 만진 step을 끝낼 때, 그리고 회귀를 확인할 때 **매번 참조하는 목록**이다.
`CLAUDE.md`의 "UI를 만졌으면 렌더된 화면을 실제로 보고 끝낸다"를 실행 가능한 절차로 푼 것이다.

## 이 문서의 자리

| 문서 | 성격 | 실행 시점 |
|---|---|---|
| **이 문서** | 반복 실행용 회귀 목록 | UI를 만진 step마다 |
| `phases/3-monetization/step12.md`의 스모크 목록 | 배포 1회용 게이트 | 프로덕션 배포 직후 |
| 각 `phases/*/step*.md`의 `## 검증 절차` | 그 step 전용 | 해당 step 1회 |

**시나리오를 새로 지어내지 마라.** 아래 항목은 전부 step 파일·`docs/ARCHITECTURE.md`·`docs/UX_GUIDE.md`에
이미 있는 요구에서 나왔고, `출처` 칸에 어디서 왔는지 적어 뒀다. 새 요구가 생기면 원본 문서를 먼저 고치고
여기에 옮긴다. 두 곳에 적으면 한쪽만 고쳐진다.

화면 ID(S1~S13)는 `docs/ARCHITECTURE.md`의 `## 화면 인벤토리`를 따른다.

---

## 실행 방법

세 가지 경로가 있고 **할 수 있는 일이 다르다.** 위에서부터 우선한다.

### 공통 제약 — 폭 500px 미만은 실제 창으로 만들 수 없다

**macOS의 Chrome은 창 폭을 500px 밑으로 내리지 않는다.** 390px를 요청해도 뷰포트는 500px가 된다.
실측(2026-09-15, Chrome 확장 `resize_window`):

| 요청 폭 | 실제 `clientWidth` |
|---|---|
| 800 · 640 · 500 | 그대로 |
| 450 · 400 · 390 | **전부 500** |

그래서 좁은 폭 검증은 **CDP의 `Emulation.setDeviceMetricsOverride`로만** 가능하다(방법 2).
확장도, `preview-shot.sh`도 이 벽을 넘지 못한다.

### 1. Claude in Chrome 확장 (기본)

클릭·폼 입력·콘솔·네트워크를 읽는다. **테마를 실제 경로로 검증할 수 있는 유일한 방법**이기도 하다 —
`localStorage.setItem('theme','light')` 후 새로고침하면 `layout.tsx`의 FOUC 방지 인라인 스크립트가
실제로 도는 것을 확인할 수 있다. CDP의 미디어 에뮬레이션은 `prefers-color-scheme`만 바꾸므로
`localStorage` 분기를 타지 않는다.

폭은 500px까지만 줄어든다(위 공통 제약). 500px에서 잘못된 값을 보고하지는 않으므로 **거짓 버그는 만들지 않는다.**

### 2. CDP 직접 제어

**좁은 폭 검증의 유일한 경로다.** 확장이 있어도 BT-02는 이쪽으로 한다.

```bash
npm run build && npm run start -- --port 3211 &
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --no-sandbox \
  --remote-debugging-port=9222 --remote-allow-origins='*' \
  "http://localhost:3211/demo" &
```

```python
# uv run --with websocket-client python <파일>
# Emulation.setDeviceMetricsOverride  → 진짜 뷰포트 폭 (390px 등). 창 최소 폭을 우회한다
# Emulation.setEmulatedMedia          → prefers-color-scheme (단, localStorage 분기는 안 탄다)
# Page.captureScreenshot              → captureBeyondViewport로 전체 페이지
```

**끝나면 반드시 내려라.** 위 두 줄은 `&`로 띄운 채 끝나고 아무도 정리하지 않는다. headless
Chrome은 스크린샷을 찍은 뒤에도 살아남는 일이 잦다. 실측(2026-09-18): 이틀 방치한 유령 Chrome
29개가 2.8GB를 잡고 있었고, 그 압박으로 개발 서버가 OS에 죽었다. 죽은 이유가 코드에 없어서
찾는 데 오래 걸린다.

```bash
kill $(lsof -ti tcp:3211) 2>/dev/null   # 서버
kill $(lsof -ti tcp:9222) 2>/dev/null   # Chrome — 자식 프로세스까지 함께 내려간다
# 스크린샷만 찍는 Chrome은 포트를 안 잡는다. 남아 있으면 PID를 보고 직접 죽인다
pgrep -fl -- --screenshot=
```

### 3. `bash scripts/preview-shot.sh <경로> [폭] [높이]`

가장 간단하지만 **두 가지를 못 한다. 이걸 모르면 없는 버그를 찾게 된다.**

| 한계 | 결과 |
|---|---|
| 폭 500px 미만 불가(위 공통 제약). 게다가 **스크린샷 이미지만 요청한 폭으로 잘린다** | 390px로 찍으면 멀쩡한 화면이 **오른쪽이 잘린 것처럼 보인다.** 확장과 달리 거짓 버그를 만든다 |
| 테마를 지정할 수 없다. `prefers-color-scheme`이 **OS 설정을 따라간다** | 라이트·다크 양쪽을 보려면 OS 설정을 바꿔야 한다 |

데스크톱 폭 + 현재 OS 테마의 빠른 확인용으로만 쓴다.

---

## 현재 실행 가능한 범위

`src/app/`에 실제로 있는 라우트는 **`/`와 `/demo` 둘뿐**이고, `/`는 아직 플레이스홀더 스텁이다
("FinSight / 서비스를 준비하고 있습니다."). 진짜 랜딩은 step 10이 만든다.

| 상태 | 뜻 |
|---|---|
| ✅ | 지금 실행 가능 |
| ⏸ | 화면이 아직 없다. 괄호 안 step이 열어준다 |
| 🔑 | 화면이 생겨도 외부 키·설정이 있어야 한다 (Supabase / Google OAuth / Polar) |

---

## 시나리오

### ✅ BT-01 · 데모 화면 렌더 (`/demo`)

- **절차**: `/demo` 접속 → 전체 스크롤
- **통과 기준**
  - 상단에 합성 데이터 고지가 보인다 (`샘플 데이터입니다. 실제 카드 명세서가 아닙니다.`)
  - KPI 3장 · 카테고리 막대 · 구독/이상거래 · 거래 표가 모두 렌더된다
  - 금액이 `₩1,090,420` 형식이고 **축약(만·억)이 없다**
  - 날짜가 `2026.04.28` 형식이다. 영문 월 표기가 없다
  - 총지출 KPI에 정의가 붙어 있다 (`지출에서 환불을 차감했습니다.`)
  - 증감이 **색만으로 표시되지 않는다** — `+48.5%` `증가`처럼 부호·텍스트가 함께 있다
  - 콘솔 에러 0건
- **출처**: `docs/UI_GUIDE.md` 금액·날짜 규칙, `docs/UX_GUIDE.md` 3.2·3.6

### ✅ BT-02 · 좁은 폭 (390px)

- **전제**: **실행 방법 2(CDP)만 가능하다.** 확장도 `preview-shot.sh`도 500px 밑으로 못 내려간다(위 공통 제약)
- **절차**: 뷰포트 390px로 `/demo` 접속
- **통과 기준**
  - `document.documentElement.scrollWidth === clientWidth` — **가로 스크롤이 없다**
  - 뷰포트를 넘는 요소가 `overflow-x-auto` 컨테이너 **밖에** 하나도 없다
    (거래 표는 자기 컨테이너 안에서 가로 스크롤한다 — 이건 정상이다)
  - 금액이 숫자 중간에서 줄바꿈되지 않는다 (`whitespace-nowrap` + `tabular-nums`)
  - 한글이 어절 중간에서 끊기지 않는다 (`word-break: keep-all`)
- **출처**: `docs/UI_GUIDE.md` 한국어 타이포그래피, 커밋 `130a622`

### ✅ BT-03 · 라이트 · 다크 양쪽

- **전제**: 실행 방법 1(권장 — 실제 `localStorage` 경로를 탄다) 또는 2
- **절차**: `localStorage.setItem('theme', 'light'|'dark')` 후 새로고침. 확장이 없으면 `prefers-color-scheme` 에뮬레이션
- **통과 기준**
  - `document.documentElement.dataset.theme`이 각각 `light`·`dark`
  - `body` 배경이 각각 `rgb(255,255,255)` · `rgb(15,15,14)` (`docs/UI_GUIDE.md` 토큰 값)
  - 양쪽에서 막대·표·증감 텍스트가 읽힌다. 한쪽만 다듬어진 곳이 없다
- **출처**: `docs/UI_GUIDE.md` 원칙 3, 다크모드 구현 규칙

### ✅ BT-04 · 접근성 기본

- **통과 기준**
  - `<html lang="ko">`
  - 표에 `<caption>`과 `<th scope="col">`이 있다
  - 아이콘만으로 의미를 전달하는 곳이 없다 (항상 텍스트 라벨 동반)
  - 색만으로 정보를 전달하는 곳이 없다
  - 인터랙티브 요소에 포커스 링이 보인다 (`focus-visible:outline-accent`)
- **출처**: `docs/UI_GUIDE.md` 아이콘·다크모드, `docs/UX_GUIDE.md` 4절 접근성

### ✅ BT-05 · AI 슬롭 안티패턴 육안 확인

- **통과 기준**: 아래가 화면에 **하나도 없다**
  - `backdrop-filter: blur()` (glass morphism) · 그라데이션 텍스트 · 배경 blur orb
  - 네온 글로우 · 보라/인디고 브랜드색 · `Powered by AI` 배지
  - 모든 카드가 동일한 큰 반경(`rounded-2xl`)
- **코드로 검사한다** (확장의 `javascript_tool`에 붙여 넣는다):
  ```js
  (()=>{const h={backdrop:0,gradText:0,purple:[],glow:0};
    document.querySelectorAll('body *').forEach(e=>{const s=getComputedStyle(e);
      if(s.backdropFilter&&s.backdropFilter!=='none')h.backdrop++;
      if(s.backgroundImage.includes('gradient')&&s.backgroundClip==='text')h.gradText++;
      [s.color,s.backgroundColor].forEach(c=>{const m=c.match(/rgba?\((\d+), ?(\d+), ?(\d+)/);
        if(m){const[r,g,b]=[+m[1],+m[2],+m[3]];if(b>r+40&&b>g+40&&r>g+15&&b>90)h.purple.push(c)}});
    });
    return {...h,radii:[...new Set([...document.querySelectorAll('body *')]
      .map(e=>getComputedStyle(e).borderRadius).filter(r=>r!=='0px'))]};})()
  ```
  `backdrop`·`gradText`·`glow`가 0, `purple`이 빈 배열, `radii`에 `16px` 이상이 균일하게 깔려 있지 않아야 한다
- **출처**: `docs/UI_GUIDE.md` AI 슬롭 안티패턴 표

### ⏸ BT-06 · 랜딩 첫인상 (S1) — step 10

- 히어로에 **결과 화면 목업**이 보인다. 기능 이름보다 숫자가 먼저 보인다
- 요금제가 **원화 표기**다
- "데이터 처리" 섹션이 있다 (보관 위치 · 로그 정책 · 삭제 경로)
- 로그인 CTA가 4번 이상 반복되지 않는다
- 스크롤 리빌 애니메이션이 없다
- 출처: `step10.md`, `docs/UX_GUIDE.md` 3.1

### ⏸ BT-07 · 테마 토글 유지 · FOUC (S1) — step 10

- 토글 후 **새로고침해도 선택이 유지된다** (`localStorage`)
- 새로고침 시 **흰 화면이 번쩍이지 않는다** (FOUC)
- `localStorage`가 비어 있으면 `prefers-color-scheme`을 따른다
- 출처: `step10.md` 수동 확인

### ⏸ BT-08 · `/privacy` — step 10

- 접근 가능하고 **국외 이전 표에 4곳(Anthropic·Supabase·Vercel·Polar)이 전부** 있다
- 출처: `step10.md`, step 12 스모크 2번

### ⏸ BT-09 · 로그인 화면 (S2) — step 3

- **Google 버튼 하나**만 있다. 이메일·비밀번호 입력란이 없다
- 버튼 아래 신뢰 문장 1개와 개인정보처리방침 링크가 있다
- 출처: `step3.md` 금지사항, `docs/ARCHITECTURE.md` S2, `docs/UX_GUIDE.md` 3.3

### ⏸ BT-10 · 미인증 차단 — step 3

- 로그아웃 상태로 `/dashboard` 직접 접근 → `/login`으로 리디렉트
- `redirectTo`를 URL 파라미터로 주입해도 외부 도메인으로 나가지 않는다 (오픈 리디렉트)
- 출처: `step3.md` 수동 확인·금지사항

### ⏸🔑 BT-11 · OAuth 실패 우아한 강등 — step 3

- OAuth 콜백이 실패해도 흰 화면·스택 트레이스가 아니라 **한국어 안내와 재시도 경로**가 보인다
- 출처: `docs/UX_GUIDE.md` 5절 (에러는 원인과 다음 행동을 같이 준다)

### ⏸ BT-12 · 세션 유지 — step 3

- 로그인 30분 후 새로고침 → 세션 유지. 산발적 로그아웃이 없다
- 출처: step 12 스모크 15번

### ⏸ BT-13 · 빈 상태 (S3) — step 8

- 업로드 0건에서 **카드사별 CSV 다운로드 가이드**가 보인다
- 빈 상태에 다음 행동이 있다. 막다른 화면이 아니다
- 출처: `step8.md` 테스트 항목, `docs/ARCHITECTURE.md` S3, `docs/UX_GUIDE.md` 3.4·5

### ⏸ BT-14 · 업로드 4단계 (S7~S10) — step 7

- 진행 표시가 `파일 선택 → 매핑 확인 → 분류 진행률 → 결과 요약` 4단계를 보여준다
- 매핑 화면이 **이미 채워져** 있다. 빈 폼이 아니다
- **가맹점명이 한글로 정상 표시**된다 (EUC-KR 인코딩 회귀)
- 쓰지 않는 컬럼이 `(사용 안 함)`, 마스킹된 컬럼이 `(제거됨)`으로 보인다
- 분류 진행률이 배치별로 올라간다
- 출처: `docs/ARCHITECTURE.md` S7~S10, step 12 스모크 5·6번, `docs/UX_GUIDE.md` 3.5

### ⏸ BT-15 · Free 게이팅이 서버에서 일어나는가 — step 8

- Free 계정에서 DevTools Network → `/dashboard` 응답 본문에 **Pro 상세 배열이 없다**
- 클라이언트에서 숨기기만 한 게 아니라 데이터 자체가 오지 않아야 한다
- 출처: `step8.md` 수동 확인, step 12 스모크 11번

### ⏸ BT-16 · 차트 가독성 — step 8

- 라이트·다크 양쪽에서 차트 텍스트가 읽힌다
- 음수 카테고리 순액이 올바르게 표시된다
- 출처: `step8.md` 수동 확인

### ⏸ BT-17 · 카테고리 수정 → 규칙 생성 — step 7·8

- 카테고리를 고치면 분류 출처 배지가 `Claude` → `내 규칙`으로 바뀐다
- **수정 후 목록이 재정렬되지 않는다** (방금 고친 행이 사라지면 안 된다)
- 다른 CSV에서 같은 가맹점이 자동 분류된다
- 출처: step 12 스모크 10번, `docs/UX_GUIDE.md` 3.7

### ⏸ BT-18 · 삭제 확인 — step 9

- 삭제 확인 화면에 **함께 삭제될 거래 건수**가 표시된다
- 브라우저 `confirm`/`alert`을 쓰지 않는다 (아래 `## 금지` 참조)
- 출처: `step9.md`

### ⏸🔑 BT-19 · Polar 체크아웃 → Pro 노출 — step 11

- 테스트 결제 → 웹훅 수신 → `profiles.plan='pro'` → Pro 섹션 노출
- 같은 이벤트 재전송 → **중복 처리되지 않는다**
- 결제 완료 후 방금 열린 화면으로 이동한다 (축하 화면에서 끝나지 않는다)
- 출처: `step11.md` 수동 확인, `docs/UX_GUIDE.md` 3.9

### ⏸ BT-20 · 웹훅 서명 검증 — step 11

- 서명 없는 웹훅 POST → **401**. (브라우저가 아니라 `curl`로 확인한다)
- 출처: step 12 스모크 13번

---

## 공통 통과 기준

화면이 무엇이든 매번 본다.

1. 콘솔 에러 0건
2. 가로 스크롤 없음 (표의 `overflow-x-auto` 컨테이너 안은 예외)
3. 라이트·다크 양쪽에서 읽힌다
4. 모든 문구가 한국어이고 평서형 종결로 통일돼 있다
5. 금액이 축약되지 않고 `₩1,234,567` 형식이다
6. 빈 상태·실패 상태에 **다음 행동**이 있다

---

## 금지

- **실제 카드 명세서를 쓰지 마라.** 합성 CSV(`src/lib/demo/sample-csv.ts`)만 쓴다.
  스크린샷과 콘솔 로그는 대화에 남고, `CLAUDE.md`의 금융 데이터 로그 금지는 화면에도 적용된다.
- **`alert`·`confirm`·`prompt`를 쓰는 화면을 만들지 마라.** `step9.md`가 이미 금지한다.
  덧붙여 브라우저 모달은 자동화 도구를 멈춰 세워 이 문서의 시나리오를 **실행 불가능하게** 만든다.
- **화면이 없는데 통과로 적지 마라.** 404를 보고 "리디렉트 검증 통과"라고 쓰는 일이 실제로 일어난다.
  ⏸ 항목은 해당 step이 끝난 뒤에 실행한다.
