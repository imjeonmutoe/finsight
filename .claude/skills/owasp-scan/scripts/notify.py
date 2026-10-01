#!/usr/bin/env python3
"""owasp-score.json → 공개 요약(Markdown) · Slack 페이로드. 정기 실행(.github/workflows/owasp-scan.yml) 전용.

사용법:
    python3 notify.py due --anchor 2026-10-02          # 이번 주가 스캔 주면 true
    python3 notify.py summary .owasp/owasp-score.json  # Job Summary용 Markdown
    python3 notify.py slack .owasp/owasp-score.json --run-url URL
    python3 notify.py failure --run-url URL

리포가 공개라 공개 요약에는 점수만 넣는다. 지적 내용·파일 위치는 비공개 Slack으로만 보낸다.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

SLACK_MAX_ITEMS = 30


def is_scan_week(today: date, anchor: date) -> bool:
    # ISO 주차 홀짝은 53주인 해를 넘을 때 깨진다. 기준일로부터 지난 주 수로 센다.
    return (today - anchor).days // 7 % 2 == 0


def public_summary(data: dict) -> str:
    lines = [
        "## OWASP Top 10:2025 정기 스캔",
        "",
        f"**{data['total']}/{data['max']} · {data['grade']}**",
        "",
        "| 카테고리 | 이름 | 점수 |",
        "|---|---|---|",
    ]
    for c in data["categories"]:
        s = "미검토" if c["score"] is None else f"{c['score']}/10"
        lines.append(f"| {c['id']} | {c['name']} | {s} |")
    lines += ["", "지적 상세는 비공개 채널로만 보낸다 (공개 리포)."]
    return "\n".join(lines) + "\n"


def _esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def slack_payload(data: dict, run_url: str) -> dict:
    c, st = data["counts"], data["stats"]
    not_assessed = sum(c["score"] is None for c in data["categories"])
    lines = [
        f"*OWASP 정기 스캔 — {data['total']}/{data['max']} · {_esc(data['grade'])}*",
        f"critical {c['critical']} · major {c['major']} · minor {c['minor']} · nit {c['nit']}",
        f"기각 {st['refuted']} · 미검증 {st['unverified']} · 미검토 {not_assessed}",
        "",
    ]
    top = [f for f in data["findings"] if f["severity"] in ("critical", "major")]
    if not top:
        lines.append("critical·major 지적 없음")
    for f in top[:SLACK_MAX_ITEMS]:
        lines.append(f"• [{f['severity']}] {f['category']} `{_esc(f['file'])}:{f['line']}` {_esc(f['title'])}")
    if len(top) > SLACK_MAX_ITEMS:
        lines.append(f"…외 {len(top) - SLACK_MAX_ITEMS}건")
    lines += ["", f"실행: {run_url}"]
    return {"text": "\n".join(lines)}


def failure_payload(run_url: str) -> dict:
    return {"text": f"*OWASP 정기 스캔 실패* — 리포트가 만들어지지 않았다.\n실행: {run_url}"}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("due").add_argument("--anchor", required=True)
    sub.add_parser("summary").add_argument("score")
    p = sub.add_parser("slack")
    p.add_argument("score")
    p.add_argument("--run-url", required=True)
    sub.add_parser("failure").add_argument("--run-url", required=True)
    a = ap.parse_args()

    if a.cmd == "due":
        print("true" if is_scan_week(date.today(), date.fromisoformat(a.anchor)) else "false")
    elif a.cmd == "summary":
        print(public_summary(json.loads(Path(a.score).read_text("utf-8"))), end="")
    elif a.cmd == "slack":
        print(json.dumps(slack_payload(json.loads(Path(a.score).read_text("utf-8")), a.run_url), ensure_ascii=False))
    else:
        print(json.dumps(failure_payload(a.run_url), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
