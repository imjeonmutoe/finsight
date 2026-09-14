#!/bin/bash
# TDD Guard Hook — PreToolUse[Edit|Write|Bash]
# 구현 코드를 작성하려 할 때, 해당 모듈의 테스트 파일이 먼저 존재하는지 체크.
# 테스트 없이 구현 코드를 작성하려 하면 차단.
#
# 한계: 셸 툴은 python·node 등 임의의 방법으로 파일을 쓸 수 있어 명령어 텍스트 검사로는
# 전부 잡히지 않는다. 못 잡은 건 tdd-backstop.sh(PostToolUse)가 작업트리를 보고 잡는다.
#
# 회귀 테스트: bash scripts/hooks/test-tdd-guard.sh

INPUT=$(cat)

# 편집 대상 경로 수집. 에이전트마다 페이로드 모양이 다르다.
#  - Claude(Edit/Write): tool_input.file_path
#  - Codex(apply_patch): file_path 필드가 없고 tool_input.command에 패치 전문이 들어온다.
#    헤더 줄(`*** Add File: <경로>`)에서 뽑아야 한다. 이걸 안 하면 Codex에서는
#    file_path가 비어 가드가 전부 무사통과한다.
#    Delete File은 삭제라 테스트를 요구하지 않으므로 제외한다.
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')
CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')
PATCH_PATHS=$(printf '%s\n' "$CMD" | sed -n \
  -e 's/^\*\*\* Add File: //p' \
  -e 's/^\*\*\* Update File: //p' \
  -e 's/^\*\*\* Move to: //p')

# Codex는 apply_patch 대신 셸 리다이렉션으로 파일을 쓰기도 한다.
#   /bin/zsh -lc "mkdir -p src/lib && printf '%s' '...' > src/lib/pricing.ts"
# 따옴표를 먼저 걷어내고 `>`·`>>`·`tee`의 대상만 뽑는다. `2>&1`·`>/dev/null`은
# 대상이 소스 확장자가 아니므로 아래 루프에서 자연히 걸러진다.
SHELL_WRITES=$(printf '%s\n' "$CMD" | tr -d '"'"'" | grep -oE \
  '(>>?|[[:space:]]tee([[:space:]]+-a)?[[:space:]])[[:space:]]*[^[:space:];|&<>()]+' \
  | sed -E 's/^([[:space:]]*(>>?|tee([[:space:]]+-a)?))[[:space:]]*//')

TARGETS=$(printf '%s\n%s\n%s\n' "$FILE_PATH" "$PATCH_PATHS" "$SHELL_WRITES" | grep -v '^[[:space:]]*$')

# 편집 대상이 없으면 통과 (파일을 건드리지 않는 툴 호출)
if [ -z "$TARGETS" ]; then
  exit 0
fi

# 프로젝트가 아직 스캐폴딩되지 않았으면(package.json 없음) TDD 가드를 건너뛴다.
# 테스트 프레임워크가 깔리기 전(MVP 부트스트랩)에는 강제할 대상이 없기 때문.
# package.json이 생기면 이후 모든 lib/소스 편집에 TDD가 적용된다.
# (Claude .claude/settings.json 과 codex .codex/hooks.json 양쪽에서 공유하는 스크립트)
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
if [ ! -f "$ROOT/package.json" ]; then
  exit 0
fi

. "$(cd "$(dirname "$0")" && pwd)/tdd-rules.sh"

# 한 번의 편집이 여러 파일을 건드릴 수 있다(apply_patch). 하나라도 걸리면 차단한다.
while IFS= read -r TARGET; do
  [ -z "$TARGET" ] && continue
  tdd_needs_test "$TARGET" || continue

  MODULE=$(tdd_module_name "$TARGET")
  cat << EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "TDD GUARD: '${MODULE}'에 대한 테스트 파일이 존재하지 않습니다. 구현 코드를 작성하기 전에 테스트를 먼저 작성하세요. (테스트 파일 예: ${MODULE}.test.ts)"
  }
}
EOF
  exit 0
done <<EOF
$TARGETS
EOF

exit 0
