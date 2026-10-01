"""scan.py 회귀 테스트.

실행: uv run --with pytest python -m pytest .claude/skills/owasp-scan/scripts -q
"""

import json
import subprocess
from pathlib import Path

import pytest

import scan


def make_repo(tmp_path: Path, files: dict[str, str]) -> Path:
    for rel, body in files.items():
        p = tmp_path / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(body, encoding="utf-8")
    subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
    subprocess.run(["git", "add", "-A"], cwd=tmp_path, check=True)
    return tmp_path


def checks(result: dict) -> list[str]:
    return [f["check"] for f in result["findings"]]


BASE = {
    "package.json": json.dumps({"dependencies": {"next": "16.3.4"}}),
    "package-lock.json": "{}",
    "next.config.ts": "export default { async headers() { return [{ key: 'Content-Security-Policy' }] } }",
    "src/app/page.tsx": "export default function P() { return null }",
}


def run(tmp_path: Path, extra: dict[str, str]) -> dict:
    root = make_repo(tmp_path, {**BASE, **extra})
    return scan.scan(root, npm_audit=False)


def test_clean_repo_has_no_findings(tmp_path):
    assert run(tmp_path, {})["findings"] == []


def test_next_public_secret_is_critical(tmp_path):
    r = run(tmp_path, {"src/lib/x.ts": "const k = process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY;"})
    [f] = r["findings"]
    assert (f["check"], f["category"], f["severity"], f["critical_rule"]) == (
        "next-public-secret", "A02", "critical", True)
    assert (f["file"], f["line"]) == ("src/lib/x.ts", 1)


def test_comment_lines_and_tests_are_ignored(tmp_path):
    r = run(tmp_path, {
        "src/lib/x.ts": "// dangerouslySetInnerHTML을 쓰지 않는다\n",
        "src/lib/x.test.ts": "render(<div dangerouslySetInnerHTML={{__html: a}} />)",
    })
    assert r["findings"] == []


def test_dangerous_html(tmp_path):
    r = run(tmp_path, {"src/components/A.tsx": "\n<div dangerouslySetInnerHTML={{ __html: t }} />"})
    [f] = r["findings"]
    assert (f["check"], f["category"], f["line"]) == ("dangerous-html", "A05", 2)


def test_supabase_filter_interpolation(tmp_path):
    r = run(tmp_path, {"src/lib/q.ts": "db.from('t').select().or(`name.eq.${input}`)"})
    assert checks(r) == ["postgrest-filter-interp"]


def test_financial_logging_needs_both_console_and_data_word(tmp_path):
    r = run(tmp_path, {"src/lib/l.ts": (
        "console.error('parse failed', rowNumber);\n"
        "console.log('row', row.merchant, row.amount);\n"
    )})
    [f] = r["findings"]
    assert (f["check"], f["line"], f["severity"]) == ("log-financial", 2, "major")


def test_hardcoded_secret_is_redacted(tmp_path):
    key = "sk-ant-api03-" + "A" * 40
    r = run(tmp_path, {"docs/notes.md": f"키: {key}\n"})
    [f] = r["findings"]
    assert f["check"] == "hardcoded-secret"
    assert key not in json.dumps(r)
    assert "가림" in f["evidence"]


def test_tracked_env_file(tmp_path):
    r = run(tmp_path, {".env.local": "X=1\n", ".env.example": "X=\n"})
    [f] = r["findings"]
    assert (f["check"], f["file"]) == ("env-tracked", ".env.local")
    assert "X=1" not in json.dumps(r)


def test_table_without_rls(tmp_path):
    r = run(tmp_path, {"supabase/migrations/0001.sql": (
        "create table public.a (id int);\n"
        "create table if not exists public.b (id int);\n"
        "alter table public.a enable row level security;\n"
    )})
    [f] = r["findings"]
    assert (f["check"], f["line"], f["critical_rule"]) == ("rls-missing", 2, True)


def test_profiles_write_grant(tmp_path):
    r = run(tmp_path, {"supabase/migrations/0001.sql": (
        "create table public.profiles (id int);\n"
        "alter table public.profiles enable row level security;\n"
        "grant select, update on public.profiles to authenticated;\n"
    )})
    assert checks(r) == ["profiles-write-grant"]


def test_public_bucket(tmp_path):
    r = run(tmp_path, {"supabase/migrations/0001.sql": (
        "insert into storage.buckets (id, name, public)\nvalues ('s', 's', true);\n"
    )})
    [f] = r["findings"]
    assert (f["check"], f["line"]) == ("public-bucket", 1)


