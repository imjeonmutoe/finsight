---
description: 변경분을 3개 차원 서브에이전트로 병렬 리뷰하고 반박 검증까지 돌린다
---

`main`과의 merge-base 이후 변경분을 리뷰한다. 아래 순서를 그대로 따르고, 각 단계의 검증을 통과한 뒤 다음으로 간다.

`/review`(단일 세션 5개 체크리스트)와는 다른 도구다. `/review`는 step 하나 끝날 때 도는 빠른 게이트,
이쪽은 페이즈·PR 단위로 도는 깊은 리뷰다.

## 1. diff 팩 생성

스크립트에는 파일시스템 접근이 없다. diff는 여기서 한 번만 떠서 파일로 남기고, 서브에이전트는 그 경로를 읽는다.
에이전트마다 `git diff`를 다시 돌리면 토큰이 3배가 된다.

`git diff HEAD`는 아직 `git add` 하지 않은 신규 파일을 출력하지 않는다. 방금 만든 제일 위험한
코드가 통째로 리뷰에서 빠지는데도 다른 변경 덕에 팩은 비어 보이지 않아 판정이 Approve로 난다.
untracked 파일을 `--no-index`로 따로 떠서 붙인다 (gitignore된 것은 `--exclude-standard`가 걸러 준다).

```bash
BASE=$(git merge-base main HEAD)
PACK=$(mktemp -d)
{
  git diff "$BASE" HEAD
  git diff HEAD
  git ls-files --others --exclude-standard | while IFS= read -r f; do
    git diff --no-index /dev/null "$f" || true
  done
} > "$PACK/diff.patch"
{
  git diff --name-only "$BASE" HEAD
  git diff --name-only HEAD
  git ls-files --others --exclude-standard
} | sort -u > "$PACK/files.txt"
echo "PACK=$PACK  BASE=$BASE  lines=$(wc -l < "$PACK/diff.patch")  files=$(wc -l < "$PACK/files.txt")"
```

(`git diff --no-index`는 차이가 있으면 종료 코드 1을 돌려준다. `|| true`가 그래서 붙어 있다.)

**검증**: `diff.patch`가 0바이트가 아니고, `files.txt`에 방금 만든 신규 파일이 들어 있다.
비었으면 "리뷰할 변경이 없다"고 알리고 **여기서 멈춘다** — 워크플로우를 돌리지 마라.

## 2. 워크플로우 실행

Workflow 툴을 호출한다. 이 지시가 멀티에이전트 오케스트레이션에 대한 옵트인이다.

```
Workflow({
  name: "review-code",
  args: { packDir: "<1단계 PACK>", base: "<1단계 BASE 앞 7자>", head: "HEAD" }
})
```

에이전트 7개가 뜬다 — 리뷰 3 + 검증 3 + 종합 1. 백그라운드로 돌고 완료 알림이 온다.
진행 상황은 `/workflows`로 볼 수 있다.

7개 **전부** `.claude/agents/`의 `tools: Read, Grep, Glob` 타입으로 뜬다 (차원별 리뷰어 3종,
`review-verify`, `review-summary`). 셸도 파일 쓰기도 없다. 이유: 이 에이전트들이 읽는 diff는
신뢰할 수 없는 입력이다. 남의 브랜치나 외부 기여 PR의 주석에 에이전트를 향한 지시문이
심겨 있을 수 있고, 워크플로우는 백그라운드로 돌아 중간 툴 호출이 눈에 띄지 않는다.
**새 차원을 추가할 때 `agentType`을 빠뜨리면 그 에이전트만 셸을 든 채 뜬다.**

`.claude/agents/`에 파일을 새로 만든 **그 세션에서는 레지스트리가 아직 그 에이전트를 모른다.**
워크플로우가 `agent type '...' not found`로 즉시 죽는다. 토큰은 안 쓰이니 손해는 없고,
세션을 새로 열면 잡힌다. 없는 타입을 조용히 기본 타입으로 대체하지 않는 건 의도한 것이다 —
권한 제한이 빠진 채로 도는 것보다 안 도는 게 낫다.

**검증**: 완료 알림의 결과에 `decision`, `counts`, `markdown`이 들어 있다.
`markdown`이 없으면 워크플로우가 중간에 죽은 것이다 — 로그를 보고 원인을 말해라. 결과를 지어내지 마라.

## 3. 결과 출력 — PR 우선, 콘솔 fallback

