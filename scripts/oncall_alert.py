#!/usr/bin/env python3
"""oncall prod alert 1차 방어선(`.github/workflows/oncall-alert.yml`)의 결정론적 관문.

두뇌는 `.claude/skills/oncall-alert/SKILL.md`다. 에이전트가 노이즈/신호를 판정하고 분석을 쓰면,
이 스크립트가 그 판정을 **그대로 믿지 않고** 규칙으로 다시 고른다. 틀리는 쪽은 언제나 사람을 깨우는 쪽이다.

    inputs      workflow_dispatch 입력을 검증한다. 셸에 들어가기 전에 모양을 확정한다.
    mcp-config  PostHog MCP(읽기 전용)만 담은 설정을 쓴다. DB는 붙이지 않는다.
    decide      에이전트 결과를 읽어 escalate/record를 고르고 Issue 본문 또는 기록을 쓴다.

판정 규칙(decide):
  - 결과를 못 읽으면 → 신호, 확신도 낮음
  - 급증·재발 alert는 노이즈가 될 수 없다
  - 노이즈는 '확신도 높음 + 한 명으로 확인 + 핵심 경로 아님'일 때만. 나머지 경계는 신호로 기울이고 확신도 낮음

이 리포는 공개라 Issue도 공개다. 본문은 비밀값·이메일·이슈 밖 UUID·HTML 주석·멘션을 가린다.

종료 코드: 0 / 1 입력·파일 오류 / 2 인자 오류
"""

import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from oncall_ask import build_mcp_config  # noqa: E402
from oncall_ci import redact  # noqa: E402

KINDS = {
    "$error_tracking_issue_created": "새 에러",
    "$error_tracking_issue_reopened": "재발",
    "$error_tracking_issue_spiking": "급증",
}
ALWAYS_SIGNAL = ("$error_tracking_issue_reopened", "$error_tracking_issue_spiking")
CONFIDENCES = ("높음", "중간", "낮음")
REQUIRED_SECTIONS = ("무슨 에러", "언제부터 · 몇 명", "의심 원인", "영향 범위", "권장 액션")
POSTHOG_PROJECT_URL = "https://us.posthog.com/project/661822"
TITLE_MAX = 80

UUID_RE = re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", re.I)
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(\.[\w-]+)+")
MENTION_RE = re.compile(r"(?<![\w`])@(?=[A-Za-z0-9])")
METRIC_RE = re.compile(r"^\d+(\.\d+)?$")


def marker(issue_id):
    """dedup 키. 같은 PostHog 이슈는 열린 GitHub Issue 하나에 모인다."""
    return f"<!-- oncall-alert issue={issue_id} -->"


def parse_inputs(env):
    """workflow_dispatch 입력. 모양이 틀리면 ValueError — 이 값들은 셸·gh 검색어에 들어간다."""
    out = {}
    for key in ("EVENT_ID", "ISSUE_ID"):
        value = env.get(key, "")
        if not UUID_RE.fullmatch(value):
            raise ValueError(f"{key}가 UUID가 아니다")
        out[key.lower()] = value.lower()
    kind = env.get("KIND", "")
    if kind not in KINDS:
        raise ValueError("알 수 없는 alert 종류")
    out["kind"] = kind
    for key in ("CURRENT_BUCKET_VALUE", "COMPUTED_BASELINE"):
        value = env.get(key, "")
        if value == "":
            out[key.lower()] = None
        elif METRIC_RE.fullmatch(value):
            n = float(value)
            out[key.lower()] = int(n) if n.is_integer() else n
        else:
            raise ValueError(f"{key}가 0 이상의 숫자가 아니다")
    return {k: out[k] for k in ("event_id", "kind", "issue_id", "current_bucket_value", "computed_baseline")}


def _json_candidates(text):
    yield text
    for m in re.finditer(r"```(?:json)?\s*\n(.*?)\n```", text, re.S):
        yield m.group(1)
    # 출력이 중간에 끊기면 `}`가 없다. 여기서 예외가 나면 '못 읽으면 사람을 깨운다'는 폴백이 같이 죽는다.
    start, end = text.find("{"), text.rfind("}")
    if 0 <= start < end:
        yield text[start : end + 1]


