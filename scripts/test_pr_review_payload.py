"""
pr_review_payload.py 테스트.

핵심 계약: diff hunk 밖 지적이 인라인 코멘트로 섞여 나가지 않는다.
하나라도 섞이면 GitHub이 리뷰 전체를 422로 거절해 인라인이 통째로 날아간다.
"""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
import pr_review_payload as prp


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

NEW_FILE_PATCH = """\
diff --git a/src/lib/new.ts b/src/lib/new.ts
new file mode 100644
--- /dev/null
+++ b/src/lib/new.ts
@@ -0,0 +1,3 @@
+const a = 1
+const b = 2
+const c = 3
"""

EDIT_PATCH = """\
diff --git a/src/lib/edit.ts b/src/lib/edit.ts
--- a/src/lib/edit.ts
+++ b/src/lib/edit.ts
@@ -8,4 +8,5 @@ export function f() {
   const keep = 1
-  const gone = 2
+  const added = 3
+  const also = 4
   const tail = 5
"""

DELETED_PATCH = """\
diff --git a/src/lib/dead.ts b/src/lib/dead.ts
deleted file mode 100644
--- a/src/lib/dead.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-const x = 1
-const y = 2
"""


def finding(file, line, severity="major", title="제목"):
    return {
        "file": file,
        "line": line,
        "severity": severity,
        "critical_rule": False,
        "title": title,
        "tldr": "왜 문제인지",
        "good": "잘한 부분",
        "fix": "const fixed = true",
        "failure_scenario": "입력 → 잘못된 결과",
        "dims": ["correctness"],
        "verified": True,
    }


def result(findings):
    return {"summaryMd": "# 요약", "findings": findings}


# ---------------------------------------------------------------------------
# hunk_lines
# ---------------------------------------------------------------------------


def test_new_file_gives_every_line():
    assert prp.hunk_lines(NEW_FILE_PATCH) == {"src/lib/new.ts": {1, 2, 3}}


def test_edit_numbers_added_and_context_lines_but_not_removed():
    # @@ +8,5 → 8:keep(문맥) 9:added 10:also 11:tail(문맥). 삭제된 줄은 RIGHT에 없다.
    assert prp.hunk_lines(EDIT_PATCH) == {"src/lib/edit.ts": {8, 9, 10, 11}}


def test_deleted_file_has_no_commentable_lines():
    assert prp.hunk_lines(DELETED_PATCH) == {}


def test_multiple_files_in_one_patch():
    got = prp.hunk_lines(NEW_FILE_PATCH + EDIT_PATCH)
    assert got == {"src/lib/new.ts": {1, 2, 3}, "src/lib/edit.ts": {8, 9, 10, 11}}


# ---------------------------------------------------------------------------
# build_payload — 분리가 핵심
# ---------------------------------------------------------------------------


def test_in_diff_finding_becomes_inline_comment():
    payload, orphans = prp.build_payload(result([finding("src/lib/new.ts", 2)]), prp.hunk_lines(NEW_FILE_PATCH), "sha1")
    assert orphans == []
    assert len(payload["comments"]) == 1
    c = payload["comments"][0]
    assert (c["path"], c["line"], c["side"]) == ("src/lib/new.ts", 2, "RIGHT")


def test_line_outside_hunk_is_held_back_not_sent_inline():
    r = result([finding("src/lib/new.ts", 99)])
    payload, orphans = prp.build_payload(r, prp.hunk_lines(NEW_FILE_PATCH), "sha1")
    assert payload["comments"] == []
    assert len(orphans) == 1


def test_file_absent_from_diff_is_held_back():
    r = result([finding("src/lib/untouched.ts", 1)])
    payload, orphans = prp.build_payload(r, prp.hunk_lines(NEW_FILE_PATCH), "sha1")
    assert payload["comments"] == []
    assert len(orphans) == 1


def test_mixed_batch_keeps_the_in_diff_ones():
    """한 건이 범위 밖이라고 나머지 인라인까지 버리지 않는다 — 이게 422 fallback과의 차이다."""
    r = result([finding("src/lib/new.ts", 1), finding("src/lib/untouched.ts", 1), finding("src/lib/new.ts", 3)])
    payload, orphans = prp.build_payload(r, prp.hunk_lines(NEW_FILE_PATCH), "sha1")
    assert [c["line"] for c in payload["comments"]] == [1, 3]
    assert len(orphans) == 1


def test_held_back_findings_are_appended_to_the_summary_body():
    r = result([finding("src/lib/untouched.ts", 42, title="범위 밖 지적")])
    payload, _ = prp.build_payload(r, prp.hunk_lines(NEW_FILE_PATCH), "sha1")
    assert "범위 밖 지적" in payload["body"]
    assert "src/lib/untouched.ts:42" in payload["body"]


def test_body_is_untouched_when_nothing_held_back():
    r = result([finding("src/lib/new.ts", 1)])
    payload, _ = prp.build_payload(r, prp.hunk_lines(NEW_FILE_PATCH), "sha1")
    assert payload["body"] == "# 요약"


def test_event_is_always_comment():
    """GitHub은 자기 PR에 APPROVE·REQUEST_CHANGES를 거부한다. 판정은 본문에만 적는다."""
    payload, _ = prp.build_payload(result([]), {}, "sha1")
    assert payload["event"] == "COMMENT"
    assert payload["commit_id"] == "sha1"


# ---------------------------------------------------------------------------
# comment_body — 4줄 포맷
# ---------------------------------------------------------------------------


def test_comment_body_carries_severity_title_tldr_good_and_fix():
    body = prp.comment_body(finding("src/lib/new.ts", 1, severity="critical", title="제목입니다"))
    assert "🔴" in body and "critical" in body and "제목입니다" in body
    assert "TL;DR" in body and "왜 문제인지" in body
    assert "Good" in body and "잘한 부분" in body
    assert "const fixed = true" in body


def test_unverified_finding_is_marked():
    f = finding("src/lib/new.ts", 1)
    f["verified"] = False
    assert "미검증" in prp.comment_body(f)
    assert "미검증" not in prp.comment_body(finding("src/lib/new.ts", 1))


def test_missing_good_renders_a_dash_not_the_word_none():
    f = finding("src/lib/new.ts", 1)
    f["good"] = ""
    assert "None" not in prp.comment_body(f)