def test_route_without_user_id(tmp_path):
    r = run(tmp_path, {
        "src/app/api/a/route.ts": "export async function GET() { await db.from('transactions').select() }",
        "src/app/api/b/route.ts": "export async function GET() { await db.from('t').select().eq('user_id', u) }",
    })
    [f] = r["findings"]
    assert (f["check"], f["file"]) == ("route-user-id", "src/app/api/a/route.ts")


def test_webhook_without_verification(tmp_path):
    r = run(tmp_path, {"src/app/api/billing/webhook/route.ts": "export async function POST(req) { const b = await req.json() }"})
    assert checks(r) == ["webhook-unverified"]


def test_webhook_verified_in_imported_service(tmp_path):
    r = run(tmp_path, {
        "src/app/api/billing/webhook/route.ts": "import { parseEvent } from '@/services/polar';",
        "src/services/polar.ts": "export function parseEvent(b, h) { return validateEvent(b, h, process.env.POLAR_WEBHOOK_SECRET) }",
    })
    assert r["findings"] == []


def test_client_component_touching_server_secret(tmp_path):
    r = run(tmp_path, {"src/components/C.tsx": "'use client';\nimport { claude } from '@/services/claude';"})
    [f] = r["findings"]
    assert (f["check"], f["severity"], f["line"]) == ("client-server-boundary", "critical", 2)


def test_missing_security_headers(tmp_path):
    r = run(tmp_path, {"next.config.ts": "export default { agentRules: false }"})
    assert checks(r) == ["security-headers"]


def test_root_middleware_is_ignored_by_next(tmp_path):
    r = run(tmp_path, {"middleware.ts": "export function middleware() {}"})
    assert checks(r) == ["middleware-location"]


def test_unpinned_deps_and_missing_lockfile(tmp_path):
    root = make_repo(tmp_path, {**BASE, "package.json": json.dumps({"dependencies": {"a": "^1.0.0", "b": "1.0.0"}})})
    (root / "package-lock.json").unlink()
    r = scan.scan(root, npm_audit=False)
    assert sorted(checks(r)) == ["lockfile-missing", "unpinned-dependency"]


def test_action_not_pinned_to_sha(tmp_path):
    r = run(tmp_path, {".github/workflows/ci.yml": (
        "steps:\n"
        "  - uses: actions/checkout@v6\n"
        "  - uses: actions/setup-node@" + "a" * 40 + "\n"
    )})
    [f] = r["findings"]
    assert (f["check"], f["line"]) == ("action-unpinned", 2)


def test_error_leak_and_empty_catch(tmp_path):
    r = run(tmp_path, {"src/app/api/x/route.ts": (
        "// user_id\n"
        "try { a() } catch {}\n"
        "return NextResponse.json({ error: err.message }, { status: 500 })\n"
    )})
    assert sorted(checks(r)) == ["empty-catch", "error-leak"]


def test_get_session_on_server(tmp_path):
    r = run(tmp_path, {"src/app/api/x/route.ts": "// user_id\nconst { data } = await supabase.auth.getSession()"})
    assert checks(r) == ["get-session"]


def test_npm_audit_mapping():
    audit = {"vulnerabilities": {
        "a": {"severity": "critical", "via": [{"title": "RCE"}], "fixAvailable": True},
        "b": {"severity": "moderate", "via": ["a"], "fixAvailable": False},
    }}
    fs = scan.audit_findings(audit)
    assert [(f["file"], f["severity"]) for f in fs] == [("a", "critical"), ("b", "minor")]
    assert all(f["category"] == "A03" for f in fs)


def test_npm_audit_dedupes_advisory_titles():
    audit = {"vulnerabilities": {"a": {"severity": "high", "via": [{"title": "DoS"}, {"title": "DoS"}, {"title": "ReDoS"}]}}}
    [f] = scan.audit_findings(audit)
    assert f["failure_scenario"].startswith("DoS, ReDoS —")


def test_finding_ids_are_unique(tmp_path):
    r = run(tmp_path, {"src/components/A.tsx": (
        "<div dangerouslySetInnerHTML={{ __html: a }} />\n"
        "<div dangerouslySetInnerHTML={{ __html: b }} />\n"
    )})
    ids = [f["id"] for f in r["findings"]]
    assert len(ids) == len(set(ids)) == 2


@pytest.mark.parametrize("cat", [f"A{i:02d}" for i in range(1, 11)])
def test_every_category_has_a_korean_name(cat):
    assert scan.CATEGORIES[cat]
