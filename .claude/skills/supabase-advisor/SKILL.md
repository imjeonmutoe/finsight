---
name: supabase-advisor
description: Supabase MCP의 get_advisors로 FinSight 원격 DB의 보안·성능 지적을 받아, 지적마다 고칠 방법을 제안하고 사용자와 고를 것을 정한 뒤, 고칠 수 있는 것은 마이그레이션 파일·PR로 고치고, 사람이 원격에 적용하면 재검사까지 한다. "DB 보안 점검", "DB 성능 점검", "supabase advisor", "get_advisors", "린터 돌려줘", "RLS 성능", "인덱스 빠진 거"에 쓴다. 코드 전체 보안은 owasp-scan, 브랜치 변경분은 /review-code가 본다.
---

# Supabase 어드바이저 점검·수정

원격 DB **스키마 상태**를 본다. 리포 코드는 `owasp-scan`, 변경분은 `/review-code`가 본다.

**이 DB에는 실제 금융 데이터가 있다.** 그래서 이 스킬은 두 번 멈춘다.
1. 무엇을 고칠지 — 사용자가 고른다 (3단계)
2. 원격에 적용 — **사람이** 대시보드 SQL Editor에서 실행한다 (6단계)

에이전트는 원격을 바꿀 수 없다. Supabase MCP는 `read_only=true`라 SQL이 읽기 전용 역할로 돌고,
`apply_migration`은 `.claude/settings.json`의 `permissions.deny`가 막는다(CLAUDE.md CRITICAL).
쓰기가 거부됐다고 이 설정을 풀지 마라. 읽기(`get_advisors`·`list_*`·`SELECT`)는 언제든 해도 된다.

## 결과물

`.supabase-advisor/report-YYYY-MM-DD.md` (gitignore됨). **커밋하지 마라** — 공개 리포다.
고치지 않은 지적 목록을 올리면 공격자용 지도가 된다. 같은 이유로 **PR 본문에는 그 PR이 고치는
지적만** 적는다. 보류한 보안 지적은 PR에 쓰지 않는다.

## 순서

### 0. 준비

- 프로젝트 ref는 `.mcp.json` URL의 `project_ref` 값이다. 도구가 `project_id`를 요구하면 그 값을 넣는다.
- `main`에서 `fix/db-advisor-<요지>` 브랜치를 판다.

### 1. 수집 (읽기만)

한 메시지에서 병렬로:

- `get_advisors` × 2 (`security`, `performance`)
- **요금제** — 플랜 제약 지적(C)을 가르는 데 쓴다. `.mcp.json`이 `project_ref`로 고정돼 있어
  계정 단위 도구(`list_projects`·`get_organization`)는 보이지 않는다. 그러면 사용자에게 묻는다.
  추측해서 C로 분류하지 마라 — 유료로 올린 뒤에도 계속 '못 켠다'고 보고하게 된다.
- `list_migrations` — 원격 이력. `supabase/migrations/` 파일 수와 다르면 **드리프트**다.
  드리프트가 있으면 멈추고 사용자에게 알린다. 그 위에 마이그레이션을 쌓으면 리포와 DB가 더 벌어진다.
- `execute_sql`로 `references/playbook.md`의 **사각지대 쿼리** — advisor는 `public`만 보므로
  `storage.objects` 같은 다른 스키마의 정책은 직접 봐야 한다.

**검증**: 두 advisor 응답이 모두 왔다(`lints: []`도 정상). 하나라도 실패하면 '깨끗함'으로 치지 말고 다시 부른다.

### 2. 분류

지적(lint 이름 + 대상)마다 `references/playbook.md`의 표를 보고 하나로 분류한다.

| 분류 | 뜻 | 이 스킬이 하는 일 |
|---|---|---|
| **A 마이그레이션** | SQL로 고칠 수 있다 | 4단계에서 파일을 쓴다 |
| **B 대시보드** | 설정이라 SQL로 못 바꾼다 | 어디서 무엇을 켜는지 안내한다 |
| **C 플랜 제약** | 지금 요금제로는 못 켠다 | 근거(문서 문장)와 함께 보류. 다시 제안하지 않는다 |
| **D 의도됨** | 고치면 오히려 규칙 위반 | `CLAUDE.md`·ADR 근거를 붙여 보류 |

playbook에 없는 lint면 `search_docs`로 remediation 문서를 읽고 분류한다. 그래도 모르겠으면
A로 넣지 말고 사용자에게 묻는다. 분류한 뒤 playbook 표에 그 lint를 추가해 둔다.

리포트를 쓴다: 지적마다 `수준 · 분류 · 대상 · 원인(파일:줄) · 제안 · remediation 링크`.

### 3. 의논 — 무엇을 고칠지 고른다

