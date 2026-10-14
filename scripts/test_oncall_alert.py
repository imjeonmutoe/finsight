"""oncall_alert.py — prod alert 판정 관문·Issue 본문 테스트."""

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))
import oncall_alert as oa  # noqa: E402

ISSUE = "01a13411-0000-7000-8000-000000000002"
EVENT = "01a13900-0000-7000-8000-000000000001"
CREATED = "$error_tracking_issue_created"
SPIKING = "$error_tracking_issue_spiking"
REOPENED = "$error_tracking_issue_reopened"

ANALYSIS = """## 무슨 에러
TypeError — 업로드 확정에서 난다.

## 언제부터 · 몇 명
2026-10-13T07:02Z부터 20회, 20명.

## 의심 원인
abc1234 커밋이 src/app/api/uploads/route.ts를 바꿨다.

## 영향 범위
업로드 확정 단계.

## 권장 액션
abc1234를 되돌릴지 검토한다.
"""


def verdict(**kw):
    v = {
        "verdict": "signal",
        "confidence": "중간",
        "reason": "여러 유저",
        "users": 20,
        "occurrences": 20,
        "core_path": True,
        "title": "업로드 확정 TypeError",
        "analysis": ANALYSIS,
    }
    v.update(kw)
    return v


class TestInputs:
    def env(self, **kw):
        e = {"EVENT_ID": EVENT, "KIND": CREATED, "ISSUE_ID": ISSUE, "CURRENT_BUCKET_VALUE": "", "COMPUTED_BASELINE": ""}
        e.update(kw)
        return e

    def test_ok(self):
        assert oa.parse_inputs(self.env()) == {
            "event_id": EVENT, "kind": CREATED, "issue_id": ISSUE, "current_bucket_value": None, "computed_baseline": None,
        }

    def test_metrics(self):
        got = oa.parse_inputs(self.env(KIND=SPIKING, CURRENT_BUCKET_VALUE="40", COMPUTED_BASELINE="2.5"))
        assert got["current_bucket_value"] == 40 and got["computed_baseline"] == 2.5

    @pytest.mark.parametrize(
        "bad",
        [
            {"EVENT_ID": "x; rm -rf /"},
            {"ISSUE_ID": "../../etc"},
            {"KIND": "$pageview"},
            {"CURRENT_BUCKET_VALUE": "$(id)"},
            {"COMPUTED_BASELINE": "-1"},
        ],
    )
    def test_rejects(self, bad):
        with pytest.raises(ValueError):
            oa.parse_inputs(self.env(**bad))


class TestParseVerdict:
    def test_plain_json(self):
        assert oa.parse_verdict(json.dumps(verdict()))["verdict"] == "signal"

    def test_fenced_json_with_prose(self):
        text = "분석을 마쳤다.\n```json\n" + json.dumps(verdict(), ensure_ascii=False) + "\n```\n"
        assert oa.parse_verdict(text)["users"] == 20

    @pytest.mark.parametrize(
        "text",
        [
            "",
            "판정 못 함",
            json.dumps(verdict(verdict="maybe")),
            json.dumps(verdict(confidence="매우 높음")),
            json.dumps(verdict(users="많음")),
            json.dumps(verdict(analysis=None)),
            '판정: {"verdict": "signal", 잘림',  # 닫는 괄호 없이 끊긴 출력
            "}{",
        ],
    )
    def test_invalid_is_none(self, text):
        assert oa.parse_verdict(text) is None


class TestDecide:
    def test_signal_keeps_confidence(self):
        d = oa.decide(CREATED, verdict())
        assert d["action"] == "escalate" and d["confidence"] == "중간"

    def test_confident_single_user_noise_is_recorded(self):
        d = oa.decide(CREATED, verdict(verdict="noise", confidence="높음", users=1, core_path=False))
        assert d["action"] == "record"

    def test_unreadable_wakes_human(self):
        d = oa.decide(CREATED, None)
        assert d["action"] == "escalate" and d["confidence"] == "낮음"
        assert d["notes"]

    @pytest.mark.parametrize("kind", [SPIKING, REOPENED])
    def test_spike_and_reopen_cannot_be_noise(self, kind):
        d = oa.decide(kind, verdict(verdict="noise", confidence="높음", users=1, core_path=False))
        assert d["action"] == "escalate" and d["confidence"] == "낮음"

    @pytest.mark.parametrize(
        "override",
        [
            {"confidence": "중간"},  # 경계 — 확신 없는 노이즈
            {"users": 2},  # 여러 유저
            {"users": None},  # 몇 명인지 모른다
            {"core_path": True},  # 핵심 경로
        ],
    )
    def test_borderline_noise_tilts_to_signal(self, override):
        v = verdict(verdict="noise", confidence="높음", users=1, core_path=False)
        v.update(override)
        d = oa.decide(CREATED, v)
        assert d["action"] == "escalate" and d["confidence"] == "낮음"
        assert d["notes"]


