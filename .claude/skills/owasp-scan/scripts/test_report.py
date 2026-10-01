"""report.py 회귀 테스트 — 채점은 코드가 한다. LLM이 점수를 매기지 않는다."""

import json

import pytest

import report
from scan import CATEGORIES

ALL = list(CATEGORIES)


def f(id, cat="A01", sev="major", crit=False, **kw):
    return dict(id=id, check="x", category=cat, severity=sev, critical_rule=crit,
                title="t", file="a.ts", line=1, failure_scenario="s", fix="x", source="auto", **kw)


def build(auto, manual=(), verdicts=(), assessed=ALL):
    return report.build(
        {"meta": {"repo": "r"}, "categories": CATEGORIES, "findings": list(auto)},
        {"assessed": list(assessed), "notes": {}, "findings": list(manual), "verdicts": list(verdicts)},
    )


def cat(data, c):
    return next(x for x in data["categories"] if x["id"] == c)


def test_clean_scan_is_full_marks():
    d = build([])
    assert (d["total"], d["max"], d["grade"]) == (100, 100, "양호")


def test_penalties_and_clamp():
    d = build([f("a", sev="major"), f("b", sev="minor"), f("c", "A02", "critical"), f("d", "A02", "major")])
    assert cat(d, "A01")["score"] == 10 - 4 - 1
    assert cat(d, "A02")["score"] == 0


def test_any_surviving_critical_forces_worst_grade():
    d = build([f("a", sev="critical")])
    assert d["total"] == 90
    assert d["grade"] == "위험"


def test_refuted_findings_are_dropped_and_counted():
    d = build([f("a"), f("b")], verdicts=[{"id": "a", "refuted": True, "reason": "r"}, {"id": "b", "refuted": False}])
    assert [x["id"] for x in d["findings"]] == ["b"]
    assert d["stats"]["refuted"] == 1
    assert d["refuted"][0]["reason"] == "r"


def test_missing_verdict_is_kept_as_unverified():
    d = build([f("a")])
    assert d["findings"][0]["status"] == "미검증"
    assert d["stats"]["unverified"] == 1


def test_severity_correction_cannot_go_below_floor_for_critical_rule():
    d = build([f("a", crit=True), f("b")], verdicts=[
        {"id": "a", "refuted": False, "severity_correction": "nit"},
        {"id": "b", "refuted": False, "severity_correction": "nit"},
    ])
    sev = {x["id"]: x["severity"] for x in d["findings"]}
    assert sev == {"a": "major", "b": "nit"}


def test_unassessed_category_has_no_score_and_no_grade():
    d = build([], assessed=ALL[:9])
    assert cat(d, "A10")["score"] is None
    assert (d["total"], d["max"]) == (90, 90)
    assert d["grade"] == "판정 불가"


def test_manual_findings_get_ids_and_source():
    d = build([], manual=[{k: v for k, v in f(None).items() if k not in ("id", "source")}])
    [x] = d["findings"]
    assert x["id"] == "M-1" and x["source"] == "manual"


def test_unknown_category_is_rejected():
    with pytest.raises(ValueError):
        build([f("a", cat="A11")])


def test_findings_sorted_by_severity():
    d = build([f("a", sev="minor"), f("b", sev="critical"), f("c", sev="major")])
    assert [x["id"] for x in d["findings"]] == ["b", "c", "a"]


def test_render_escapes_script_breakout(tmp_path):
    evil = "</script><script>alert(1)</script>"
    d = build([f("a") | {"title": evil}])
    html = report.render(d, "<html><script>const DATA = /*__DATA__*/null;</script></html>")
    assert "</script><script>alert(1)" not in html
    assert "alert(1)" in html  # 데이터는 남는다 — 이스케이프됐을 뿐
    start = html.index("const DATA = ") + len("const DATA = ")
    payload = html[start:html.index(";</script>", start)]
    assert json.loads(payload)["findings"][0]["title"] == evil


def test_render_requires_placeholder():
    with pytest.raises(ValueError):
        report.render(build([]), "<html></html>")
