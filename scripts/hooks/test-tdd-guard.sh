#!/bin/bash
# tdd-guard.sh 회귀 테스트.
# Claude(Edit/Write)와 Codex(apply_patch) 양쪽 훅 페이로드를 먹여 allow/deny를 검증한다.
#
# 사용법: bash scripts/hooks/test-tdd-guard.sh

set -uo pipefail

GUARD="$(cd "$(dirname "$0")" && pwd)/tdd-guard.sh"
PASS=0
FAIL=0

TMP=$(mktemp -d)
trap 'chmod -R u+w "$TMP" 2>/dev/null; /bin/rm -rf "$TMP"' EXIT

# TDD 가드는 package.json이 있는 git repo에서만 동작한다.
mkdir -p "$TMP/src/lib" "$TMP/src/app/api/ping" "$TMP/src/types"
echo '{}' > "$TMP/package.json"
git -C "$TMP" init -q .

# 테스트가 이미 있는 모듈
: > "$TMP/src/lib/covered.ts"
: > "$TMP/src/lib/covered.test.ts"

# expect <기대: allow|deny> <설명> <페이로드>
expect() {
  local want="$1" desc="$2" payload="$3"
  local out got
  out=$(cd "$TMP" && printf '%s' "$payload" | bash "$GUARD" 2>&1)

  if printf '%s' "$out" | grep -q '"permissionDecision": *"deny"'; then
    got=deny
  else
    got=allow
  fi

  if [ "$got" = "$want" ]; then
    PASS=$((PASS + 1))
    printf '  ok   %s\n' "$desc"
  else
    FAIL=$((FAIL + 1))
    printf '  FAIL %s — expected %s, got %s\n' "$desc" "$want" "$got"
    [ -n "$out" ] && printf '       output: %s\n' "$(printf '%s' "$out" | tr '\n' ' ')"
  fi
}

# JSON 페이로드 헬퍼 — jq로 만들어야 패치 본문의 개행/따옴표가 안전하다.
claude_payload() {
  jq -nc --arg p "$1" '{tool_name: "Write", tool_input: {file_path: $p}}'
}

codex_payload() {
  jq -nc --arg c "$1" '{tool_name: "apply_patch", tool_input: {command: $c}}'
}

echo "tdd-guard.sh"
echo
echo "Claude (tool_input.file_path)"
expect deny  "테스트 없는 lib 모듈"        "$(claude_payload "$TMP/src/lib/plain.ts")"
expect allow "테스트 있는 lib 모듈"        "$(claude_payload "$TMP/src/lib/covered.ts")"
expect allow "테스트 파일 자체"            "$(claude_payload "$TMP/src/lib/plain.test.ts")"
expect allow "types/ 하위"                 "$(claude_payload "$TMP/src/types/category.ts")"
expect allow "page.tsx"                    "$(claude_payload "$TMP/src/app/page.tsx")"
expect allow "설정 파일(.json)"            "$(claude_payload "$TMP/tsconfig.json")"
expect allow ".claude/ 인프라"             "$(claude_payload "$TMP/.claude/settings.json")"

echo
echo "Codex (tool_input.command = apply_patch 패치)"
expect deny  "Add File — 테스트 없음" "$(codex_payload '*** Begin Patch
*** Add File: '"$TMP"'/src/lib/plain.ts
+export const a = 1;
*** End Patch')"

expect allow "Add File — 테스트 있음" "$(codex_payload '*** Begin Patch
*** Add File: '"$TMP"'/src/lib/covered.ts
+export const a = 1;
*** End Patch')"

expect deny  "Update File — 테스트 없음" "$(codex_payload '*** Begin Patch
*** Update File: '"$TMP"'/src/lib/plain.ts
@@
-export const a = 1;
+export const a = 2;
*** End Patch')"

expect allow "Delete File — 삭제는 테스트 불필요" "$(codex_payload '*** Begin Patch
*** Delete File: '"$TMP"'/src/lib/plain.ts
*** End Patch')"

expect deny  "여러 파일 중 하나가 테스트 없음" "$(codex_payload '*** Begin Patch
*** Update File: '"$TMP"'/src/lib/covered.ts
@@
-a
+b
*** Add File: '"$TMP"'/src/lib/plain.ts
+export const a = 1;
*** End Patch')"

expect allow "API route — 테스트 없음이지만 .json" "$(codex_payload '*** Begin Patch
*** Add File: '"$TMP"'/src/app/api/ping/config.json
+{}
*** End Patch')"

expect deny  "API route.ts — 테스트 없음" "$(codex_payload '*** Begin Patch
*** Add File: '"$TMP"'/src/app/api/ping/route.ts
+export async function GET() {}
*** End Patch')"

echo
echo "Codex Bash 쓰기 (셸 리다이렉션으로 apply_patch를 우회하는 실제 경로)"
bash_payload() {
  jq -nc --arg c "$1" '{tool_name: "Bash", tool_input: {command: $c}}'
}

expect deny  "리다이렉션 쓰기 — 테스트 없음" \
  "$(bash_payload "mkdir -p src/lib && printf '%s' 'export const rate = 1;' > $TMP/src/lib/plain.ts")"
expect allow "리다이렉션 쓰기 — 테스트 있음" \
  "$(bash_payload "printf '%s' 'x' > $TMP/src/lib/covered.ts")"
expect deny  "append 리다이렉션 — 테스트 없음" \
  "$(bash_payload "echo x >> $TMP/src/lib/plain.ts")"
expect deny  "tee — 테스트 없음" \
  "$(bash_payload "echo x | tee $TMP/src/lib/plain.ts")"
expect deny  "heredoc 리다이렉션 — 테스트 없음" \
  "$(bash_payload "cat > $TMP/src/lib/plain.ts <<'EOF'
export const a = 1;
EOF")"

echo
echo "Bash 툴 페이로드 (오탐 방지)"
expect allow "빌드 명령" "$(bash_payload 'npm run build')"
expect allow "stderr 병합 2>&1" "$(bash_payload 'npm run lint 2>&1 && npm run test 2>&1')"
expect allow "/dev/null 리다이렉션" "$(bash_payload 'npm run build > /dev/null 2>&1')"
expect allow "소스가 아닌 파일로 리다이렉션" "$(bash_payload "npm run build > $TMP/out.log")"
expect allow "읽기 전용 명령" "$(bash_payload "cat $TMP/src/lib/plain.ts")"
expect allow "패치처럼 보이는 문자열이 없는 명령" "$(jq -nc '{tool_name: "Bash", tool_input: {command: "echo \"*** Add File: x\""}}')"

echo
echo "package.json 없는 부트스트랩 상태"
BOOT=$(mktemp -d)
git -C "$BOOT" init -q .
boot_out=$(cd "$BOOT" && claude_payload "$BOOT/src/lib/plain.ts" | bash "$GUARD" 2>&1)
if printf '%s' "$boot_out" | grep -q '"deny"'; then
  FAIL=$((FAIL + 1)); echo "  FAIL 스캐폴딩 전에는 통과해야 함"
else
  PASS=$((PASS + 1)); echo "  ok   스캐폴딩 전에는 통과"
fi
/bin/rm -rf "$BOOT"

echo
echo "passed: $PASS, failed: $FAIL"
[ "$FAIL" -eq 0 ]
