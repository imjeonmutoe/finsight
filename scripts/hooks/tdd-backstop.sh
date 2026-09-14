#!/bin/bash
# TDD Backstop Hook — PostToolUse
# PreToolUse 텍스트 검사(tdd-guard.sh)는 셸 툴이 python·node 등으로 파일을 쓰면 못 잡는다.
# 여기서는 명령어를 보지 않고 작업트리를 직접 본다. 어떤 방법으로 썼든 동일하게 잡힌다.
#
# 쓰기를 선제적으로 막지는 못한다. 대신 쓴 직후에 지적해서 테스트를 먼저 쓰게 만든다.
#
# 회귀 테스트: bash scripts/hooks/test-tdd-backstop.sh

cat > /dev/null   # 훅 페이로드는 쓰지 않지만 stdin은 비워야 한다

ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)

# 스캐폴딩 전에는 강제할 대상이 없다 (tdd-guard.sh와 같은 기준)
if [ ! -f "$ROOT/package.json" ]; then
  exit 0
fi

. "$(cd "$(dirname "$0")" && pwd)/tdd-rules.sh"

# HEAD 이후 변경된 파일 + 추적되지 않은 파일.
# 커밋된 기존 코드는 건드리지 않는다 — 이번 작업에서 생긴 것만 본다.
CHANGED=$(cd "$ROOT" && {
  git diff --name-only HEAD 2>/dev/null || git diff --name-only --cached 2>/dev/null
  git ls-files --others --exclude-standard 2>/dev/null
} | sort -u)

MISSING=""
while IFS= read -r REL; do
  [ -z "$REL" ] && continue
  TARGET="$ROOT/$REL"
  [ -f "$TARGET" ] || continue          # 삭제된 파일은 대상 아님
  tdd_needs_test "$TARGET" || continue
  MISSING="${MISSING}${REL}, "
done <<EOF
$CHANGED
EOF

if [ -n "$MISSING" ]; then
  MISSING=${MISSING%, }
  REASON="TDD BACKSTOP: 테스트 없이 작성된 소스 파일이 있습니다 — ${MISSING}. 다음 작업으로 넘어가기 전에 각 모듈의 테스트를 먼저 작성하고, 테스트가 통과하는지 확인하세요."
  jq -nc --arg r "$REASON" '{
    decision: "block",
    reason: $r,
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: $r
    }
  }'
fi

exit 0