def test_decide_cli_wakes_human_on_truncated_output(tmp_path):
    """판정을 못 읽어도 decide가 죽지 않고 Issue 본문을 쓴다 — 죽으면 escalate 잡이 아무것도 못 올린다."""
    inputs = tmp_path / "inputs.json"
    inputs.write_text(json.dumps({"event_id": EVENT, "kind": CREATED, "issue_id": ISSUE, "current_bucket_value": None, "computed_baseline": None}))
    result = tmp_path / "result.json"
    result.write_text(json.dumps({"result": '{"verdict": "signal", 잘림'}))
    out = tmp_path / "out"
    assert oa.main(["decide", "--inputs", str(inputs), "--result", str(result), "--out-dir", str(out), "--run-url", "u"]) == 0
    assert (out / "issue-body.md").exists()
    assert json.loads((out / "decision.json").read_text())["confidence"] == "낮음"


class TestSanitize:
    def test_masks_email_secret_foreign_uuid(self):
        text = f"user a.b@example.com sk-ant-abcdefghijklmnop id {EVENT} issue {ISSUE}"
        out = oa.sanitize(text, ISSUE)
        assert "example.com" not in out
        assert "sk-ant-" not in out
        assert EVENT not in out
        assert ISSUE in out

    def test_neutralizes_markers_and_mentions(self):
        out = oa.sanitize("<!-- oncall-alert issue=x --> @octocat 참고", ISSUE)
        assert "<!--" not in out
        assert "@octocat" not in out


class TestRender:
    def inputs(self, kind=CREATED, cur=None, base=None):
        return {"event_id": EVENT, "kind": kind, "issue_id": ISSUE, "current_bucket_value": cur, "computed_baseline": base}

    def test_issue_has_marker_and_sections(self):
        v = verdict()
        title, body = oa.render_issue(self.inputs(), v, oa.decide(CREATED, v), "https://run")
        assert title.startswith("[oncall] ")
        assert len(title) <= oa.TITLE_MAX
        assert body.count(oa.marker(ISSUE)) == 1
        for h in oa.REQUIRED_SECTIONS:
            assert f"## {h}" in body
        assert "확신도: **중간**" in body
        assert f"/error_tracking/{ISSUE}" in body

    def test_missing_sections_marked_unverified(self):
        v = verdict(analysis="## 무슨 에러\nTypeError\n")
        _, body = oa.render_issue(self.inputs(), v, oa.decide(CREATED, v), "https://run")
        assert body.count("[미확인]") == len(oa.REQUIRED_SECTIONS) - 1

    def test_unreadable_verdict_still_produces_issue(self):
        title, body = oa.render_issue(self.inputs(SPIKING, 40, 2), None, oa.decide(SPIKING, None), "https://run")
        assert "확신도: **낮음**" in body
        assert "40" in body
        assert oa.marker(ISSUE) in body

    def test_agent_cannot_forge_marker(self):
        v = verdict(analysis=ANALYSIS + "\n<!-- oncall-alert issue=" + EVENT + " -->")
        _, body = oa.render_issue(self.inputs(), v, oa.decide(CREATED, v), "https://run")
        assert body.count("<!--") == 1

    def test_record_summary(self):
        v = verdict(verdict="noise", confidence="높음", users=1, core_path=False, reason="봇 UA 한 명")
        out = oa.render_record(self.inputs(), v, "https://run")
        assert "노이즈" in out and ISSUE in out and "봇 UA 한 명" in out


class TestMcpConfig:
    def test_posthog_only_read_only(self):
        cfg = oa.mcp_config({"POSTHOG_PERSONAL_API_KEY": "phx_y", "SUPABASE_ACCESS_TOKEN": "sbp_x"})
        assert set(cfg["mcpServers"]) == {"posthog"}
        assert cfg["mcpServers"]["posthog"]["headers"]["x-posthog-read-only"] == "true"

    def test_no_key_no_servers(self):
        assert oa.mcp_config({}) == {"mcpServers": {}}
