# Step 7: upload-flow

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — `## 데이터 흐름`(업로드→분석 전체), `## 화면 인벤토리`의 **S7~S10**, `## 아키텍처 경계`, `## 보안`, `## 공유 인터페이스`
- `/docs/UI_GUIDE.md` — 컴포넌트 클래스, 애니메이션 규칙
- `/CLAUDE.md` — CRITICAL 규칙
- 이전 step 산출물: `src/lib/csv.ts`·`encoding.ts`·`merchant.ts`·`dedupe.ts`, `src/services/claude.ts`, `src/services/supabase.ts`, `src/types/api.ts`

## 작업

담당 화면: **S7**(파일 선택) · **S8**(매핑 확인) · **S9**(진행률) · **S10**(결과 요약). 전부 `/dashboard/upload` 한 경로의 4단계다.

### 라우트 핸들러 5개

**`POST /api/uploads`** → `MappingResponse`
1. 검증: 확장자·MIME·**크기 5MB**·**행수 10,000**. 서버에서 검증한다 — 클라이언트 검증은 UX용이지 방어가 아니다
2. Storage 저장. 경로는 **서버가 `{user_id}/{서버생성 uuid}.csv`로만 조합**한다. 원본 파일명은 `uploads.filename` 컬럼에만 넣는다. 사용자 입력을 경로에 넣지 마라
3. 인코딩 감지 → 첫 20행 추출 → `inferColumnMapping()`
4. `uploads` 행 생성 (`status='mapped'`), 매핑과 미리보기 반환

**`POST /api/uploads/[id]/confirm`** → `ConfirmResponse`
1. Storage에서 원본 재조회 → 전체 파싱
2. `occurrence_index` 계산 → `dedupe_hash` 계산
3. `merchant_rules` 조회해 히트하는 건 `category_source='rule'`로 즉시 채움
4. `transactions` upsert — **해시 충돌은 무시**(`on conflict do nothing`). `duplicates`는 무시된 건수
5. `status='parsed'`, 카운트 컬럼 갱신

**`DELETE /api/uploads/[id]`**
- Storage 파일 + `transactions` 행을 함께 지운다. **Storage 삭제가 실패하면 DB 삭제도 롤백**한다
- 삭제 전 조회용 `GET`(또는 응답)으로 **함께 삭제될 거래 건수**를 반환해 UI가 고지할 수 있게 한다

**`POST /api/transactions/classify`** → `ClassifyResponse`
- **1 요청 = 1 배치(최대 50건).** 서버가 루프를 돌지 않는다
- 선택: `WHERE category IS NULL ... LIMIT 50`
- 갱신: `UPDATE ... WHERE category IS NULL` — **멱등**해야 한다. 탭 두 개나 더블 클릭에도 같은 거래를 두 번 분류하지 않는다
- `classifyTransactions()` 반환은 **`id`로 매칭**한다. 반환에 없는 `id`는 미분류로 남긴다
- `remaining`을 함께 반환한다

**`PATCH /api/transactions/[id]`**
- `category`와 `category_source='user'` 갱신
- **동시에 `merchant_rules`에 `(user_id, merchant_norm) → category`를 upsert**한다. 이게 F5 대응의 전부다 — 다음 업로드부터 자동 적용된다

모든 쿼리에 `user_id` 조건을 명시한다(CLAUDE.md CRITICAL).

### UI 4단계

**S7 파일 선택** — 드래그앤드롭 + 파일 선택 버튼. 크기·확장자를 클라이언트에서도 미리 알려준다(UX용).

**S8 매핑 확인 — 마찰 F2 대응.**
이 화면이 기술적으로 느껴지면 사용자가 이탈한다.
- 신뢰도가 높으면 **"이대로 진행" 단일 버튼**을 기본으로 보여주고, 컬럼별 상세 매핑은 접어둔다
- 미리보기 표에 첫 5행을 보여준다 — **가맹점명이 깨져 보이면 사용자가 인코딩 오판(E3)을 육안으로 발견**할 수 있다
- 인코딩 수동 전환 옵션을 상세 영역에 둔다
- 신뢰도가 낮으면 상세를 펼친 상태로 시작한다

**S9 진행률 — 마찰 F3 대응.**
- 파싱 결과(`inserted`/`duplicates`)를 **먼저** 보여준다. 분류를 기다리게 하지 않는다
- 클라이언트가 `remaining`이 0이 될 때까지 `classify`를 순차 호출하며 진행률 표시
- 중간 이탈해도 미분류는 DB에 남아 다음 방문에 이어진다 — 이걸 문구로 안내한다

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
- 5MB 초과 / 10,000행 초과 → 서버가 거부하는가
- Storage 경로에 사용자 파일명이 들어가지 않는가
- `classify`를 같은 상태에서 두 번 호출 → 두 번째가 이미 분류된 건을 다시 분류하지 않는가 (멱등)
- 같은 CSV를 두 번 confirm → 두 번째의 `inserted`가 0, `duplicates`가 전체인가
- `PATCH` 시 `merchant_rules`가 함께 upsert 되는가
- DELETE 시 Storage 삭제 실패 → DB 삭제가 롤백되는가

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - 서버가 분류 배치 루프를 돌지 않는가? (1요청=1배치)
   - `classify` 갱신이 `WHERE category IS NULL`로 멱등한가?
   - 분류 결과를 `id`로 매칭하는가?
   - 모든 쿼리에 `user_id` 조건이 있는가?
   - Storage 경로를 서버가 조합하는가?
   - 집계를 여기서 다시 구현하지 않았는가? (step 6의 `queries.ts`를 쓴다)
3. `phases/0-mvp/index.json`의 step 7을 업데이트한다.

## 금지사항

- 서버에서 분류 배치를 루프로 돌리지 마라. 이유: ADR-006. 진행률을 못 보여주고, 중간 실패 시 앞의 배치도 함께 날아간다.
- 분류 갱신을 무조건 `UPDATE`로 하지 마라. `WHERE category IS NULL`을 붙여라. 이유: 탭 두 개면 같은 거래를 두 번 분류하고 Claude 비용이 두 배가 된다.
- Storage 경로에 사용자 파일명이나 클라이언트가 보낸 id를 넣지 마라. 이유: 경로 조작으로 남의 폴더에 쓸 수 있다.
- 입력 검증을 클라이언트에만 두지 마라. 이유: 클라이언트 검증은 우회된다.
- 집계 로직을 여기서 다시 만들지 마라. 이유: step 6의 `queries.ts`·`analytics.ts`를 쓴다. 두 곳에 있으면 반드시 어긋난다.
- 파싱 로직을 여기서 다시 만들지 마라. 이유: step 4의 `src/lib/`을 쓴다.
- 대시보드 차트를 만들지 마라. 이유: step 8의 작업이다.
- 에러 로그에 거래 내용을 남기지 마라. 행 번호만 남겨라. 이유: CLAUDE.md CRITICAL.
