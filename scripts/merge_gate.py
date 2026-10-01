#!/usr/bin/env python3
"""리뷰 결과를 읽어 자동 승인·머지 여부를 정한다.

판정과 심각도 집계는 `.claude/workflows/review-code.js`가 **코드로** 계산해 리뷰 본문 끝에
머신 리더블 마커로 찍어 둔다. 이 스크립트는 그 숫자를 읽어 행동만 고른다 — LLM은 개입하지
않는다. 리뷰 본문의 한국어를 파싱하거나 지적을 다시 세지 않는다.

    nit만 (또는 지적 0건)  → merge   승인하고 머지한다
    minor 이하            → approve 승인만 한다. 머지는 사람이 한다
    critical·major 하나라도 → none    아무것도 하지 않는다

틀리는 쪽은 항상 `none`이다. 판정을 모르겠으면(마커 없음·형식 깨짐·미실행 차원) 머지하지 않는다.

사용법:
    gh api "repos/{owner}/{repo}/pulls/<번호>/reviews" --paginate \
      --jq '.[] | {login: .user.login, at: .submitted_at, body: .body} | @json' > events.jsonl
    gh api "repos/{owner}/{repo}/issues/<번호>/comments" --paginate \
      --jq '.[] | {login: .user.login, at: .created_at, body: .body} | @json' >> events.jsonl
    python3 scripts/merge_gate.py --events events.jsonl --since <ISO8601> --actor "github-actions[bot]"

종료 코드: 0 판정함 / 2 인자 오류 / 3 마커를 못 읽음
"""

import argparse
import json
import re
import sys

# 워크플로우가 찍는 마커. `<!-- finsight-review {"decision":...} -->`
MARKER_RE = re.compile(r"<!--\s*finsight-review\s+(\{.*?\})\s*-->", re.S)

SEVERITIES = ("critical", "major", "minor", "nit")
BLOCKING = ("critical", "major")


class MarkerError(Exception):
    """마커가 있긴 한데 읽을 수 없다. 조용히 넘기면 깨진 파이프라인이 초록불로 나간다."""


def extract(text):
    """본문에서 마커 JSON을 뽑는다. 없으면 None, 깨져 있거나 둘 이상이면 MarkerError.

    진짜 마커는 본문 끝에 하나만 찍힌다. 둘 이상이면 LLM이 쓴 요약 문구에 위조 마커가
    섞인 것이다 — 어느 쪽이 진짜인지 고르지 않는다.
    """
    found = MARKER_RE.findall(text or "")
    if not found:
        return None
    if len(found) > 1:
        raise MarkerError(f"한 본문에 마커가 {len(found)}개다 — 위조 마커가 섞였을 수 있다")
    try:
        return json.loads(found[0])
    except json.JSONDecodeError as e:
        raise MarkerError(f"마커 JSON을 읽을 수 없다: {e}") from e


def pick_marker(events, since, actor):
    """`actor`가 `since` 이후에 남긴 **단 하나의** 마커를 돌려준다. 없으면 None.

    actor로 거르는 이유: 작성자가 PR 코멘트에 마커를 붙여 넣어 게이트를 속일 수 있다.
    since로 거르는 이유: 재실행했을 때 이전 실행이 남긴 판정을 이번 것으로 착각하면 안 된다.
    하나만 받는 이유: 한 실행은 리뷰를 하나만 올린다. 그런데 리뷰 잡의 에이전트는 PR 쓰기
    토큰을 쥐고 신뢰할 수 없는 diff를 읽으므로, 같은 actor 이름으로 마커 코멘트를 하나 더
    달 수 있다. '가장 최근 것'을 고르면 나중에 단 위조 마커가 이긴다. 둘이면 판정을 모르는 것이다.
    """
    mine = [e for e in events if e.get("login") == actor and e.get("at") and e["at"] > since]
    found = [m for m in (extract(e.get("body")) for e in mine) if m is not None]
    if len(found) > 1:
        raise MarkerError(f"{actor}가 {since} 이후에 남긴 마커가 {len(found)}개다 — 위조 마커가 섞였을 수 있다")
    return found[0] if found else None


def decide(marker):
    """(action, reason)을 돌려준다. action은 merge / approve / none."""
    counts = marker.get("counts")
    if not isinstance(counts, dict):
        raise MarkerError("마커에 counts가 없다")
    nums = {}
    for s in SEVERITIES:
        v = counts.get(s, 0)
        if not isinstance(v, int) or isinstance(v, bool):
            raise MarkerError(f"counts.{s}가 정수가 아니다: {v!r}")
        nums[s] = v

    decision = marker.get("decision")
    failed = (marker.get("stats") or {}).get("failed") or 0

    # 아래 세 겹은 서로를 겹쳐 막는다. 워크플로우가 판정을 잘못 계산해도 숫자가,
    # 숫자가 0이어도 미실행 차원이 막는다.
    blocking = {s: nums[s] for s in BLOCKING if nums[s]}
    if blocking:
        detail = ", ".join(f"{s} {n}건" for s, n in blocking.items())
        return "none", f"{detail} — 자동 승인·머지 대상이 아니다"
    if failed:
        return "none", f"차원 {failed}개가 미실행이다 — 보지 않은 것을 통과시키지 않는다"
    if decision != "Approve":
        return "none", f"판정이 {decision}이다 — Approve일 때만 움직인다"

    if nums["minor"]:
        return "approve", f"minor {nums['minor']}건 — 승인만 하고 머지는 사람이 한다"
    return "merge", (f"nit {nums['nit']}건뿐" if nums["nit"] else "지적 없음") + " — 승인하고 머지한다"


def main(argv):
    ap = argparse.ArgumentParser(description="리뷰 결과로 자동 승인·머지 여부를 정한다")
    ap.add_argument("--events", required=True, help="리뷰·코멘트 JSONL ({login, at, body})")
    ap.add_argument("--since", required=True, help="이번 실행 시작 시각 (ISO8601)")
    ap.add_argument("--actor", required=True, help="리뷰를 올린 계정")
    try:
        ns = ap.parse_args(argv[1:])
    except SystemExit:
        return 2

    with open(ns.events, encoding="utf-8") as fh:
        events = [json.loads(line) for line in fh if line.strip()]

    try:
        marker = pick_marker(events, ns.since, ns.actor)
        if marker is None:
            print(
                f"{ns.actor}가 {ns.since} 이후에 남긴 리뷰에서 판정 마커를 찾지 못했다.",
                file=sys.stderr,
            )
            return 3
        action, reason = decide(marker)
    except MarkerError as e:
        print(str(e), file=sys.stderr)
        return 3

    print(
        json.dumps(
            {
                "action": action,
                "reason": reason,
                "decision": marker.get("decision"),
                "counts": marker.get("counts"),
            },
            ensure_ascii=False,
        )
    )
    print(f"판정 {marker.get('decision')} → {action}: {reason}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
