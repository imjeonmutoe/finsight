from datetime import date

from notify import is_scan_week, public_summary, sarif


def score(**over):
    data = {
        "total": 82,
        "max": 100,
        "grade": "보통",
        "counts": {"critical": 0, "major": 1, "minor": 1, "nit": 0},
        "categories": [
            {"id": "A01", "name": "접근 통제 실패", "score": 6},
            {"id": "A02", "name": "보안 설정 오류", "score": None},
        ],
        "findings": [
            {"severity": "major", "category": "A01", "file": "src/app/api/x/route.ts", "line": 12,
             "title": "user_id 조건 <누락>", "status": "검증됨",
             "failure_scenario": "남의 거래를 읽는다", "fix": "eq('user_id', user.id)"},
            {"severity": "minor", "category": "A09", "file": "src/lib/log.ts", "line": 3,
             "title": "로그 레벨", "status": "미검증"},
        ],
    }
    data.update(over)
    return data


def by_rule(log):
    return {r["ruleId"]: r for r in log["runs"][0]["results"]}


def test_공개_요약에는_점수만_있고_지적은_없다():
    md = public_summary(score())
    assert "82/100 · 보통" in md
    assert "| A01 | 접근 통제 실패 | 6/10 |" in md
    assert "| A02 | 보안 설정 오류 | 미검토 |" in md
    assert "route.ts" not in md
    assert "누락" not in md


def test_sarif는_남은_지적을_파일_줄에_심각도와_함께_올린다():
    log = sarif(score())
    assert log["version"] == "2.1.0"
    assert log["runs"][0]["tool"]["driver"]["name"] == "owasp-scan"
    r = by_rule(log)["A01/major"]
    assert r["level"] == "error"
    assert r["message"]["text"].startswith("user_id 조건 <누락>")
    assert "남의 거래를 읽는다" in r["message"]["text"]
    loc = r["locations"][0]["physicalLocation"]
    assert loc["artifactLocation"]["uri"] == "src/app/api/x/route.ts"
    assert loc["region"]["startLine"] == 12
    assert by_rule(log)["A09/minor"]["level"] == "warning"
    assert "미검증" in by_rule(log)["A09/minor"]["message"]["text"]


def test_규칙마다_security_태그와_심각도_점수가_붙는다():
    # security-severity는 규칙 속성이고 security 태그가 있어야 보안 심각도로 쓰인다.
    log = sarif(score())
    rules = {r["id"]: r for r in log["runs"][0]["tool"]["driver"]["rules"]}
    assert rules["A01/major"]["properties"]["tags"] == ["security"]
    assert rules["A01/major"]["properties"]["security-severity"] == "7.5"
    assert rules["A09/minor"]["properties"]["security-severity"] == "5.0"
    assert set(rules) == set(by_rule(log))


def test_줄이_없는_의존성_지적은_package_json에_패키지별_규칙으로_붙는다():
    # npm audit 지적은 file이 패키지 이름이고 line이 0이다. 같은 위치·같은 규칙이면 알림 하나로 합쳐진다.
    deps = [{"severity": "major", "category": "A03", "file": n, "line": 0, "title": f"취약 의존성: {n}"}
            for n in ("next", "zod")]
    rs = by_rule(sarif(score(findings=deps)))
    assert set(rs) == {"A03/major/next", "A03/major/zod"}
    loc = rs["A03/major/next"]["locations"][0]["physicalLocation"]
    assert loc["artifactLocation"]["uri"] == "package.json"
    assert loc["region"]["startLine"] == 1


def test_지적이_없으면_빈_결과를_올려_이전_알림을_닫게_한다():
    assert sarif(score(findings=[]))["runs"][0]["results"] == []


def test_격주_판정은_기준일부터_짝수_주에만_참이다():
    anchor = date(2026, 10, 2)
    assert is_scan_week(date(2026, 10, 2), anchor)
    assert not is_scan_week(date(2026, 10, 9), anchor)
    assert is_scan_week(date(2026, 10, 16), anchor)
    # ISO 주차 홀짝은 53주인 해(2026)를 넘을 때 2주 연속 같은 값이 된다. 기준일 차이로 세면 안 깨진다.
    assert is_scan_week(date(2027, 1, 8), anchor)
    assert not is_scan_week(date(2027, 1, 1), anchor)