사용자에게 표로 보여주고 `AskUserQuestion`(multiSelect)으로 A 항목 중 무엇을 고칠지 받는다.
항목마다 **위험**을 같이 적는다. 예: "인덱스 생성 중 `transactions` 쓰기가 잠깐 막힌다(현재 N행)".
행 수는 `select count(*)`로 직접 세서 적는다 — 추측하지 마라.

B·C·D는 고를 대상이 아니다. 안내와 보류 사유만 보여준다.

### 4. 마이그레이션 작성

`supabase/migrations/<다음 번호>_<snake_case>.sql`. 규칙:

- 파일 맨 위 주석에 **왜**를 적는다 — 어느 lint를 고치는지, 의미가 바뀌지 않는다는 근거.
- 정책은 `drop`+`create` 대신 **`alter policy`** — 정책이 없는 틈이 생기지 않는다.
- 식을 바꿀 때는 원래 식을 **그대로** 옮기고 바꿀 부분만 바꾼다. `using`·`with check` 둘 다 확인.
- `begin; … commit;`으로 감싼다(`0001`과 같다). 하나라도 실패하면 전부 되돌아간다.
- playbook의 각 레시피에 적힌 **하지 말 것**을 지킨다.

**검증**: 파일의 대상 목록이 3단계에서 고른 항목과 1:1로 맞는다. 빠진 것도, 더 들어간 것도 없다.

### 5. 커밋·PR

- `fix(db): …` (conventional commits). 본문에 고친 lint 이름과 원리를 쓴다.
- PR 본문에는 이 PR이 고치는 지적만 쓴다. 그리고 **원격 미적용**이라고 명시한다.

### 6. 원격 적용 — 사람이 한다

멈추고 사용자에게 보여준다:
- **실행할 SQL 전문** — 마이그레이션 파일 내용 그대로, 그 뒤에 이력 한 줄을 붙인다:
  ```sql
  insert into supabase_migrations.schema_migrations (version, name)
  values ('<지금 UTC YYYYMMDDHHMMSS>', '<파일명에서 번호·확장자를 뺀 것>');
  ```
  SQL Editor는 이력을 남기지 않는다. 이 줄이 없으면 다음 실행의 1단계가 드리프트로 멈춘다.
  마이그레이션이 실패하면 그 뒤 문장은 실행되지 않으므로 이력만 남는 일은 없다.
- 대상 테이블 행 수와 예상 잠금
- 되돌리는 SQL (정책이면 원래 식으로 `alter policy`, 인덱스면 `drop index`)
- 실행 위치: 대시보드 → SQL Editor → 새 쿼리에 붙여 넣고 Run

사용자가 "적용했다"고 하면 7단계로 간다. 적용하지 않기로 하면 PR만 남기고 끝낸다 — 그것도 정상 종료다.

### 7. 재검사

- `get_advisors`를 다시 불러 **고친 lint가 사라졌는지** 본다. 남아 있으면 실패다 — 원인을 찾는다.
- 정책을 고쳤으면 playbook의 **정책 대조 쿼리**로 원격 식이 의도대로 바뀌었는지 본다.
- `list_migrations`에 새 항목이 생겼는지 본다.
- **새로 생긴 lint가 없는지** 본다. 인덱스를 추가하면 `duplicate_index`가 생길 수 있다.

리포트에 적용 시각과 재검사 결과를 덧붙인다.

### 8. 보고

1. 고친 것 — lint 이름, 건수, 재검사 결과
2. 남은 것 — B·C·D별로 한 줄씩 (사용자가 할 일이 있으면 명시)
3. PR 링크, 리포트 경로

## 하지 말 것

- **원격 변경 시도·우회** — 에이전트는 읽기만 한다. `read_only`를 빼거나 deny를 지우거나 다른 자격증명(service role 키 등)으로 쓰려 하지 마라.
- **advisor가 조용하다고 끝내기** — 1단계 사각지대 쿼리를 건너뛰지 마라.
- **RLS를 끄거나 정책을 넓혀서 성능 지적을 없애기** — CLAUDE.md CRITICAL 위반이다.
- **`profiles`·`insight_cache`에 쓰기 정책·권한 추가** — 클라이언트가 플랜을 바꿀 수 있게 된다.
- **`unused_index`를 보고 인덱스 삭제** — 사용자가 적은 실습 DB에서는 거의 모든 인덱스가 '미사용'이다.
  D로 분류한다(playbook 참고).
- **로그에 행 내용 출력** — 검증 쿼리는 `count(*)`·카탈로그만 본다. 거래·가맹점·금액을 SELECT하지 마라.

## 파일

- `references/playbook.md` — lint별 분류·레시피·하지 말 것, 사각지대·대조 쿼리