반환값에 `summaryMd`(Layer 2), `inlineMd`(Layer 1), `markdown`(둘을 합친 것), `findings`가 들어 있다.
심각도 집계와 판정은 스크립트가 코드로 계산한 값이다. **네가 다시 세거나 판정을 바꾸지 마라.**

먼저 열린 PR이 있는지 본다.

```bash
gh pr view --json number,headRefOid 2>/dev/null
```

### PR이 있으면

Layer 2를 리뷰 본문으로, Layer 1을 라인별 인라인 코멘트로 올린다.

인라인 코멘트는 **PR diff의 hunk 안에 있는 줄에만** 달 수 있다. 범위 밖 지적이 하나라도 섞이면
GitHub이 리뷰 전체를 422로 거절해서 멀쩡한 인라인까지 같이 날아간다. 보내고 실패를 기다리지 말고
보내기 전에 갈라라. `scripts/pr_review_payload.py`가 그 일을 한다 — 범위 안은 인라인으로,
범위 밖은 요약 본문 끝에 목록으로 붙인다.

기준이 되는 patch는 **PR 자신의 diff**다. 1단계 팩이 아니다. 팩에는 아직 커밋하지 않은 변경과
untracked 파일이 섞여 있고, 그것들은 PR에 존재하지 않아 어차피 인라인을 달 수 없다.

```bash
# 워크플로우 반환값을 파일로 남긴다 (findings·summaryMd가 들어 있는 객체 그대로)
cat > "$PACK/result.json" <<'JSON'
<워크플로우 반환값 JSON>
JSON

gh pr diff <번호> > "$PACK/pr.diff"
python3 scripts/pr_review_payload.py "$PACK/result.json" "$PACK/pr.diff" <headRefOid> > "$PACK/payload.json"
gh api "repos/{owner}/{repo}/pulls/<번호>/reviews" --method POST --input "$PACK/payload.json"
```

스크립트가 stderr로 `인라인 N건 / 범위 밖 M건은 본문으로`를 찍는다. **M이 0이 아니면 그 사실을
사용자에게 말해라.** 어떤 지적이 인라인으로 안 붙었는지 알아야 한다.

`event`는 항상 `COMMENT`다. 이유: GitHub은 자기 PR에 `APPROVE`·`REQUEST_CHANGES`를 거부한다.
판정은 본문 안에 이미 적혀 있다.

**그래도 422가 나면 조용히 넘어가지 마라.** `gh pr comment`로 `markdown` 전체를 코멘트 하나로
올리고, 인라인이 불발됐다는 사실과 API가 돌려준 메시지를 사용자에게 말해라.

### PR이 없으면

반환된 `markdown`을 **그대로** 출력한다. 요약하거나 다시 쓰지 마라.

### 공통

출력 뒤에 팩 경로 한 줄을 덧붙인다: `팩: <PACK>` (재실행·디버깅용).

## 판정 기준 (스크립트가 계산한다)

| 판정 | 조건 |
|---|---|
| Blocked | critical ≥ 1 |
| Changes Requested | critical 0, major ≥ 1 |
| Approve | critical 0, major 0 |

심각도: 🔴 critical(데이터 유출·금전 손실·데이터 손상) · 🟠 major(기능이 틀린다) ·
🟡 minor(규칙 위반이지만 동작은 맞다) · ⚪ nit(취향)

## 차원 추가하는 법

1. `.claude/agents/review-<차원>.md` 를 만든다 (기존 3개와 같은 틀: 읽는 법 / 체크리스트 / 보고 규칙 / 필드 의미).
   프론트매터에 **`tools: Read, Grep, Glob`을 반드시 넣어라.** 빠뜨리면 그 에이전트만
   기본 도구 집합(Bash·Write 포함)으로 뜬다.
2. `.claude/workflows/review-code.js` 의 `DIMENSIONS` 배열에 한 줄 추가한다 (`agentType` 포함).

검증·종합 에이전트(`review-verify`·`review-summary`)는 차원과 무관하게 공유하므로 건드릴 필요가 없다.

오케스트레이터 로직은 건드릴 필요가 없다. 단, 차원이 늘면 에이전트 수가 `2N+1`로 늘어난다.
세션 워크플로우 크기 가이드라인(10개 미만)을 넘기면 `/config`의 "Dynamic workflow size"를 올려야 한다.
