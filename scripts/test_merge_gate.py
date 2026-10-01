"""
merge_gate.py 테스트.

핵심 계약 두 가지.
1. critical·major가 하나라도 있으면 승인도 머지도 하지 않는다.
2. '모르겠다'(Incomplete·마커 없음·형식 깨짐)를 '깨끗하다'로 읽지 않는다.

이 게이트는 PR을 자동으로 머지한다. 틀리는 쪽이 항상 '아무것도 안 함'이어야 한다.
"""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
import merge_gate as mg


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SINCE = "2026-10-01T12:00:00Z"
BOT = "github-actions[bot]"


def marker(decision="Approve", critical=0, major=0, minor=0, nit=0, failed=0):
    payload = {
        "decision": decision,
        "counts": {"critical": critical, "major": major, "minor": minor, "nit": nit},
        "stats": {"failed": failed},
    }
    return "<!-- finsight-review " + json.dumps(payload, ensure_ascii=False) + " -->"


def event(body, at="2026-10-01T12:05:00Z", login=BOT):
    return {"login": login, "at": at, "body": body}


def body_with(mk):
    """실제 리뷰 본문처럼 마커 앞뒤에 내용이 붙은 형태."""
    return "# Layer 2 — 전체 요약\n\n## 판정: Approve\n\n본문\n\n" + mk + "\n"


# ---------------------------------------------------------------------------
# decide() — 심각도에 따른 행동
# ---------------------------------------------------------------------------


def test_지적이_하나도_없으면_머지한다():
    action, _ = mg.decide(json.loads(mg.MARKER_RE.search(marker()).group(1)))
    assert action == "merge"


@pytest.mark.parametrize("nit", [1, 5])
def test_nit만_있으면_머지한다(nit):
    action, _ = mg.decide(mg.extract(marker(nit=nit)))
    assert action == "merge"


def test_minor가_있으면_승인만_하고_머지하지_않는다():
    action, reason = mg.decide(mg.extract(marker(minor=1, nit=2)))
    assert action == "approve"
    assert "minor" in reason


def test_major가_있으면_아무것도_하지_않는다():
    action, _ = mg.decide(mg.extract(marker(decision="Changes Requested", major=1)))
    assert action == "none"


def test_critical이_있으면_아무것도_하지_않는다():
    action, _ = mg.decide(mg.extract(marker(decision="Blocked", critical=1, nit=3)))
    assert action == "none"


def test_major와_nit이_섞여_있어도_아무것도_하지_않는다():
    action, _ = mg.decide(mg.extract(marker(decision="Changes Requested", major=1, nit=9)))
    assert action == "none"


# ---------------------------------------------------------------------------
# decide() — '모르겠다'를 '깨끗하다'로 읽지 않는다
# ---------------------------------------------------------------------------


def test_차원이_미실행이면_지적_0건이어도_머지하지_않는다():
    # Incomplete = 그 차원은 한 번도 보지 않았다. 지적이 없는 게 아니라 모르는 것이다.
    action, reason = mg.decide(mg.extract(marker(decision="Incomplete", failed=1)))
    assert action == "none"
    assert "미실행" in reason


def test_판정이_Approve여도_미실행_차원이_있으면_머지하지_않는다():
    # 판정 문자열과 stats가 어긋난 경우. 둘 다 봐야 한 겹이 남는다.
    action, _ = mg.decide(mg.extract(marker(decision="Approve", failed=1)))
    assert action == "none"


def test_판정이_Approve여도_counts에_major가_있으면_머지하지_않는다():
    # 워크플로우가 판정을 잘못 계산한 경우에도 숫자가 막는다.
    action, _ = mg.decide(mg.extract(marker(decision="Approve", major=1)))
    assert action == "none"


def test_모르는_판정값은_아무것도_하지_않는다():
    action, _ = mg.decide({"decision": "Whatever", "counts": {}, "stats": {}})
    assert action == "none"


def test_counts가_없으면_형식_오류다():
    with pytest.raises(mg.MarkerError):
        mg.decide({"decision": "Approve"})


def test_counts_값이_숫자가_아니면_형식_오류다():
    with pytest.raises(mg.MarkerError):
        mg.decide({"decision": "Approve", "counts": {"critical": "0", "major": 0, "minor": 0, "nit": 0}})


