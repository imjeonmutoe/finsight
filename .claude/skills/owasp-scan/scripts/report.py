#!/usr/bin/env python3
"""자동 검사 결과 + 수동 검토·반박 검증 결과 → 점수 JSON + 단일 HTML 리포트.

사용법:
    python3 report.py --auto auto.json --review review.json --out <dir>

점수는 여기서만 계산한다. LLM은 지적을 찾고 반박할 뿐 점수를 매기지 않는다.

review.json 형식:
    {
      "assessed": ["A01", ...],          # 수동 검토를 실제로 마친 카테고리
      "notes": {"A01": "검토 범위 한 줄"},
      "findings": [ {category, severity, critical_rule, title, file, line,
                     failure_scenario, fix, evidence?} ],   # 수동 지적(id는 자동 부여)
      "verdicts": [ {id, refuted, phantom?, reason?, severity_correction?} ]
    }
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from scan import CATEGORIES

SEVERITIES = ["critical", "major", "minor", "nit"]
PENALTY = {"critical": 10, "major": 4, "minor": 1, "nit": 0}
CAT_MAX = 10
PLACEHOLDER = "/*__DATA__*/null"
TEMPLATE = Path(__file__).resolve().parent.parent / "assets" / "template.html"


def grade(total: int, max_: int, has_critical: bool) -> str:
    if max_ < CAT_MAX * len(CATEGORIES):
        return "판정 불가"  # 모르는 것은 깨끗한 것이 아니다
    if has_critical or total < 50:
        return "위험"
    if total < 75:
        return "취약"
    if total < 90:
        return "보통"
    return "양호"


def build(auto: dict, review: dict) -> dict:
    manual = [
        {**m, "id": f"M-{i}", "source": "manual"}
        for i, m in enumerate(review.get("findings", []), 1)
    ]
    verdicts = {v["id"]: v for v in review.get("verdicts", [])}
    assessed = set(review.get("assessed", []))

    kept, refuted = [], []
    for f in auto.get("findings", []) + manual:
        if f["category"] not in CATEGORIES:
            raise ValueError(f"알 수 없는 카테고리: {f['category']} ({f['id']})")
        if f["severity"] not in SEVERITIES:
            raise ValueError(f"알 수 없는 심각도: {f['severity']} ({f['id']})")
        v = verdicts.get(f["id"])
        if v and v.get("refuted"):
            refuted.append({**f, "reason": v.get("reason", ""), "phantom": bool(v.get("phantom"))})
            continue
        f = dict(f)
        if v and v.get("severity_correction") in SEVERITIES:
            f["severity"] = v["severity_correction"]
        if f.get("critical_rule") and SEVERITIES.index(f["severity"]) > SEVERITIES.index("major"):
            f["severity"] = "major"  # CRITICAL 규칙 위반은 major 아래로 못 내린다
        f["status"] = "검증됨" if v else "미검증"
        f["verify_note"] = (v or {}).get("reason", "")
        kept.append(f)

    kept.sort(key=lambda f: (SEVERITIES.index(f["severity"]), f["category"], f["file"], f["line"]))

    cats = []
    for cid, name in CATEGORIES.items():
        fs = [f for f in kept if f["category"] == cid]
        counts = {s: sum(f["severity"] == s for f in fs) for s in SEVERITIES}
        score = max(0, CAT_MAX - sum(PENALTY[f["severity"]] for f in fs)) if cid in assessed else None
        cats.append(dict(id=cid, name=name, score=score, max=CAT_MAX, counts=counts,
                         note=review.get("notes", {}).get(cid, "")))

    scored = [c for c in cats if c["score"] is not None]
    total = sum(c["score"] for c in scored)
    max_ = CAT_MAX * len(scored)
    counts = {s: sum(f["severity"] == s for f in kept) for s in SEVERITIES}
    return {
        "meta": auto.get("meta", {}),
        "total": total,
        "max": max_,
        "grade": grade(total, max_, counts["critical"] > 0),
        "counts": counts,
        "categories": cats,
        "findings": kept,
        "refuted": refuted,
        "stats": {
            "auto": len(auto.get("findings", [])),
            "manual": len(manual),
            "refuted": len(refuted),
            "unverified": sum(f["status"] == "미검증" for f in kept),
            "assessed": len(scored),
        },
    }


def safe_json(data: dict) -> str:
    """<script> 안에 넣어도 태그를 닫지 못하게 한다. 지적 문구에는 리포 코드가 그대로 들어 있다."""
    s = json.dumps(data, ensure_ascii=False)
    for a, b in (("<", "\\u003c"), (">", "\\u003e"), ("&", "\\u0026"), (" ", "\\u2028"), (" ", "\\u2029")):
        s = s.replace(a, b)
    return s


def render(data: dict, template: str) -> str:
    if PLACEHOLDER not in template:
        raise ValueError(f"템플릿에 {PLACEHOLDER} 자리표시자가 없다")
    return template.replace(PLACEHOLDER, safe_json(data), 1)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--auto", required=True)
    ap.add_argument("--review", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    data = build(json.loads(Path(a.auto).read_text("utf-8")), json.loads(Path(a.review).read_text("utf-8")))
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "owasp-score.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")
    (out / "owasp-report.html").write_text(render(data, TEMPLATE.read_text("utf-8")), "utf-8")
    c = data["counts"]
    print(f"{data['total']}/{data['max']} · {data['grade']} · critical {c['critical']} · major {c['major']} "
          f"· minor {c['minor']} · nit {c['nit']} · 기각 {data['stats']['refuted']} · 미검증 {data['stats']['unverified']}")
    print(out / "owasp-report.html")
    return 0


if __name__ == "__main__":
    sys.exit(main())
