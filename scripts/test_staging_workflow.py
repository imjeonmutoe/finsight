"""
.github/workflows/staging-db.yml 불변식 테스트.

이 워크플로우는 원격 DB를 통째로 초기화한다. 시크릿 하나를 잘못 넣으면 실데이터가 지워지므로
"프로덕션에 닿을 경로가 없다"를 파일 텍스트로 고정한다.

PyYAML 없이 돈다(`uv run --with pytest python -m pytest scripts/ -q`). YAML 파서에 기대지 않고
텍스트로 확인한다 — 건너뛴 테스트는 지키지 못한 테스트다.
"""

import re
from pathlib import Path

WORKFLOW = Path(__file__).resolve().parent.parent / ".github" / "workflows" / "staging-db.yml"
PROD_REF = "qqhffvdkgnmtusvfizhx"


def text():
    return WORKFLOW.read_text(encoding="utf-8")


def code_lines():
    """주석을 뺀 줄. 금지어 검사가 '왜 안 쓰는지' 설명하는 주석에 걸리지 않게 한다."""
    out = []
    for line in text().splitlines():
        stripped = line.split(" #", 1)[0] if not line.lstrip().startswith("#") else ""
        out.append(stripped)
    return out


def top_block(key):
    """최상위 키 `key:` 아래 들여쓴 블록을 돌려준다."""
    lines = text().splitlines()
    start = next(i for i, l in enumerate(lines) if l.startswith(f"{key}:"))
    block = [lines[start]]
    for l in lines[start + 1 :]:
        if l and not l.startswith((" ", "#")):
            break
        block.append(l)
    return "\n".join(block)


def step_index(pattern):
    lines = code_lines()
    return next(i for i, l in enumerate(lines) if re.search(pattern, l))


# ---------------------------------------------------------------------------
# 트리거
# ---------------------------------------------------------------------------


def test_triggers():
    on = top_block("on")
    assert re.search(r"^  pull_request:", on, re.M)
    assert re.search(r"^  push:", on, re.M)
    assert re.search(r"^  workflow_dispatch:", on, re.M)
    # pull_request·push 모두 supabase/** 경로에만 반응하고, push는 main만
    pr = re.search(r"^  pull_request:\n((?:    .*\n?|\s*#.*\n?)*)", on, re.M).group(1)
    push = re.search(r"^  push:\n((?:    .*\n?|\s*#.*\n?)*)", on, re.M).group(1)
    assert '"supabase/**"' in pr
    assert '"supabase/**"' in push
    assert re.search(r"branches:\s*\[\s*main\s*\]", push)


def test_no_pull_request_target():
    assert not any("pull_request_target" in l for l in code_lines())


def test_fork_pr_filtered():
    body = "\n".join(code_lines())
    assert "github.event.pull_request.head.repo.full_name == github.repository" in body
    # fork 조건이 push·수동 실행을 막지 않도록 pull_request가 아닐 때는 통과시킨다
    assert "github.event_name != 'pull_request'" in body


# ---------------------------------------------------------------------------
# 직렬 실행 · 권한
# ---------------------------------------------------------------------------


def test_concurrency_fixed_and_not_cancelled():
    block = top_block("concurrency")
    group = re.search(r"group:\s*(\S+)", block).group(1)
    assert "${{" not in group, "그룹이 PR마다 달라지면 스테이징 하나를 동시에 초기화한다"
    assert re.search(r"cancel-in-progress:\s*false", block)
    assert "cancel-in-progress: true" not in text()


def test_permissions_contents_read_only():
    perms = [l.strip() for l in code_lines() if re.match(r"\s+\w[\w-]*:\s*(read|write|none)\s*$", l)]
    assert perms == ["contents: read"]
    assert "write-all" not in text() and "read-all" not in text()


# ---------------------------------------------------------------------------
# 비밀 · 프로덕션 차단
# ---------------------------------------------------------------------------


def test_only_staging_secret():
    secrets = set(re.findall(r"secrets\.([A-Za-z_][A-Za-z0-9_]*)", "\n".join(code_lines())))
    assert secrets == {"STAGING_DB_URL"}


def test_secret_not_inlined_in_run():
    # `${{ secrets.* }}`는 env: 값으로만 넘긴다. run: 안에 박으면 셸 문자열로 보간된다.
    for l in code_lines():
        if "secrets." in l:
            assert re.match(r"\s+STAGING_DB_URL:\s*\$\{\{\s*secrets\.STAGING_DB_URL\s*\}\}\s*$", l), l


def test_no_access_token_or_link():
    body = "\n".join(code_lines())
    for banned in ("SUPABASE_ACCESS_TOKEN", "supabase link", "--linked", "--project-ref"):
        assert banned not in body, banned


def test_prod_ref_only_in_guard():
    hits = [i for i, l in enumerate(text().splitlines()) if PROD_REF in l]
    assert hits, "프로덕션 ref 가드가 없다"
    lines = text().splitlines()
    guard_start = next(i for i, l in enumerate(lines) if re.search(r"- name: .*가드", l))
    reset = next(i for i, l in enumerate(lines) if "supabase db reset" in l and not l.lstrip().startswith("#"))
    assert all(guard_start < h < reset for h in hits)


def test_guard_runs_before_reset():
    guard = step_index(PROD_REF)
    reset = step_index(r"supabase db reset")
    assert guard < reset
    # 가드는 빈 값과 프로덕션 ref 모두에서 실패한다
    body = "\n".join(code_lines()[step_index(r"- name: .*가드") : reset])
    assert re.search(r'-z\s+"\$STAGING_DB_URL"', body)
    assert "exit 1" in body


def test_storage_cleared_between_guard_and_reset():
    # 원격 `db reset`은 storage 스키마를 지우지 않는다. 두 번째 초기화부터 init 마이그레이션의
    # statements 버킷 insert가 23505로 실패했다(2026-10-14). 가드 뒤, 초기화 앞에서 비운다.
    lines = code_lines()
    guard = step_index(PROD_REF)
    clear = step_index(r"delete from storage\.buckets")
    reset = step_index(r"supabase db reset")
    assert guard < clear < reset
    body = "\n".join(lines[clear - 10 : reset])
    # libpq는 비밀번호의 인코딩 안 된 `@`를 호스트로 읽고, 그 '호스트'를 에러에 찍는다. GitHub은 시크릿
    # 전체만 가리므로 비밀번호 조각이 공개 로그에 남았다(2026-10-14). URL을 psql에 넘기지 않는다.
    assert 'psql "$STAGING_DB_URL"' not in body
    assert "PGPASSWORD" in body
    assert "::add-mask::" in body
    assert "ON_ERROR_STOP=1" in body
    assert "drop policy if exists statements_own on storage.objects" in body


def test_reset_targets_db_url():
    line = code_lines()[step_index(r"supabase db reset")]
    assert '--db-url "$STAGING_DB_URL"' in line


# ---------------------------------------------------------------------------
# 공급망
# ---------------------------------------------------------------------------


def test_actions_pinned_to_sha():
    uses = [l for l in code_lines() if re.search(r"\buses:", l)]
    assert uses
    for l in uses:
        assert re.search(r"uses:\s*[\w.-]+/[\w./-]+@[0-9a-f]{40}\s*$", l), l


def test_cli_version_pinned():
    m = re.search(r"^\s+version:\s*(\S+)\s*$", "\n".join(code_lines()), re.M)
    assert m and re.fullmatch(r"\d+\.\d+\.\d+", m.group(1)), "CLI 버전은 정확한 값이어야 한다"
