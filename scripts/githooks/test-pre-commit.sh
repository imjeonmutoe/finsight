#!/bin/bash
# scripts/githooks/pre-commit 회귀 테스트.
#
# 훅은 스테이지된 **추가 줄**만 본다. 그래서 확인해야 할 것이 두 방향이다.
#   ① 위반을 실제로 잡는가
#   ② 이미 리포에 있던 코드(스테이지 안 된 줄)로 커밋을 막지 않는가
# ②가 깨지면 훅이 첫날부터 --no-verify로 우회되고, 그 순간 ①도 같이 죽는다.
#
# 실행: bash scripts/hooks/../githooks/test-pre-commit.sh  (또는 scripts/githooks/test-pre-commit.sh)

set -u

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
HOOK="$ROOT/scripts/githooks/pre-commit"
TMPROOT=$(mktemp -d)
PASS=0
FAIL=0

cleanup() { chmod -R u+w "$TMPROOT" 2>/dev/null; command rm -rf "$TMPROOT"; }
trap cleanup EXIT

# fresh_repo — 훅을 돌릴 빈 git 리포를 만들고 경로를 표준출력으로 준다.
fresh_repo() {
  local d
  d=$(mktemp -d "$TMPROOT/repo.XXXXXX")
  git -C "$d" init -q
  git -C "$d" config user.email t@t.t
  git -C "$d" config user.name t
  git -C "$d" commit -q --allow-empty -m init
  echo "$d"
}

# stage <repo> <경로> <내용> — 파일을 만들고 스테이지한다.
stage() {
  local repo=$1 path=$2 body=$3
  mkdir -p "$repo/$(dirname "$path")"
  printf '%s\n' "$body" > "$repo/$path"
  git -C "$repo" add "$path"
}

# expect <기대종료코드> <설명> <repo> — 훅을 돌려 종료코드를 확인한다.
expect() {
  local want=$1 desc=$2 repo=$3
  local out got
  out=$(cd "$repo" && bash "$HOOK" 2>&1)
  got=$?
  if [ "$got" = "$want" ]; then
    PASS=$((PASS + 1))
    printf '  ok   %s\n' "$desc"
  else
    FAIL=$((FAIL + 1))
    printf '  FAIL %s (기대 %s, 실제 %s)\n' "$desc" "$want" "$got"
    printf '%s\n' "$out" | sed 's/^/       | /'
  fi
}

# expect_msg <찾을문자열> <설명> <repo> — 차단되면서 그 규칙 이름이 출력에 나오는지 본다.
# 종료코드만 보면 엉뚱한 규칙이 잡아도 테스트가 통과해 버린다.
expect_msg() {
  local needle=$1 desc=$2 repo=$3
  local out got
  out=$(cd "$repo" && bash "$HOOK" 2>&1)
  got=$?
  if [ "$got" = 1 ] && printf '%s' "$out" | grep -qF "$needle"; then
    PASS=$((PASS + 1))
    printf '  ok   %s\n' "$desc"
  else
    FAIL=$((FAIL + 1))
    printf '  FAIL %s (종료 %s, "%s" 없음)\n' "$desc" "$got" "$needle"
    printf '%s\n' "$out" | sed 's/^/       | /'
  fi
}

echo "pre-commit 훅 테스트"

# ── 통과해야 하는 것 ────────────────────────────────────────────────────────
r=$(fresh_repo)
stage "$r" "src/lib/summary.ts" 'export const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0)'
expect 0 "정상 코드는 통과한다" "$r"

r=$(fresh_repo)
expect 0 "스테이지된 게 없으면 통과한다" "$r"

# 이미 있던 위반으로 남의 커밋을 막으면 안 된다.
r=$(fresh_repo)
mkdir -p "$r/src/components"
printf '%s\n' 'export const X = () => <div dangerouslySetInnerHTML={{ __html: s }} />' > "$r/src/components/Old.tsx"
git -C "$r" add src/components/Old.tsx
git -C "$r" commit -q -m "기존 위반"
stage "$r" "src/lib/other.ts" 'export const y = 1'
expect 0 "이미 커밋된 위반은 새 커밋을 막지 않는다" "$r"

# 테스트 파일은 규칙 문자열을 인용할 수밖에 없다.
r=$(fresh_repo)
stage "$r" "src/components/Amount.test.tsx" 'it("dangerouslySetInnerHTML을 쓰지 않는다", () => {})'
expect 0 "테스트 파일은 검사 대상이 아니다" "$r"

