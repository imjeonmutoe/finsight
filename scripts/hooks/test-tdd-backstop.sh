#!/bin/bash
# tdd-backstop.sh 회귀 테스트.
# PostToolUse 백스톱은 명령어가 아니라 작업트리를 본다. 따라서 파일을 어떤 방법으로
# 썼든(python, node, 리다이렉션) 동일하게 잡혀야 한다.
#
# 사용법: bash scripts/hooks/test-tdd-backstop.sh

set -uo pipefail

BACKSTOP="$(cd "$(dirname "$0")" && pwd)/tdd-backstop.sh"
PASS=0
FAIL=0

TMP=$(mktemp -d)
trap 'chmod -R u+w "$TMP" 2>/dev/null; /bin/rm -rf "$TMP"' EXIT

mkdir -p "$TMP/src/lib" "$TMP/src/types" "$TMP/src/app"
echo '{}' > "$TMP/package.json"
git -C "$TMP" init -q .
git -C "$TMP" config user.email t@t.t
git -C "$TMP" config user.name t
git -C "$TMP" add -A
git -C "$TMP" commit -qm baseline

PAYLOAD='{"tool_name":"Bash","tool_input":{"command":"true"},"tool_response":{}}'

# expect <기대: block|pass> <설명>
expect() {
  local want="$1" desc="$2"
  local out got
  out=$(cd "$TMP" && printf '%s' "$PAYLOAD" | bash "$BACKSTOP" 2>&1)

  if printf '%s' "$out" | grep -q 'TDD BACKSTOP'; then
    got=block
  else
    got=pass
  fi

  if [ "$got" = "$want" ]; then
    PASS=$((PASS + 1)); printf '  ok   %s\n' "$desc"
  else
    FAIL=$((FAIL + 1)); printf '  FAIL %s — expected %s, got %s\n' "$desc" "$want" "$got"
    [ -n "$out" ] && printf '       output: %s\n' "$(printf '%s' "$out" | tr '\n' ' ')"
  fi
}

echo "tdd-backstop.sh"
echo
expect pass "깨끗한 작업트리"

# python으로 쓴 파일 — PreToolUse 텍스트 검사가 못 잡는 바로 그 경로
python3 -c "
from pathlib import Path
Path('$TMP/src/lib/pricing.ts').write_text('export const rate = 1;')
"
expect block "python으로 쓴 테스트 없는 모듈"

: > "$TMP/src/lib/pricing.test.ts"
expect pass "테스트를 추가하면 해소"

# 면제 대상은 잡지 않는다
: > "$TMP/src/types/category.ts"
: > "$TMP/src/app/page.tsx"
: > "$TMP/src/lib/notes.md"
expect pass "types·page.tsx·md는 면제"

# 수정(추가가 아닌)도 잡는다
git -C "$TMP" add -A && git -C "$TMP" commit -qm "add pricing"
echo "export const rate = 2;" > "$TMP/src/lib/rounding.ts"
expect block "커밋 이후 새로 생긴 테스트 없는 모듈"

/bin/rm -f "$TMP/src/lib/rounding.ts"
expect pass "파일을 지우면 해소"

# 삭제된 파일을 대상으로 삼지 않는다
git -C "$TMP" rm -q "$TMP/src/lib/pricing.ts" "$TMP/src/lib/pricing.test.ts"
expect pass "삭제는 대상 아님"

echo
echo "package.json 없는 부트스트랩 상태"
BOOT=$(mktemp -d)
mkdir -p "$BOOT/src/lib"
git -C "$BOOT" init -q .
: > "$BOOT/src/lib/plain.ts"
boot_out=$(cd "$BOOT" && printf '%s' "$PAYLOAD" | bash "$BACKSTOP" 2>&1)
if printf '%s' "$boot_out" | grep -q 'TDD BACKSTOP'; then
  FAIL=$((FAIL + 1)); echo "  FAIL 스캐폴딩 전에는 통과해야 함"
else
  PASS=$((PASS + 1)); echo "  ok   스캐폴딩 전에는 통과"
fi
/bin/rm -rf "$BOOT"

echo
echo "passed: $PASS, failed: $FAIL"
[ "$FAIL" -eq 0 ]