def parse_verdict(text):
    """에이전트의 최종 JSON. 모양이 하나라도 틀리면 None — 판정을 지어내 채우지 않는다."""
    for candidate in _json_candidates(text or ""):
        try:
            v = json.loads(candidate)
        except ValueError:
            continue
        if not isinstance(v, dict):
            continue
        ok = (
            v.get("verdict") in ("noise", "signal")
            and v.get("confidence") in CONFIDENCES
            and isinstance(v.get("reason"), str)
            and isinstance(v.get("title"), str)
            and isinstance(v.get("analysis"), str)
            and isinstance(v.get("core_path"), bool)
            and all(v.get(k) is None or (isinstance(v.get(k), int) and not isinstance(v.get(k), bool)) for k in ("users", "occurrences"))
        )
        return v if ok else None
    return None


def decide(kind, v):
    """{"action": "escalate"|"record", "confidence", "notes"}."""
    if v is None:
        return {"action": "escalate", "confidence": "낮음", "notes": ["에이전트 판정을 읽지 못했다 — 분석 없이 사람을 깨운다"]}
    if v["verdict"] == "signal":
        return {"action": "escalate", "confidence": v["confidence"], "notes": []}

    notes = []
    if kind in ALWAYS_SIGNAL:
        notes.append(f"{KINDS[kind]} alert는 노이즈로 닫지 않는다")
    if v["confidence"] != "높음":
        notes.append(f"노이즈 판정의 확신도가 {v['confidence']}이다")
    if v.get("users") is None:
        notes.append("영향 유저 수를 확인하지 못했다")
    elif v["users"] >= 2:
        notes.append(f"영향 유저가 {v['users']}명이다")
    if v["core_path"]:
        notes.append("핵심 경로의 에러다")
    if notes:
        return {"action": "escalate", "confidence": "낮음", "notes": ["에이전트는 노이즈로 봤지만 경계라 신호로 올린다: " + "; ".join(notes)]}
    return {"action": "record", "confidence": v["confidence"], "notes": []}


def sanitize(text, issue_id):
    """공개 Issue에 올리기 전에 가린다."""
    text = redact(text)[0]
    text = EMAIL_RE.sub("[이메일 가림]", text)
    text = UUID_RE.sub(lambda m: m.group(0) if m.group(0).lower() == issue_id else "[ID 가림]", text)
    text = text.replace("<!--", "&lt;!--")
    return MENTION_RE.sub("@​", text)


def _sections(markdown):
    out, current = {}, None
    for line in markdown.splitlines():
        m = re.match(r"^##\s+(.+?)\s*$", line)
        if m:
            current = m.group(1)
            out[current] = []
        elif current is not None:
            out[current].append(line)
    return {k: "\n".join(v).strip() for k, v in out.items()}


def _metrics(inputs):
    cur, base = inputs["current_bucket_value"], inputs["computed_baseline"]
    if cur is None:
        return "—"
    return f"최근 5분 {cur}건 (기준선 {base if base is not None else '?'})"