# ---------------------------------------------------------------------------
# pick_marker() — 어떤 마커를 믿을 것인가
# ---------------------------------------------------------------------------


def test_봇이_이번_실행에_남긴_마커를_읽는다():
    got = mg.pick_marker([event(body_with(marker(nit=1)))], SINCE, BOT)
    assert got["counts"]["nit"] == 1


def test_사람이_쓴_코멘트의_마커는_무시한다():
    # 작성자가 본문에 마커를 붙여 넣어 게이트를 속이는 경로를 막는다.
    forged = event(body_with(marker()), login="someone")
    assert mg.pick_marker([forged], SINCE, BOT) is None


def test_이전_실행이_남긴_마커는_무시한다():
    old = event(body_with(marker(nit=1)), at="2026-10-01T11:00:00Z")
    assert mg.pick_marker([old], SINCE, BOT) is None


def test_마커가_여러_개면_가장_최근_것을_쓴다():
    events = [
        event(body_with(marker(major=1)), at="2026-10-01T12:05:00Z"),
        event(body_with(marker(nit=1)), at="2026-10-01T12:09:00Z"),
    ]
    got = mg.pick_marker(events, SINCE, BOT)
    assert got["counts"] == {"critical": 0, "major": 0, "minor": 0, "nit": 1}


def test_입력_순서가_뒤집혀_있어도_시각으로_정렬한다():
    events = [
        event(body_with(marker(nit=1)), at="2026-10-01T12:09:00Z"),
        event(body_with(marker(major=1)), at="2026-10-01T12:05:00Z"),
    ]
    got = mg.pick_marker(events, SINCE, BOT)
    assert got["counts"]["nit"] == 1


def test_마커가_없으면_None():
    assert mg.pick_marker([event("마커 없는 평범한 코멘트")], SINCE, BOT) is None


def test_본문이_null인_이벤트를_건너뛴다():
    assert mg.pick_marker([event(None), event(body_with(marker(nit=1)))], SINCE, BOT)["counts"]["nit"] == 1


def test_제출되지_않은_리뷰는_건너뛴다():
    # PENDING 리뷰는 submitted_at이 null이다.
    assert mg.pick_marker([event(body_with(marker()), at=None)], SINCE, BOT) is None


def test_마커_JSON이_깨져_있으면_형식_오류다():
    broken = event("<!-- finsight-review {깨진 json} -->")
    with pytest.raises(mg.MarkerError):
        mg.pick_marker([broken], SINCE, BOT)


# ---------------------------------------------------------------------------
# main() — 종료 코드와 출력
# ---------------------------------------------------------------------------


def write_events(tmp_path, events):
    p = tmp_path / "events.jsonl"
    p.write_text("\n".join(json.dumps(e, ensure_ascii=False) for e in events) + "\n", encoding="utf-8")
    return str(p)


def run_main(tmp_path, events, capsys):
    path = write_events(tmp_path, events)
    code = mg.main(["merge_gate.py", "--events", path, "--since", SINCE, "--actor", BOT])
    return code, capsys.readouterr()


def test_main이_판정을_JSON으로_찍는다(tmp_path, capsys):
    code, out = run_main(tmp_path, [event(body_with(marker(minor=1)))], capsys)
    assert code == 0
    result = json.loads(out.out)
    assert result["action"] == "approve"
    assert result["counts"]["minor"] == 1
    assert result["decision"] == "Approve"


def test_main은_마커가_없으면_실패한다(tmp_path, capsys):
    # 리뷰는 올라왔는데 마커가 없다 = 우리 파이프라인이 깨졌다. 조용히 넘기지 않는다.
    code, out = run_main(tmp_path, [event("마커 없는 코멘트")], capsys)
    assert code == 3
    assert out.out.strip() == ""


def test_main은_빈_줄을_무시한다(tmp_path, capsys):
    path = tmp_path / "events.jsonl"
    path.write_text("\n" + json.dumps(event(body_with(marker()))) + "\n\n", encoding="utf-8")
    code = mg.main(["merge_gate.py", "--events", str(path), "--since", SINCE, "--actor", BOT])
    assert code == 0
    assert json.loads(capsys.readouterr().out)["action"] == "merge"