# 문서는 규칙 자체를 적는 곳이다.
r=$(fresh_repo)
stage "$r" "docs/UI_GUIDE.md" '한글에 tracking-tight 를 쓰지 않는다. NEXT_PUBLIC_ANTHROPIC_API_KEY 금지.'
expect 0 "마크다운 문서는 검사 대상이 아니다" "$r"

# 훅 자신이 모든 패턴을 담고 있다. 자기 커밋을 막으면 배포가 불가능하다.
r=$(fresh_repo)
stage "$r" "scripts/githooks/pre-commit" 'grep -E "dangerouslySetInnerHTML|NEXT_PUBLIC_ANTHROPIC_API_KEY"'
expect 0 "scripts/ 아래는 검사 대상이 아니다" "$r"

# 규칙을 적어 둔 주석이 그 규칙에 걸리면 훅은 그날로 --no-verify로 우회된다.
r=$(fresh_repo)
stage "$r" "src/components/Insight.tsx" '// LLM 출력에 dangerouslySetInnerHTML을 쓰지 않는다
 * 금액은 parseFloat 없이 정수로 다룬다
export const X = 1'
expect 0 "주석에서 규칙을 언급해도 막지 않는다" "$r"

r=$(fresh_repo)
stage "$r" "src/components/Chart.tsx" "const url = process.env.NEXT_PUBLIC_SUPABASE_URL"
expect 0 "NEXT_PUBLIC_ env는 클라이언트에서 정상이다" "$r"

r=$(fresh_repo)
stage "$r" "src/app/api/insights/route.ts" "const key = process.env.ANTHROPIC_API_KEY"
expect 0 "서버 라우트의 서버 전용 env는 정상이다" "$r"

# ── 막아야 하는 것 ──────────────────────────────────────────────────────────
r=$(fresh_repo)
stage "$r" "src/lib/env.ts" 'export const k = process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY'
expect_msg "비밀키" "비밀키에 NEXT_PUBLIC_ 접두사를 막는다" "$r"

r=$(fresh_repo)
stage "$r" "next.config.ts" 'env: { NEXT_PUBLIC_POLAR_ACCESS_TOKEN: process.env.POLAR_ACCESS_TOKEN }'
expect_msg "비밀키" "src 밖의 설정 파일에서도 비밀키 노출을 막는다" "$r"

r=$(fresh_repo)
stage "$r" "src/components/Insight.tsx" 'return <p dangerouslySetInnerHTML={{ __html: text }} />'
expect_msg "dangerouslySetInnerHTML" "dangerouslySetInnerHTML을 막는다" "$r"

r=$(fresh_repo)
stage "$r" "src/lib/classify.ts" 'console.log("분류 실패", row.merchant)'
expect_msg "금융 데이터" "가맹점명 로깅을 막는다" "$r"

r=$(fresh_repo)
stage "$r" "src/services/anthropic.ts" 'console.error(`거래 ${tx.amount} 실패`)'
expect_msg "금융 데이터" "금액 로깅을 막는다" "$r"

r=$(fresh_repo)
stage "$r" "src/lib/parse.ts" 'const amount = parseFloat(cell)'
expect_msg "부동소수점" "금액 parseFloat을 막는다" "$r"

r=$(fresh_repo)
stage "$r" "src/lib/format.ts" 'return (a / b).toFixed(2)'
expect_msg "부동소수점" "toFixed를 막는다" "$r"

r=$(fresh_repo)
stage "$r" "src/components/Hero.tsx" '<h1 className="text-4xl tracking-tight">지출 한눈에</h1>'
expect_msg "타이포" "한글 화면의 tracking-tight를 막는다" "$r"

r=$(fresh_repo)
stage "$r" "src/components/Badge.tsx" '<span className="uppercase font-light">구독</span>'
expect_msg "타이포" "uppercase·font-light를 막는다" "$r"

r=$(fresh_repo)
stage "$r" "src/components/Panel.tsx" "'use client'
const k = process.env.SUPABASE_SERVICE_ROLE_KEY"
expect_msg "서버 경계" "클라이언트 컴포넌트의 서버 전용 env를 막는다" "$r"

echo
if [ "$FAIL" -gt 0 ]; then
  echo "실패 $FAIL / 통과 $PASS"
  exit 1
fi
echo "통과 $PASS"
