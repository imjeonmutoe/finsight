from datetime import date

from notify import failure_payload, is_scan_week, public_summary, slack_payload


def score(**over):
    data = {
        "total": 82,
        "max": 100,
        "grade": "보통",
        "counts": {"critical": 0, "major": 1, "minor": 2, "nit": 0},
        "categories": [
            {"id": "A01", "name": "접근 통제 실패", "score": 6},
            {"id": "A02", "name": "보안 설정 오류", "score": None},
        ],
        "findings": [
            {"severity": "major", "category": "A01", "file": "src/app/api/x/route.ts", "line": 12,
             "title": "user_id 조건 <누락>", "status": "검증됨"},
            {"severity": "minor", "category": "A09", "file": "src/lib/log.ts", "line": 3,
             "title": "minor는 Slack에 안 나간다", "status": "검증됨"},
        ],
        "stats": {"refuted": 3, "unverified": 1, "assessed": 9},
    }
    data.update(over)
    return data


RUN = "https://github.com/o/r/actions/runs/1"


def test_공개_요약에는_점수만_있고_지적은_없다():
    md = public_summary(score())
    assert "82/100 · 보통" in md
    assert "| A01 | 접근 통제 실패 | 6/10 |" in md
    assert "| A02 | 보안 설정 오류 | 미검토 |" in md
    assert "route.ts" not in md
    assert "누락" not in md


def test_slack에는_critical_major만_file_line과_함께_간다():
    text = slack_payload(score(), RUN)["text"]
    assert "82/100 · 보통" in text
    assert "`src/app/api/x/route.ts:12`" in text
    assert "minor는 Slack에" not in text
    assert "기각 3 · 미검증 1 · 미검토 1" in text
    assert RUN in text


def test_slack_특수문자를_이스케이프한다():
    # 지적 제목에는 리포 코드가 섞인다. <...>는 Slack에서 링크·멘션 문법이다.
    text = slack_payload(score(), RUN)["text"]
    assert "&lt;누락&gt;" in text
    assert "<누락>" not in text


def test_critical_major가_없으면_없음이라고_쓴다():
    text = slack_payload(score(findings=[]), RUN)["text"]
    assert "critical·major 지적 없음" in text


def test_지적이_많으면_잘라서_남은_건수를_쓴다():
    many = [{"severity": "major", "category": "A01", "file": f"f{i}.ts", "line": 1, "title": "t"}
            for i in range(40)]
    text = slack_payload(score(findings=many), RUN)["text"]
    assert "`f29.ts:1`" in text
    assert "`f30.ts:1`" not in text
    assert "외 10건" in text


def test_실패_알림에는_실행_링크만_있다():
    assert RUN in failure_payload(RUN)["text"]


def test_격주_판정은_기준일부터_짝수_주에만_참이다():
    anchor = date(2026, 10, 2)
    assert is_scan_week(date(2026, 10, 2), anchor)
    assert not is_scan_week(date(2026, 10, 9), anchor)
    assert is_scan_week(date(2026, 10, 16), anchor)
    # ISO 주차 홀짝은 53주인 해(2026)를 넘을 때 2주 연속 같은 값이 된다. 기준일 차이로 세면 안 깨진다.
    assert is_scan_week(date(2027, 1, 8), anchor)
    assert not is_scan_week(date(2027, 1, 1), anchor)
