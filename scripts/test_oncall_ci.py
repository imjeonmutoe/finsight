"""
oncall_ci.py 테스트.

핵심 계약 두 가지.
1. 실패 로그 속 비밀값은 에이전트에게도, PR 본문에도 넘어가지 않는다.
2. 에이전트의 패치는 '고친 척'(테스트 끄기·린트 끄기·CI/설정 고치기)을 할 수 없다.
   막힌 경로를 건드리거나 검사를 끄는 패치는 PR이 되지 않는다.

이 스크립트는 LLM이 만든 패치를 쓰기 권한을 쥔 잡으로 넘기기 직전의 마지막 관문이다.
틀리는 쪽은 항상 '거절'이어야 한다.
"""

import json
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
import oncall_ci as oc

SCRIPT = Path(__file__).parent / "oncall_ci.py"


def patch_for(path, added=("x",), deleted=False, new=False, rename_from=None):
    """git diff 형식의 최소 패치."""
    old = rename_from or path
    head = [f"diff --git a/{old} b/{path}"]
    if rename_from:
        head += ["similarity index 90%", f"rename from {rename_from}", f"rename to {path}"]
    if deleted:
        head += ["deleted file mode 100644", "index 1111111..0000000", f"--- a/{old}", "+++ /dev/null"]
        return "\n".join(head + ["@@ -1 +0,0 @@", "-x"]) + "\n"
    if new:
        head += ["new file mode 100644", "index 0000000..1111111", "--- /dev/null", f"+++ b/{path}"]
    else:
        head += ["index 1111111..2222222 100644", f"--- a/{old}", f"+++ b/{path}"]
    body = [f"@@ -1 +1,{len(added)} @@"] + [f"+{line}" for line in added]
    return "\n".join(head + body) + "\n"


# ---------------------------------------------------------------------------
# redact
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "secret",
    [
        "sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789",
        "ghp_" + "a" * 36,
        "ghs_" + "B" * 36,
        "github_pat_" + "c" * 40,
        "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abcdefghijklmnop",
        "AKIAABCDEFGHIJKLMNOP",
        "polar_oat_" + "d" * 30,
        "phx_" + "e" * 40,
        "sk_live_" + "f" * 24,
    ],
)
def test_알려진_토큰_형식을_가린다(secret):
    out, n = oc.redact(f"Error: request failed with {secret} at line 3")
    assert secret not in out
    assert n >= 1
    assert "at line 3" in out


def test_URL_안의_자격증명을_가린다():
    out, _ = oc.redact("connect postgres://admin:hunter2pass@db.example.com:5432/app failed")
    assert "hunter2pass" not in out
    assert "admin" not in out
    assert "db.example.com:5432/app" in out


def test_비밀_이름의_환경변수_대입을_가린다():
    log = "SUPABASE_SERVICE_ROLE_KEY=abc123def456ghi\nPOLAR_WEBHOOK_SECRET: 'whsec_zzzzzzzzzz'\nNODE_ENV=production"
    out, n = oc.redact(log)
    assert "abc123def456ghi" not in out
    assert "whsec_zzzzzzzzzz" not in out
    assert "NODE_ENV=production" in out  # 비밀이 아닌 변수는 그대로
    assert n == 2


def test_Bearer_토큰과_개인키_블록을_가린다():
    log = (
        "Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345\n"
        "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0B\n-----END PRIVATE KEY-----\n"
    )
    out, _ = oc.redact(log)
    assert "abcdefghijklmnopqrstuvwxyz012345" not in out
    assert "MIIEvQIBADANBgkqhkiG9w0B" not in out


def test_GitHub이_이미_가린_값과_평범한_로그는_건드리지_않는다():
    log = "TOKEN=***\nFAIL src/lib/money.test.ts > 합계 > 환불을 뺀다\nexpected 1000 to be 900"
    out, n = oc.redact(log)
    assert out == log
    assert n == 0


def test_ANSI_색_코드를_벗긴다():
    out, _ = oc.redact("\x1b[31mFAIL\x1b[39m src/a.test.ts")
    assert out == "FAIL src/a.test.ts"


def test_tail은_마지막_줄만_남기고_자른_사실을_적는다():
    text = "\n".join(f"line {i}" for i in range(10))
    out = oc.tail(text, 3)
    assert out.endswith("line 7\nline 8\nline 9")
    assert "앞 7줄 생략" in out
    assert oc.tail("a\nb", 3) == "a\nb"


# ---------------------------------------------------------------------------
# changed_paths
# ---------------------------------------------------------------------------


