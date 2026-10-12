---
description: Lighthouse 성능 점수를 autoresearch 방식으로 더 안 오를 때까지 올린다
argument-hint: "[patience=5] [maxTrials=30]"
---

`docs/LIGHTHOUSE_LOOP.md`의 루프를 시작한다. 인자: `$ARGUMENTS` (없으면 patience 5, maxTrials 30).

## 1. 준비

1. `git status --porcelain`이 비어 있는지 확인한다. 아니면 멈추고 사용자에게 알린다 — 평가기가
   discard 때 작업트리를 `git restore`·`git clean -fd`로 되돌리므로 커밋 안 된 작업이 날아간다.
2. 브랜치를 판다: `git switch -c lighthouse/<오늘 MMDD>` (이미 있으면 `-2`, `-3`을 붙인다).
   main에 실험 커밋을 쌓지 않는다.
3. 측정기가 도는지 본다: `npx -y lighthouse@13.5.0 --version`, `/Applications/Google Chrome.app` 존재.

## 2. 루프 실행

Workflow를 이름으로 호출한다: `name: "lighthouse-loop"`, `args: {"patience": <첫 인자>, "maxTrials": <둘째 인자>}`
(숫자로 넘긴다. 없는 인자는 빼면 기본값이 쓰인다).

실험 하나에 5~9분이 걸려 몇 시간 돈다. **완료 알림이 오기 전에 턴을 끝내지 마라.** 중간에 사용자가
물으면 `python3 scripts/lighthouse_loop.py status`로 답한다.

## 3. 보고

- 반환값의 `stopped`(plateau / perfect / max-trials / baseline-failed), 기준선 → 최근 점수, keep된 실험 목록.
- `column -t -s $'\t' .autoresearch/lighthouse/results.tsv`의 마지막 행들.
- 화면이 바뀌지 않았는지 `bash scripts/preview-shot.sh /`로 찍어 기준 스크린샷과 비교한다.
- 이어서 할 일: 브랜치를 push하고 PR을 열지 사용자에게 묻는다.
