# Step 7: upload-flow

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — `## 데이터 흐름`(업로드→분석 전체), `## 화면 인벤토리`의 **S7~S10**, `## 아키텍처 경계`, `## 보안`, `## 공유 인터페이스`
- `/docs/UI_GUIDE.md` — 컴포넌트 클래스, 애니메이션 규칙
- `/CLAUDE.md` — CRITICAL 규칙
- 이전 step 산출물: `src/lib/csv.ts`·`encoding.ts`·`merchant.ts`·`dedupe.ts`, `src/services/claude.ts`, `src/services/supabase.ts`, `src/types/api.ts`

> **이 step은 새 phase의 첫 step이다.** `execute.py`는 **같은 phase 안의** 완료된 step summary만 다음 프롬프트에 전달한다. 앞선 phase의 산출물 요약은 오지 않으므로, 위에 나열한 파일을 **실제로 열어 읽고** 시그니처를 확인한 뒤 작업하라. 기억이나 추측으로 import 하지 마라.

## 작업

담당 화면: **S7**(파일 선택) · **S8**(매핑 확인) · **S9**(진행률) · **S10**(결과 요약). 전부 `/dashboard/upload` 한 경로의 4단계다.

### 라우트 핸들러 6개

**`GET/POST /api/sources`**
- 인증된 본인의 카드/계좌 별칭 목록 조회 및 생성. UUID는 서버에서 만들고 종류는 card/bank enum을 검증한다. 원본 계좌/카드번호는 받거나 저장하지 않는다

**`POST /api/uploads`** → `MappingResponse`
1. 인증·`sourceId` 소유권·확장자·MIME·**파일 4,000,000 bytes**·**multipart body 4,200,000 bytes**·**행수 10,000** 검증. 실제 수신 bytes를 세며 Content-Length만 믿지 않는다. 초과는 413
2. 원본 bytes로 `file_hash` 계산. 같은 `(user_id, source_id, file_hash)`의 mapped/parsed는 기존 ID·결과와 `reused=true`를 반환한다. pending은 409와 재시도 시각을 반환한다. 이 경로에서는 Storage 복제나 LLM 호출을 하지 않는다
3. 새 `uploads`를 pending으로 생성한다(UNIQUE 충돌 시 기존 행 재조회). Storage 경로는 **서버가 `{user_id}/{서버생성 uuid}.csv`로 조합**하며 원본 파일명은 `uploads.filename`에만 저장한다
4. 인코딩 감지 → 첫 20행에서 `buildSanitizedMappingInput()` 생성 → 사용자별 LLM lease 획득·캐시 재확인 → **Free 업로드 한도 검증** → `inferColumnMapping(input, context)` 호출. 원본 헤더·셀·상단 요약을 넘기지 않는다
   - 한도 검증은 **lease 획득 후**에 한다. 이유: `## 업로드 한도`대로 lease가 같은 사용자의 동시 업로드를 직렬화하므로 두 요청이 동시에 검증을 통과할 수 없다. **별도 락을 만들지 마라**
   - 카운터 테이블을 만들지 마라. `uploads`를 직접 센다 — `status in ('mapped','parsed')` + KST 캘린더 월. 쿼리는 `/docs/ARCHITECTURE.md`의 `## 업로드 한도`에 있다
   - 초과 시 **403** + `{ code: 'UPLOAD_LIMIT_REACHED', resetsAt }`. lease를 해제하고 pending 행과 Storage 파일을 정리한다. 모델은 호출하지 않는다
   - 위 2번의 `reused=true` 경로는 이 검증에 도달하기 전에 반환되므로 동일 파일 재업로드는 횟수를 소비하지 않는다
5. 성공 시 mapped와 column_mapping 저장. 실패는 failed로 기록하고 파일 경로를 이력에 남겨 삭제 가능하게 한다. 같은 파일의 failed 재시도는 기존 행/파일을 재사용하되 매 모델 시도마다 한도를 소비한다. pending이 요청 제한시간 300초를 넘고 lease도 만료됐으면 failed로 전환해 재개할 수 있게 한다

