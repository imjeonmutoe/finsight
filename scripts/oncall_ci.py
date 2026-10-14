#!/usr/bin/env python3
"""oncall CI 자동 수정(`.github/workflows/oncall-ci-fix.yml`)의 결정론적 관문.

    redact    실패 로그에서 비밀값을 가리고 꼬리만 남긴다. 에이전트는 이 출력만 읽는다.
              PR 본문도 올리기 전에 한 번 더 통과시킨다.
    validate  에이전트가 만든 패치를 쓰기 권한을 쥔 잡으로 넘기기 전에 검사한다.

GitHub은 등록된 시크릿을 로그에서 `***`로 가린다. 하지만 등록되지 않은 값(테스트가 찍은
토큰, 에러에 섞인 접속 문자열)은 그대로 남는다 — 그것을 여기서 가린다.

validate가 막는 것은 '고친 척'이다. CI를 빨리 초록으로 만드는 가장 쉬운 길은 고치는 것이
아니라 검사를 끄는 것이고, LLM은 그 길을 고른다. 그래서
  - CI·하네스·검사 설정·의존성·DB 마이그레이션(머지 = 프로덕션 적용) 경로를 건드리지 못하고
  - 테스트 파일을 지우거나, skip/only/todo·eslint-disable·ts-ignore를 더하지 못한다.
이런 수정이 정말 필요하면 에이전트는 analysis_only로 사고 기록만 남기고 사람이 고친다.

사용법:
    gh run view <id> --log-failed | python3 scripts/oncall_ci.py redact --max-lines 1500 > failed.log
    python3 scripts/oncall_ci.py validate --patch fix.patch --result result.json

validate 종료 코드: 0 통과 / 1 위반·result 깨짐 / 2 인자 오류
"""

import argparse
import json
import re
import sys

STATUSES = ("fixed", "analysis_only")
INCIDENT_PREFIX = "docs/incidents/"
TITLE_MAX = 80

# 접두사가 맞으면 막는다. 디렉터리는 `/`로 끝낸다.
DENY_PREFIXES = (
    ".github/",  # CI 자체. 워크플로우를 고쳐 실패를 숨길 수 있다
    ".claude/",
    ".codex/",
    "scripts/",  # 훅·게이트·이 스크립트
    "supabase/",  # 머지가 곧 프로덕션 DB 적용이다 (ADR-016)
    "node_modules/",
)
DENY_FILES = (
    ".mcp.json",
    "CLAUDE.md",
    "AGENTS.md",
    "package.json",  # 버전은 ADR-010으로 고정. 스크립트를 바꿔 테스트를 끌 수도 있다
    "package-lock.json",
    "eslint.config.mjs",
    "tsconfig.json",
    "vitest.config.mts",
    "vitest.setup.ts",
    "next.config.ts",  # 보안 헤더·CSP가 여기 있다
    ".vercelignore",
)

TEST_FILE_RE = re.compile(r"(\.test\.[cm]?[jt]sx?$|(^|/)test[_-][^/]*\.(py|mjs|sh)$)")
# 더한 줄에 있으면 검사를 끄는 것이다.
DISABLE_RE = re.compile(
    r"\b(it|test|describe)\.(skip|only|todo)\b|\bxit\(|\bxdescribe\(|eslint-disable|@ts-(ignore|nocheck|expect-error)"
)

ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
MASK = "[REDACTED]"

# (패턴, 치환). 순서대로 적용한다 — 넓은 패턴(변수 대입)은 뒤에 둔다.
REDACTIONS = (
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----", re.S), MASK),
    (re.compile(r"sk-ant-[A-Za-z0-9_-]{10,}"), MASK),
    (re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}"), MASK),
    (re.compile(r"\bgithub_pat_[A-Za-z0-9_]{20,}"), MASK),
    (re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}"), MASK),  # JWT (Supabase 키)
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), MASK),
    (re.compile(r"\bpolar_[a-z]{2,4}_[A-Za-z0-9]{16,}"), MASK),
    (re.compile(r"\bphx_[A-Za-z0-9]{20,}"), MASK),  # PostHog 개인 키 (phc_는 공개 프로젝트 토큰)
    (re.compile(r"\b[sr]k_(live|test)_[A-Za-z0-9]{10,}"), MASK),
    (re.compile(r"(?i)\b(bearer)\s+[A-Za-z0-9._~+/-]{16,}=*"), rf"\1 {MASK}"),
    (re.compile(r"\b([a-z][a-z0-9+.-]*://)[^/\s:@]+:[^/\s@]+@"), rf"\1{MASK}@"),
    (
        re.compile(
            r"\b([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY|SERVICE_ROLE_KEY)[A-Z0-9_]*)"
            r"(\s*[=:]\s*)(['\"]?)(?!\*\*\*)[^\s'\"]{6,}\3"
        ),
        rf"\1\2{MASK}",
    ),
)