def test_이름_변경은_옛_경로와_새_경로를_둘_다_센다():
    p = patch_for("src/lib/b.ts", rename_from="supabase/a.ts")
    assert set(oc.changed_paths(p)) == {"supabase/a.ts", "src/lib/b.ts"}


# ---------------------------------------------------------------------------
# validate — fixed
# ---------------------------------------------------------------------------


def test_소스_수정은_통과한다():
    p = patch_for("src/lib/money.ts", added=["export const x = 1;"])
    assert oc.validate(p, "fixed") == []


def test_빈_패치는_거절한다():
    assert oc.validate("", "fixed")
    assert oc.validate("   \n", "analysis_only")


def test_모르는_status는_거절한다():
    p = patch_for("src/lib/money.ts")
    assert oc.validate(p, "merged")


@pytest.mark.parametrize(
    "path",
    [
        ".github/workflows/ci.yml",
        ".claude/settings.json",
        ".codex/hooks.json",
        "scripts/oncall_ci.py",
        "supabase/migrations/20261014000000_x.sql",
        "supabase/config.toml",
        ".mcp.json",
        "CLAUDE.md",
        "AGENTS.md",
        "package.json",
        "package-lock.json",
        ".env",
        ".env.local",
        "src/.env.production",
        "eslint.config.mjs",
        "tsconfig.json",
        "vitest.config.mts",
        "vitest.setup.ts",
        "next.config.ts",
        ".vercelignore",
        "node_modules/next/index.js",
    ],
)
def test_막힌_경로를_건드리면_거절한다(path):
    violations = oc.validate(patch_for(path), "fixed")
    assert violations
    assert path in violations[0]


@pytest.mark.parametrize(
    "header",
    [
        "diff --git a/supabase/x y.sql b/supabase/x y.sql",  # git은 공백을 따옴표로 감싸지 않는다
        'diff --git "a/supabase/\\303\\251.sql" "b/supabase/\\303\\251.sql"',  # 비ASCII·따옴표는 감싼다
        "diff --git a/src/a.ts b/supabase/b c.sql",
    ],
)
def test_해석할_수_없는_diff_헤더는_거절한다(header):
    # 정상 파일과 섞어야 '바뀐 파일 없음'에 걸리지 않고 우회가 드러난다.
    patch = patch_for("src/lib/ok.ts") + f"{header}\nnew file mode 100644\n--- /dev/null\n+++ b/x\n@@ -0,0 +1 @@\n+x\n"
    assert oc.validate(patch, "fixed")


@pytest.mark.parametrize("name", ["supabase/migrations/1 x.sql", "supabase/migrations/é.sql", ".github/workflows/a b.yml"])
def test_실제_git_diff로_만든_특수_경로_패치도_거절한다(tmp_path, name):
    def git(*args):
        subprocess.run(["git", "-C", str(tmp_path), *args], check=True, capture_output=True)

    git("init", "-q")
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "ok.ts").write_text("export {};\n")
    target = tmp_path / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("select 1;\n")
    git("add", "-A")
    patch = subprocess.run(
        ["git", "-C", str(tmp_path), "diff", "--cached", "--binary"], check=True, capture_output=True, text=True
    ).stdout
    assert oc.validate(patch, "fixed")


def test_막힌_경로_밖으로_옮기는_이름_변경도_거절한다():
    p = patch_for("src/lib/x.sql", rename_from="supabase/migrations/1_x.sql")
    assert oc.validate(p, "fixed")


@pytest.mark.parametrize(
    "path", ["src/lib/money.test.ts", "src/components/Card.test.tsx", "scripts/test-x.mjs", "evals/test_x.py"]
)
def test_테스트_파일_삭제는_거절한다(path):
    assert oc.validate(patch_for(path, deleted=True), "fixed")


@pytest.mark.parametrize(
    "line",
    [
        "it.skip('합계', () => {})",
        "describe.only('x', () => {})",
        "test.todo('나중에')",
        "// eslint-disable-next-line",
        "/* eslint-disable */",
        "// @ts-ignore",
        "// @ts-nocheck",
        "// @ts-expect-error",
    ],
)
def test_검사를_끄는_줄을_더하면_거절한다(line):
    assert oc.validate(patch_for("src/lib/money.ts", added=[line]), "fixed")


def test_검사를_끄는_줄을_지우는_것은_괜찮다():
    p = (
        "diff --git a/src/lib/a.ts b/src/lib/a.ts\n"
        "index 1..2 100644\n--- a/src/lib/a.ts\n+++ b/src/lib/a.ts\n"
        "@@ -1,2 +1 @@\n-// @ts-ignore\n const a = 1;\n"
    )
    assert oc.validate(p, "fixed") == []