**`POST /api/uploads/[id]/confirm`** → `ConfirmResponse`
1. `ConfirmRequest` 검증. 출처·파일 해시는 DB에서 읽고 클라이언트가 바꿀 수 없게 한다. parsed 재요청은 저장된 ConfirmResponse를 반환하며 insert나 카운트 덮어쓰기를 하지 않는다
2. 원본 재조회 → 선택한 인코딩/매핑·청구월·거래구분 값 매핑으로 파싱 → 행별 kindOverrides 적용. 카드 청구월을 컬럼/요청 어디에서도 얻을 수 없으면 입력 오류로 반환해 사용자 입력을 요구한다. 임의 행 번호·유효하지 않은 enum은 거부한다
3. 유형·청구월이 확정된 행의 출처별 확정 해시와 후보 해시 계산. 고유번호가 없는 파일 간 후보는 keep/duplicate 결정을 요구한다. 미확정 유형이나 미결정 후보가 있으면 **409 ImportReviewResponse**, 거래 insert는 아직 하지 않는다
4. duplicate가 가리키는 거래는 본인·동일 출처·후보 조건을 모두 재검증하고 기존 거래 하나를 여러 새 행에 연결하지 않는다. 같은 파일 내 별개 행을 후보라는 이유로 제거하지 않는다. 확정 해시 충돌만 자동 중복 처리한다
5. 지출/환불에 **①`merchant_rules` → ②`classifyByRule`(내장 사전) 순으로** 적용해 즉시 분류되는 건 채운다(ADR-011). 이 단계는 LLM 호출이 0회다. `category_source`는 각각 `'user'`·`'rule'`로 기록한다. 출처 행 잠금 아래 후보 재조회·결정 검증·insert·업로드 카운트 및 parsed 전이를 하나의 DB 트랜잭션/RPC로 처리한다. 동시 confirm이 새 후보를 만들면 409로 되돌린다. 승인된 import_context를 저장한다. RPC는 세션 UID와 소유권을 검증한다

**`DELETE /api/uploads/[id]`**
- Storage 파일 + `transactions` 행을 함께 지운다. **Storage 삭제가 실패하면 DB 삭제도 롤백**한다
- 삭제 전 조회용 `GET`(또는 응답)으로 **함께 삭제될 거래 건수**를 반환해 UI가 고지할 수 있게 한다

**`POST /api/transactions/classify`** → `ClassifyResponse`
- **1 요청 = 1 배치(최대 50건).** 서버가 루프를 돌지 않는다
- step 5의 사용자별 LLM lease 획득 **후** 선택: `WHERE kind IN ('expense','refund') AND category IS NULL ... LIMIT 50`
- **선택한 배치에 3단 분류를 순서대로 적용한다(ADR-011).** ①`merchant_rules` 조회로 채운다 → ②`classifyByRule`(step 4의 내장 사전)로 채운다 → ③**그래도 남은 것만** `classifyTransactions`에 넘긴다. ①②는 `category_source='rule'`(사용자 규칙은 `'user'`)로 기록한다
- **③에 넘길 게 0건이면 모델을 호출하지 않고 사용량 예약도 하지 않는다.** 이유: 규칙 사전이 전부 잡는 경우가 실제로 흔하다. 그때 한도를 태우면 ADR-005의 호출 한도가 무의미해진다. `classified`에는 ①②로 채운 건수도 포함한다
- `classifyTransactions(items, context)`가 매 API 시도 전 사용량 예약. 갱신은 `UPDATE ... WHERE category IS NULL`로 사용자 수정을 보존한다. 이 조건만으로 동시 호출을 막는다고 가정하지 않는다
- `classifyTransactions()` 반환은 **`id`로 매칭**한다. 반환에 없는 `id`는 미분류로 남긴다
- `remaining`은 미분류 지출/환불만 센다. 429/409/503과 진척 없는 응답에서는 클라이언트 루프를 멈춘다. 성공·실패 모두 토큰 일치 조건으로 lease를 해제한다

**`PATCH /api/transactions/[id]`**
- category 수정은 `category_source='user'`로 갱신하고 동시에 merchant_rules를 upsert한다
- kind 수정도 허용해 지출·수입·환불·이체를 바로잡는다. 유형을 merchant_rules에 저장하지 않는다. 변경 시 후보/확정 해시를 재계산하고 UNIQUE 충돌은 409로 반환한다. 거래를 자동 삭제하지 않는다. SQL 집계를 재조회해 총액과 탐지를 갱신한다

모든 쿼리에 `user_id` 조건을 명시한다(CLAUDE.md CRITICAL).

### UI 4단계

**S7 파일 선택** — 기존 카드/계좌 별칭 선택 또는 새 별칭 생성, 드래그앤드롭 + 파일 선택. 한 파일은 한 출처만 허용한다. 공유 상수로 크기·확장자를 클라이언트에서도 안내한다.

**S8 매핑 확인 — 마찰 F2 대응.**
이 화면이 기술적으로 느껴지면 사용자가 이탈한다.
- 신뢰도가 높으면 **"이대로 진행" 단일 버튼**을 기본으로 보여주고, 컬럼별 상세 매핑은 접어둔다
- 미리보기 표에 첫 5행을 보여준다 — **가맹점명이 깨져 보이면 사용자가 인코딩 오판(E3)을 육안으로 발견**할 수 있다
- 인코딩 수동 전환 옵션을 상세 영역에 둔다
- 신뢰도가 낮으면 상세를 펼친 상태로 시작한다
- 카드 청구월·거래구분 값 매핑을 확인한다. 알 수 없는 컬럼은 수동 선택하고, 유형 미확정 행은 지출/수입/환불/이체 중 선택한다. 은행 카드대금 납부와 본인 이체를 지출로 자동 확정하지 않는다
- 409 ImportReviewResponse는 같은 화면에서 해결한다. 유사 거래마다 "별도 거래로 추가" 또는 "기존 거래와 중복"을 고르게 하고 전부 해결한 뒤 재승인한다. 내부 해시는 화면에 노출하지 않는다
- 같은 파일 재업로드는 "이미 올린 파일"과 기존 결과/재개 경로를 보여준다

