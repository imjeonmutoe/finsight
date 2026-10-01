#!/usr/bin/env python3
"""owasp-score.json → 공개 요약(Markdown) · SARIF. 정기 실행(.github/workflows/owasp-scan.yml) 전용.

사용법:
    python3 notify.py due --anchor 2026-10-02          # 이번 주가 스캔 주면 true
    python3 notify.py summary .owasp/owasp-score.json  # Job Summary용 Markdown
    python3 notify.py sarif .owasp/owasp-score.json    # code scanning 업로드용

리포가 공개라 공개 요약에는 점수만 넣는다. 지적은 SARIF로 올려 Security 탭(쓰기 권한자만 봄)에만 남긴다.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

LEVEL = {"critical": "error", "major": "error", "minor": "warning", "nit": "note"}
# GitHub 구간: 9.0 초과 critical · 7.0~8.9 high · 4.0~6.9 medium · 0.1~3.9 low
SECURITY_SEVERITY = {"critical": "9.5", "major": "7.5", "minor": "5.0", "nit": "2.0"}


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
    lines += ["", "지적 상세는 Security 탭의 code scanning 알림에만 남긴다 (공개 리포)."]
    return "\n".join(lines) + "\n"


def sarif(data: dict) -> dict:
    # 규칙은 카테고리×심각도로 나눈다. security-severity가 결과가 아니라 규칙 속성이라서다.
    rules, results = {}, []
    for f in data["findings"]:
        rule_id, uri, line = f"{f['category']}/{f['severity']}", f["file"], f["line"]
        if line < 1:
            # npm audit 지적: file이 패키지 이름이다. 패키지마다 규칙을 따로 둬야 한 알림으로 합쳐지지 않는다.
            rule_id, uri, line = f"{rule_id}/{f['file']}", "package.json", 1
        rules.setdefault(rule_id, {
            "id": rule_id,
            "shortDescription": {"text": f"OWASP {f['category']} · {f['severity']}"},
            "properties": {"tags": ["security"], "security-severity": SECURITY_SEVERITY[f["severity"]]},
        })
        text = "\n\n".join(x for x in (
            f["title"], f.get("failure_scenario", ""), f"고칠 것: {f['fix']}" if f.get("fix") else "",
            f"검증: {f.get('status', '미검증')}") if x)
        results.append({
            "ruleId": rule_id,
            "level": LEVEL[f["severity"]],
            "message": {"text": text},
            "locations": [{"physicalLocation": {
                "artifactLocation": {"uri": uri},
                "region": {"startLine": line, "startColumn": 1, "endLine": line, "endColumn": 1},
            }}],
        })
    return {
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        "version": "2.1.0",
        "runs": [{"tool": {"driver": {"name": "owasp-scan", "rules": list(rules.values())}}, "results": results}],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("due").add_argument("--anchor", required=True)
    sub.add_parser("summary").add_argument("score")
    sub.add_parser("sarif").add_argument("score")
    a = ap.parse_args()

    if a.cmd == "due":
        print("true" if is_scan_week(date.today(), date.fromisoformat(a.anchor)) else "false")
        return 0
    data = json.loads(Path(a.score).read_text("utf-8"))
    if a.cmd == "summary":
        print(public_summary(data), end="")
    else:
        print(json.dumps(sarif(data), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