def render_issue(inputs, v, decision, run_url):
    """(제목, 본문)."""
    issue_id, kind = inputs["issue_id"], inputs["kind"]
    raw_title = v["title"] if v else "분석 없음"
    title = " ".join(sanitize(f"[oncall] {KINDS[kind]} — {raw_title}", issue_id).split())[:TITLE_MAX].rstrip()
    sections = _sections(v["analysis"]) if v else {}

    lines = [
        marker(issue_id),
        "> 🚨 **oncall prod alert** — PostHog error tracking alert를 에이전트가 분석했다. **사람이 확인한다.**",
        "> 에이전트는 prod를 읽기만 했다(PostHog 읽기 전용, DB 미연결). 고치거나 되돌린 것은 없다.",
        "",
        f"- 판정: **신호** · 확신도: **{decision['confidence']}**",
        f"- alert: {KINDS[kind]} (`{kind}`) · {_metrics(inputs)}",
        f"- PostHog 이슈: {POSTHOG_PROJECT_URL}/error_tracking/{issue_id}",
        f"- 분석 실행: {run_url}",
    ]
    if v:
        lines.append(f"- 판정 이유: {sanitize(v['reason'], issue_id)}")
    for note in decision["notes"]:
        lines.append(f"- ⚠️ {note}")
    for heading in REQUIRED_SECTIONS:
        body = sections.get(heading) or "[미확인] 분석이 이 섹션을 남기지 않았다 — PostHog 이슈에서 직접 확인한다."
        lines += ["", f"## {heading}", "", sanitize(body, issue_id)]
    lines += [
        "",
        "---",
        "예외 메시지·스택·유저 식별자는 공개 리포라 싣지 않았다. PostHog 링크에서 본다.",
        "같은 PostHog 이슈의 다음 alert는 이 Issue에 코멘트로 붙는다.",
    ]
    return title, "\n".join(lines) + "\n"


def render_record(inputs, v, run_url):
    """노이즈 기록(Actions 잡 요약 — 공개). Issue를 만들지 않는다."""
    issue_id = inputs["issue_id"]
    return "\n".join(
        [
            "### oncall alert — 노이즈로 기록하고 종료",
            "",
            f"- alert: {KINDS[inputs['kind']]} · PostHog 이슈 `{issue_id}` · {_metrics(inputs)}",
            f"- 확신도: {v['confidence']} · 유저 {v['users']}명 · 발생 {v['occurrences'] if v['occurrences'] is not None else '?'}회",
            f"- 이유: {sanitize(v['reason'], issue_id)}",
            f"- 실행: {run_url}",
        ]
    ) + "\n"


def mcp_config(env):
    """PostHog만. Supabase 토큰이 환경에 있어도 붙이지 않는다 — 이 잡은 prod DB를 읽지 않는다."""
    cfg, _ = build_mcp_config({k: env[k] for k in ("POSTHOG_PERSONAL_API_KEY",) if env.get(k)})
    return cfg


def _cmd_inputs(_args):
    try:
        inputs = parse_inputs(os.environ)
    except ValueError as e:
        print(f"입력 거절: {e}", file=sys.stderr)
        return 1
    print(json.dumps(inputs))
    return 0


def _cmd_mcp_config(args):
    fd = os.open(args.out, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(mcp_config(os.environ), f)
    return 0


def _cmd_decide(args):
    with open(args.inputs, encoding="utf-8") as f:
        inputs = json.load(f)
    text = ""
    try:
        with open(args.result, encoding="utf-8") as f:
            text = json.load(f).get("result") or ""
    except (OSError, ValueError, AttributeError):
        pass
    v = parse_verdict(text)
    decision = decide(inputs["kind"], v)
    os.makedirs(args.out_dir, exist_ok=True)
    if decision["action"] == "record":
        with open(os.path.join(args.out_dir, "record.md"), "w", encoding="utf-8") as f:
            f.write(render_record(inputs, v, args.run_url))
    else:
        title, body = render_issue(inputs, v, decision, args.run_url)
        with open(os.path.join(args.out_dir, "issue-title.txt"), "w", encoding="utf-8") as f:
            f.write(title + "\n")
        with open(os.path.join(args.out_dir, "issue-body.md"), "w", encoding="utf-8") as f:
            f.write(body)
    with open(os.path.join(args.out_dir, "decision.json"), "w", encoding="utf-8") as f:
        json.dump(decision, f, ensure_ascii=False)
    print(json.dumps(decision, ensure_ascii=False))
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("inputs")
    m = sub.add_parser("mcp-config")
    m.add_argument("--out", required=True)
    d = sub.add_parser("decide")
    d.add_argument("--inputs", required=True)
    d.add_argument("--result", required=True)
    d.add_argument("--out-dir", required=True)
    d.add_argument("--run-url", required=True)
    args = parser.parse_args(argv)
    return {"inputs": _cmd_inputs, "mcp-config": _cmd_mcp_config, "decide": _cmd_decide}[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
