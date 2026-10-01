#!/usr/bin/env python3
"""리뷰 워크플로우 결과를 GitHub PR 리뷰 페이로드로 바꾼다.

인라인 코멘트는 PR diff의 hunk 안에 있는 줄에만 달 수 있다. 범위 밖 지적이 **하나라도**
섞이면 GitHub이 리뷰 전체를 422로 거절해 나머지 인라인까지 통째로 날아간다.
그래서 보내기 전에 여기서 갈라 낸다 — 범위 안은 인라인으로, 범위 밖은 요약 본문 끝에.

사용법:
    gh pr diff <번호> > pr.diff
    python3 scripts/pr_review_payload.py <결과.json> pr.diff <commit_sha> > payload.json
    gh api "repos/{owner}/{repo}/pulls/<번호>/reviews" --method POST --input payload.json
"""

import json
import re
import sys

EMOJI = {"critical": "🔴", "major": "🟠", "minor": "🟡", "nit": "⚪"}


def hunk_lines(patch):
    """패치를 읽어 파일별로 '인라인 코멘트를 달 수 있는 RIGHT side 줄 번호'를 모은다.

    추가된 줄과 문맥 줄이 대상이다. 삭제된 줄은 변경 후 파일에 없으므로 번호를 차지하지 않고,
    통째로 삭제된 파일(`+++ /dev/null`)은 달 곳이 아예 없다.
    """
    out = {}
    path = None
    lineno = 0
    in_header = False
    for raw in patch.splitlines():
        # `diff --git`부터 첫 `@@`까지가 헤더 구역이다. 그 밖의 `+++ `는 내용이 '++ '로
        # 시작하는 추가된 줄이지 파일 헤더가 아니다. 구별하지 않으면 그 줄에서 번호가
        # 0으로 리셋돼 뒤따르는 줄이 통째로 '범위 밖'으로 밀린다.
        if raw.startswith("diff --git "):
            in_header = True
            path = None
            lineno = 0
            continue
        if in_header and raw.startswith("+++ "):
            target = raw[4:].strip()
            path = None if target == "/dev/null" else re.sub(r"^b/", "", target)
            continue
        if raw.startswith("@@"):
            in_header = False
            m = re.match(r"@@ -\S+ \+(\d+)", raw)
            lineno = int(m.group(1)) if m else 0
            continue
        if path is None or lineno == 0:
            continue
        if raw.startswith("+") or raw.startswith(" "):
            out.setdefault(path, set()).add(lineno)
            lineno += 1
    return out


def comment_body(f):
    """인라인 코멘트 본문. 위치는 GitHub이 줄 옆에 붙여 주므로 file:line을 다시 쓰지 않는다."""
    dims = ", ".join(f.get("dims") or [])
    flag = "" if f.get("verified") else " · *미검증*"
    return "\n".join(
        [
            f"**[{EMOJI.get(f['severity'], '')} {f['severity']}] {f['title']}**  `{dims}`{flag}",
            "",
            f"**TL;DR** {f['tldr']}",
            f"**✓ Good** {f.get('good') or '—'}",
            "",
            "**→ Fix**",
            "```ts",
            f["fix"],
            "```",
        ]
    )


def build_payload(result, hunks, commit_id):
    """(페이로드, 범위 밖으로 밀린 지적들)을 돌려준다."""
    inline = []
    orphans = []
    for f in result["findings"]:
        if f["line"] in hunks.get(f["file"], set()):
            inline.append({"path": f["file"], "line": f["line"], "side": "RIGHT", "body": comment_body(f)})
        else:
            orphans.append(f)

    body = result["summaryMd"]
    if orphans:
        body += "\n\n---\n\n### diff 범위 밖 지적 (인라인 불가)\n\n"
        body += "이 PR에서 바뀌지 않은 줄이라 GitHub이 인라인 코멘트를 받지 않는다. 여기 모아 둔다.\n\n"
        # 이 줄들은 게이트 마커(summaryMd 끝) **뒤에** 붙고, 제목·TL;DR은 LLM이 쓴 문자열이다.
        # 거기 섞인 `<!--`를 그대로 두면 위조 마커가 된다 (review-code.js의 neutralizeComments와 같은 처리).
        for f in orphans:
            line = f"- **{f['file']}:{f['line']}** {EMOJI.get(f['severity'], '')} {f['severity']} — {f['title']}\n"
            line += f"  {f['tldr']}\n"
            body += line.replace("<!--", "&lt;!--")

    # event는 항상 COMMENT다. GitHub은 자기 PR에 APPROVE·REQUEST_CHANGES를 거부한다.
    return {"commit_id": commit_id, "body": body, "event": "COMMENT", "comments": inline}, orphans


def main(argv):
    if len(argv) != 4:
        print(__doc__, file=sys.stderr)
        return 2
    result_path, patch_path, commit_id = argv[1:]
    with open(result_path, encoding="utf-8") as fh:
        result = json.load(fh)
    with open(patch_path, encoding="utf-8") as fh:
        hunks = hunk_lines(fh.read())

    payload, orphans = build_payload(result, hunks, commit_id)
    print(json.dumps(payload, ensure_ascii=False))
    print(f"인라인 {len(payload['comments'])}건 / 범위 밖 {len(orphans)}건은 본문으로", file=sys.stderr)
    for f in orphans:
        print(f"  범위 밖: {f['file']}:{f['line']} {f['severity']} — {f['title']}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