def redact(text):
    """비밀값을 가린다. (가린 텍스트, 가린 개수)."""
    text = ANSI_RE.sub("", text)
    total = 0
    for pattern, repl in REDACTIONS:
        text, n = pattern.subn(repl, text)
        total += n
    return text, total


def tail(text, max_lines):
    """마지막 max_lines줄만 남긴다. 실패 원인은 거의 항상 끝에 있다."""
    lines = text.splitlines()
    if len(lines) <= max_lines:
        return text
    return f"… (앞 {len(lines) - max_lines}줄 생략)\n" + "\n".join(lines[-max_lines:])


def changed_paths(patch):
    """패치가 건드리는 경로 전부. 이름 변경은 옛 경로와 새 경로를 둘 다 낸다."""
    paths = []
    for m in re.finditer(r"^diff --git a/(\S+) b/(\S+)$", patch, re.M):
        paths += [m.group(1), m.group(2)]
    return list(dict.fromkeys(paths))


def _blocked(path):
    name = path.rsplit("/", 1)[-1]
    return path.startswith(DENY_PREFIXES) or path in DENY_FILES or name.startswith(".env")


def validate(patch, status):
    """위반 목록. 비어 있으면 통과."""
    if status not in STATUSES:
        return [f"알 수 없는 status: {status!r}"]
    if not patch.strip():
        return ["패치가 비어 있다"]

    violations = []
    paths = changed_paths(patch)
    if not paths:
        violations.append("패치에서 바뀐 파일을 찾지 못했다")
    for p in paths:
        if _blocked(p):
            violations.append(f"막힌 경로: {p}")
        elif status == "analysis_only" and not p.startswith(INCIDENT_PREFIX):
            violations.append(f"analysis_only는 {INCIDENT_PREFIX} 밖을 건드릴 수 없다: {p}")

    for m in re.finditer(r"^diff --git a/(\S+) b/\S+\n(?:(?!diff --git).*\n)*?deleted file mode", patch, re.M):
        if TEST_FILE_RE.search(m.group(1)):
            violations.append(f"테스트 파일 삭제: {m.group(1)}")

    if "GIT binary patch" in patch or re.search(r"^Binary files ", patch, re.M):
        violations.append("바이너리 패치")
    if re.search(r"^(new|old) (file )?mode 120000", patch, re.M):
        violations.append("심볼릭 링크")

    current = ""
    for line in patch.splitlines():
        if line.startswith("diff --git "):
            current = line.rsplit(" b/", 1)[-1]
        if not line.startswith("+") or line.startswith("+++"):
            continue
        # 값을 위반 메시지에 되풀이하지 않는다. 메시지는 Actions 로그(공개)에 찍힌다.
        if redact(line)[1]:
            violations.append("비밀값처럼 보이는 줄 (값은 생략)")
        # 문서는 검사를 끌 수 없다. 사고 기록이 거절 사유로 `it.skip(...)`을 인용해도 된다.
        elif not current.endswith(".md") and DISABLE_RE.search(line):
            violations.append(f"검사를 끄는 줄: {line[1:].strip()[:80]}")
    return violations


def clean_title(raw):
    """비밀값을 가리고, 한 줄로 펴고, conventional commit 접두사를 맞추고, 길이를 자른다."""
    title = " ".join(redact(str(raw or ""))[0].split())
    if not re.match(r"^(fix|docs)(\([^)]*\))?: ", title):
        title = "fix: " + title
    return title[:TITLE_MAX].rstrip()


def _cmd_redact(args):
    text, _ = redact(sys.stdin.read())
    sys.stdout.write(tail(text, args.max_lines).rstrip("\n") + "\n")
    return 0


def _cmd_validate(args):
    with open(args.patch, encoding="utf-8") as f:
        patch = f.read()
    try:
        with open(args.result, encoding="utf-8") as f:
            result = json.load(f)
        status, title = result.get("status"), result.get("title")
    except (json.JSONDecodeError, AttributeError) as e:
        print(json.dumps({"ok": False, "violations": [f"result.json을 읽지 못했다: {e}"]}, ensure_ascii=False))
        return 1

    violations = validate(patch, status)
    if not title or not str(title).strip():
        violations.append("제목이 비어 있다")
    out = {"ok": not violations, "status": status, "title": clean_title(title), "violations": violations}
    print(json.dumps(out, ensure_ascii=False))
    return 0 if out["ok"] else 1


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("redact")
    r.add_argument("--max-lines", type=int, default=1500)
    v = sub.add_parser("validate")
    v.add_argument("--patch", required=True)
    v.add_argument("--result", required=True)
    args = parser.parse_args(argv)
    return _cmd_redact(args) if args.cmd == "redact" else _cmd_validate(args)


if __name__ == "__main__":
    sys.exit(main())