**S9 진행률 — 마찰 F3 대응.**
- 파싱 결과(`inserted`/`duplicates`)를 **먼저** 보여준다. 분류를 기다리게 하지 않는다
- 클라이언트가 `remaining`이 0이 될 때까지 `classify`를 순차 호출하며 진행률 표시
- 중간 이탈해도 미분류는 DB에 남아 다음 방문에 이어진다 — 이걸 문구로 안내한다
- 한도 도달 시 재시도 시각과 수동 수정 경로를 표시한다. Retry-After 이전 자동 반복과 진척 없는 무한 반복은 하지 않는다

**S10 결과 요약 — 마찰 F4 대응.**
- "N건 추가 · M건 중복" 표시
- 보유 데이터가 1개월치뿐이면 **"지난달 명세서도 올려보세요 — 지출 추이를 보려면 2개월 이상이 필요합니다"**를 노출한다. 추이는 Pro 기능이지만, 데이터가 쌓여야 Pro의 가치가 보인다(ADR-005)

## Acceptance Criteria

```bash
npm run lint
npm run build
npm test
```

**TDD 가드: 모든 `route.ts`와 `src/components/*.tsx`는 테스트 파일이 먼저 있어야 한다.** (`page.tsx`만 면제)

테스트에 반드시 포함할 것:
- 파일 4,000,000 bytes 경계, body 4,200,000 bytes 경계, 10,000행 경계를 실제 bytes/행수로 검증하는가(Content-Length 없는 요청 포함)
- Storage 경로에 사용자 파일명이 들어가지 않는가
- 동시 classify 두 요청 → 한 lease만 획득하고 같은 거래에 모델 호출이 중복되지 않는가
- 같은 출처·같은 CSV 반복/동시 업로드 → 하나의 uploads/Storage 객체, 매핑 호출 한 번인가
- parsed 업로드 재confirm → 거래/카운트 불변, 저장된 결과를 반환하는가
- 다른 카드의 동일 날짜·가맹점·금액 → 두 거래 보존, 식별자 없는 부분 파일 겹침 → 사용자 결정 전 insert 없음
- 중복 후보/출처 ID 변조 및 동일 기존 거래의 다중 대응을 거부하는가
- kind 수정으로 급여·이체가 총지출에서 제외되고, 카테고리 규칙을 잘못 바꾸지 않는가
- SDK에 실제 전달된 매핑 payload에 원본 식별자·헤더·셀 값이 없는가
- 호출 한도 및 RPC 장애에서 모델 호출이 0회이며 금융 데이터 삭제 후 한도가 초기화되지 않는가
- `PATCH` 시 `merchant_rules`가 함께 upsert 되는가
- DELETE 시 Storage 삭제 실패 → DB 삭제가 롤백되는가

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - 서버가 분류 배치 루프를 돌지 않는가? (1요청=1배치)
   - 선택 전 lease, 호출 전 예약, 갱신의 `category IS NULL` 조건을 모두 지키는가?
   - 분류 결과를 `id`로 매칭하는가?
   - 모든 쿼리에 `user_id` 조건이 있는가?
   - Storage 경로를 서버가 조합하는가?
   - 집계를 여기서 다시 구현하지 않았는가? (step 6의 `queries.ts`를 쓴다)
3. `phases/2-product/index.json`의 step 7을 업데이트한다.

## 금지사항

- 서버에서 분류 배치를 루프로 돌리지 마라. 이유: ADR-006. 진행률을 못 보여주고, 중간 실패 시 앞의 배치도 함께 날아간다.
- 분류 갱신은 `WHERE category IS NULL`로 사용자 수정을 보존하고, 동시 호출은 사용자별 lease로 막아라.
- Storage 경로에 사용자 파일명이나 클라이언트가 보낸 id를 넣지 마라. 이유: 경로 조작으로 남의 폴더에 쓸 수 있다.
- 입력 검증을 클라이언트에만 두지 마라. 이유: 클라이언트 검증은 우회된다.
- 집계 로직을 여기서 다시 만들지 마라. 이유: step 6의 `queries.ts`·`analytics.ts`를 쓴다. 두 곳에 있으면 반드시 어긋난다.
- 파싱 로직을 여기서 다시 만들지 마라. 이유: step 4의 `src/lib/`을 쓴다.
- 대시보드 차트를 만들지 마라. 이유: step 8의 작업이다.
- 에러 로그에 거래 내용을 남기지 마라. 행 번호만 남겨라. 이유: CLAUDE.md CRITICAL.
