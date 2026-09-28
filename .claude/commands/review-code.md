---
description: 변경분을 3개 차원 서브에이전트로 병렬 리뷰하고 반박 검증까지 돌린다
---

`main`과의 merge-base 이후 변경분을 리뷰한다. 아래 순서를 그대로 따르고, 각 단계의 검증을 통과한 뒤 다음으로 간다.

`/review`(단일 세션 5개 체크리스트)와는 다른 도구다. `/review`는 step 하나 끝날 때 도는 빠른 게이트,
이쪽은 페이즈·PR 단위로 도는 깊은 리뷰다.

## 1. diff 팩 생성

스크립트에는 파일시스템 접근이 없다. diff는 여기서 한 번만 떠서 파일로 남기고, 서브에이전트는 그 경로를 읽는다.
에이전트마다 `git diff`를 다시 돌리면 토큰이 3배가 된다.

```bash
BASE=$(git merge-base main HEAD)
PACK=$(mktemp -d)
{ git diff "$BASE" HEAD; git diff HEAD; } > "$PACK/diff.patch"
{ git diff --name-only "$BASE" HEAD; git diff --name-only HEAD; } | sort -u > "$PACK/files.txt"
echo "PACK=$PACK  BASE=$BASE  lines=$(wc -l < "$PACK/diff.patch")  files=$(wc -l < "$PACK/files.txt")"
```

**검증**: `diff.patch`가 0바이트가 아니다. 비었으면 "리뷰할 변경이 없다"고 알리고 **여기서 멈춘다** —
워크플로우를 돌리지 마라.

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

**검증**: 완료 알림의 결과에 `decision`, `counts`, `markdown`이 들어 있다.
`markdown`이 없으면 워크플로우가 중간에 죽은 것이다 — 로그를 보고 원인을 말해라. 결과를 지어내지 마라.

## 3. 결과 출력

반환된 `markdown`을 **그대로** 사용자에게 출력한다. 요약하거나 다시 쓰지 마라.
심각도 집계와 판정(Approve / Changes Requested / Blocked)은 스크립트가 코드로 계산한 값이다.
네가 다시 세거나 판정을 바꾸지 마라.

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
2. `.claude/workflows/review-code.js` 의 `DIMENSIONS` 배열에 한 줄 추가한다.

오케스트레이터 로직은 건드릴 필요가 없다. 단, 차원이 늘면 에이전트 수가 `2N+1`로 늘어난다.
세션 워크플로우 크기 가이드라인(10개 미만)을 넘기면 `/config`의 "Dynamic workflow size"를 올려야 한다.
