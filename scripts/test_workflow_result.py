"""
workflow_result.py 테스트.

핵심 계약: /review-code 3단계의 result.json은 하네스가 디스크에 남긴 워크플로우 반환값을
**코드가** 옮긴 것이다. LLM이 손으로 다시 쓰지 않는다 — 게이트 마커가 그 안에 있다.
"""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
import workflow_result as wr

RESULT = {
    "decision": "Blocked",
    "counts": {"critical": 1, "major": 0, "minor": 0, "nit": 0},
    "findings": [{"file": "a.ts", "line": 1, "severity": "critical"}],
    "summaryMd": '# 요약\n\n<!-- finsight-review {"decision":"Blocked"} -->',
}


def record(root, session, run_id, *, pack, ts, status="completed", name="review-code", result=RESULT):
    d = root / "projects" / "-repo" / session / "workflows"
    d.mkdir(parents=True, exist_ok=True)
    body = {
        "runId": run_id, "timestamp": ts, "workflowName": name, "status": status,
        "args": {"packDir": pack, "base": "abc1234", "head": "HEAD"}, "result": result,
    }
    (d / f"{run_id}.json").write_text(json.dumps(body, ensure_ascii=False), encoding="utf-8")


def test_returns_the_result_of_the_run_for_this_pack(tmp_path):
    record(tmp_path, "s1", "wf_a", pack="/tmp/pack-1", ts="2026-10-01T00:00:00Z")
    assert wr.find_result(tmp_path, "/tmp/pack-1") == RESULT


def test_ignores_runs_for_other_packs(tmp_path):
    record(tmp_path, "s1", "wf_a", pack="/tmp/other", ts="2026-10-01T00:00:00Z")
    with pytest.raises(wr.NotFound):
        wr.find_result(tmp_path, "/tmp/pack-1")


def test_ignores_unfinished_runs_and_other_workflows(tmp_path):
    record(tmp_path, "s1", "wf_a", pack="/tmp/pack-1", ts="2026-10-01T00:00:00Z", status="running")
    record(tmp_path, "s1", "wf_b", pack="/tmp/pack-1", ts="2026-10-01T00:00:01Z", name="something-else")
    with pytest.raises(wr.NotFound):
        wr.find_result(tmp_path, "/tmp/pack-1")


def test_picks_the_latest_completed_run_when_retried(tmp_path):
    newer = {**RESULT, "decision": "Approve"}
    record(tmp_path, "s1", "wf_a", pack="/tmp/pack-1", ts="2026-10-01T00:00:00Z")
    record(tmp_path, "s2", "wf_b", pack="/tmp/pack-1", ts="2026-10-01T00:05:00Z", result=newer)
    assert wr.find_result(tmp_path, "/tmp/pack-1")["decision"] == "Approve"


def test_result_without_summary_is_rejected(tmp_path):
    # summaryMd(게이트 마커 포함)가 없으면 3단계가 올릴 본문이 없다. 손으로 채우게 두지 않는다.
    record(tmp_path, "s1", "wf_a", pack="/tmp/pack-1", ts="2026-10-01T00:00:00Z", result={"decision": "Approve"})
    with pytest.raises(wr.NotFound):
        wr.find_result(tmp_path, "/tmp/pack-1")


def test_unreadable_record_is_skipped(tmp_path):
    bad = tmp_path / "projects" / "-repo" / "s1" / "workflows"
    bad.mkdir(parents=True)
    (bad / "wf_x.json").write_text("{", encoding="utf-8")
    record(tmp_path, "s1", "wf_a", pack="/tmp/pack-1", ts="2026-10-01T00:00:00Z")
    assert wr.find_result(tmp_path, "/tmp/pack-1") == RESULT


def test_config_dir_honours_env(tmp_path, monkeypatch):
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(tmp_path))
    assert wr.config_dir() == tmp_path
    monkeypatch.delenv("CLAUDE_CONFIG_DIR")
    assert wr.config_dir() == Path.home() / ".claude"


def test_main_prints_json_and_fails_closed(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(tmp_path))
    monkeypatch.setattr(wr.time, "sleep", lambda _s: None)
    assert wr.main(["workflow_result.py", "/tmp/pack-1"]) == 1
    assert "찾지 못했" in capsys.readouterr().err

    record(tmp_path, "s1", "wf_a", pack="/tmp/pack-1", ts="2026-10-01T00:00:00Z")
    assert wr.main(["workflow_result.py", "/tmp/pack-1"]) == 0
    assert json.loads(capsys.readouterr().out) == RESULT


def test_main_waits_briefly_for_the_record_to_land(tmp_path, monkeypatch, capsys):
    # 완료 알림과 기록 파일 쓰기 사이에 틈이 있어도 리뷰를 놓치지 않는다.
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(tmp_path))
    waits = []

    def sleep(seconds):
        waits.append(seconds)
        if len(waits) == 2:
            record(tmp_path, "s1", "wf_a", pack="/tmp/pack-1", ts="2026-10-01T00:00:00Z")

    monkeypatch.setattr(wr.time, "sleep", sleep)
    assert wr.main(["workflow_result.py", "/tmp/pack-1"]) == 0
    assert len(waits) == 2
