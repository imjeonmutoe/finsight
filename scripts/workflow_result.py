#!/usr/bin/env python3
"""/review-code 워크플로우의 반환값을 하네스가 남긴 실행 기록에서 꺼낸다.

반환값의 summaryMd 끝에는 자동 머지 게이트가 읽는 판정 마커가 있다. 이것을 오케스트레이터
LLM이 heredoc으로 다시 옮겨 적으면, 오기 하나나 diff에 섞인 지시문 하나로 마커가 바뀌어도
게이트는 모른다(마커가 하나뿐이면 '둘 이상 거부' 검사도 통과한다). 그래서 코드가 옮긴다.

Claude Code는 워크플로우가 끝나면 `<설정 디렉터리>/projects/<프로젝트>/<세션>/workflows/<runId>.json`에
args·status·result를 남긴다(2.1.286에서 확인). 팩 경로(`args.packDir`)는 mktemp라 실행마다
유일하므로 그것으로 이번 실행을 고른다.

못 찾으면 exit 1이다. 손으로 채우는 대체 경로를 두지 마라 — 그게 이 스크립트가 없애려는 경로다.

사용법:
    python3 scripts/workflow_result.py "$PACK" > "$PACK/result.json"
"""

import json
import os
import sys
import time
from pathlib import Path

WORKFLOW = "review-code"
# 완료 알림과 기록 파일 쓰기 사이의 틈을 넘길 만큼만 기다린다.
ATTEMPTS = 10


class NotFound(Exception):
    pass


def config_dir():
    env = os.environ.get("CLAUDE_CONFIG_DIR")
    return Path(env) if env else Path.home() / ".claude"


def find_result(root, pack_dir):
    best = None
    for path in Path(root).glob("projects/*/*/workflows/wf_*.json"):
        try:
            rec = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        result = rec.get("result")
        if (
            rec.get("workflowName") != WORKFLOW
            or rec.get("status") != "completed"
            or (rec.get("args") or {}).get("packDir") != pack_dir
            or not isinstance(result, dict)
            or not isinstance(result.get("summaryMd"), str)
        ):
            continue
        # 재실행하면 같은 팩으로 기록이 둘 생긴다. 마지막 것이 이번 판정이다.
        if best is None or str(rec.get("timestamp", "")) > str(best.get("timestamp", "")):
            best = rec
    if best is None:
        raise NotFound(f"{pack_dir}로 끝난 {WORKFLOW} 실행 기록을 찾지 못했습니다 ({root}).")
    return best["result"]


def main(argv):
    if len(argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    for attempt in range(ATTEMPTS):
        try:
            result = find_result(config_dir(), argv[1])
        except NotFound as e:
            if attempt == ATTEMPTS - 1:
                print(e, file=sys.stderr)
                return 1
            time.sleep(1)
            continue
        print(json.dumps(result, ensure_ascii=False))
        return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