def test_비밀값처럼_보이는_줄을_더하면_거절하고_값은_되풀이하지_않는다():
    secret = "ghp_" + "a" * 36
    violations = oc.validate(patch_for("src/lib/money.ts", added=[f"const t = '{secret}';"]), "fixed")
    assert violations
    assert all(secret not in v for v in violations)


def test_바이너리와_심볼릭_링크는_거절한다():
    binary = patch_for("src/lib/a.ts").replace("@@ -1 +1,1 @@\n+x", "GIT binary patch\nliteral 3\nabc")
    assert oc.validate(binary, "fixed")
    link = "diff --git a/src/x b/src/x\nnew file mode 120000\n--- /dev/null\n+++ b/src/x\n@@ -0,0 +1 @@\n+/etc/passwd\n"
    assert oc.validate(link, "fixed")


# ---------------------------------------------------------------------------
# validate — analysis_only
# ---------------------------------------------------------------------------


def test_사고_기록은_거절_사유로_검사_끄기_줄을_인용해도_통과한다():
    # 관문이 거절한 패치를 사고 기록으로 바꿀 때, 거절 사유("검사를 끄는 줄: it.skip(...)")가 문서에 들어간다.
    doc = patch_for("docs/incidents/2026-10-14-ci-1.md", added=["- 검사를 끄는 줄: it.skip('a')"], new=True)
    assert oc.validate(doc, "analysis_only") == []


def test_사고_기록이라도_비밀값은_거절한다():
    doc = patch_for("docs/incidents/2026-10-14-ci-1.md", added=["ghp_" + "a" * 36], new=True)
    assert oc.validate(doc, "analysis_only")


def test_CLI_redact는_끝에_빈_줄을_더하지_않는다():
    assert run("redact", stdin="a\n").stdout == "a\n"


def test_분석만이면_사고_기록_파일_하나만_허용한다():
    ok = patch_for("docs/incidents/2026-10-14-ci-123.md", new=True)
    assert oc.validate(ok, "analysis_only") == []
    both = ok + patch_for("src/lib/money.ts")
    assert oc.validate(both, "analysis_only")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def run(*args, stdin=None):
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args], input=stdin, capture_output=True, text=True, check=False
    )


def test_CLI_redact는_stdin을_가려서_내보낸다():
    r = run("redact", "--max-lines", "100", stdin="key ghp_" + "a" * 36 + "\n")
    assert r.returncode == 0
    assert "ghp_" not in r.stdout


def test_CLI_validate는_통과하면_0_정리된_제목을_낸다(tmp_path):
    (tmp_path / "fix.patch").write_text(patch_for("src/lib/money.ts"))
    (tmp_path / "result.json").write_text(json.dumps({"status": "fixed", "title": "  fix: 합계\n오류  "}))
    r = run("validate", "--patch", str(tmp_path / "fix.patch"), "--result", str(tmp_path / "result.json"))
    assert r.returncode == 0, r.stdout
    out = json.loads(r.stdout)
    assert out == {"ok": True, "status": "fixed", "title": "fix: 합계 오류", "violations": []}


def test_CLI_validate는_제목에_fix_접두사가_없으면_붙인다(tmp_path):
    (tmp_path / "fix.patch").write_text(patch_for("src/lib/money.ts"))
    (tmp_path / "result.json").write_text(json.dumps({"status": "fixed", "title": "x" * 200}))
    r = run("validate", "--patch", str(tmp_path / "fix.patch"), "--result", str(tmp_path / "result.json"))
    title = json.loads(r.stdout)["title"]
    assert title.startswith("fix: ")
    assert len(title) <= 80


def test_제목의_비밀값도_가린다():
    assert "ghp_" not in oc.clean_title("fix: ghp_" + "a" * 36 + " 노출")


def test_CLI_validate는_위반이면_1(tmp_path):
    (tmp_path / "fix.patch").write_text(patch_for(".github/workflows/ci.yml"))
    (tmp_path / "result.json").write_text(json.dumps({"status": "fixed", "title": "fix: x"}))
    r = run("validate", "--patch", str(tmp_path / "fix.patch"), "--result", str(tmp_path / "result.json"))
    assert r.returncode == 1
    assert json.loads(r.stdout)["ok"] is False


def test_CLI_validate는_result가_깨졌으면_1(tmp_path):
    (tmp_path / "fix.patch").write_text(patch_for("src/lib/money.ts"))
    (tmp_path / "result.json").write_text("not json")
    r = run("validate", "--patch", str(tmp_path / "fix.patch"), "--result", str(tmp_path / "result.json"))
    assert r.returncode == 1
