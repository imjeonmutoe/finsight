#!/bin/bash
# TDD 규칙 공유 모듈. tdd-guard.sh(PreToolUse)와 tdd-backstop.sh(PostToolUse)가 source 한다.
# 두 훅이 같은 판정을 해야 하므로 규칙을 한 군데에만 둔다.
#
# 호출 전에 ROOT(리포 루트)가 설정돼 있어야 한다.

# tdd_exempt <경로> — TDD 대상이 아니면 0, 대상이면 1.
tdd_exempt() {
  # 테스트 파일 자체
  case "$1" in
    *test*|*spec*|*.test.*|*.spec.*|*__tests__*) return 0 ;;
  esac

  # .claude/·.codex/ 인프라(설정·훅·슬래시 커맨드)와 workflows/ 오케스트레이션 스크립트.
  # 이유: 워크플로우 스크립트는 런타임이 주입하는 전역(agent/pipeline/log)에 의존하는 오케스트레이션
  #       정의로, lib/services 비즈니스 로직이 아니며 유닛 테스트를 붙일 수 없다.
  case "$1" in
    */.claude/*|*/.codex/*|*/workflows/*) return 0 ;;
  esac

  # 설정/타입/스타일 파일
  case "$1" in
    *.json|*.css|*.scss|*.md|*.yml|*.yaml|*.env*|*.config.*|*tailwind*|*postcss*|*next.config*|*tsconfig*) return 0 ;;
  esac

  # types/ 폴더
  case "$1" in
    */types/*|*/types.ts|*/types.d.ts) return 0 ;;
  esac

  # Next.js 프레임워크 파일 (layout, page, loading, error, not-found, global styles)
  case "$1" in
    */layout.tsx|*/layout.ts|*/page.tsx|*/page.ts|*/loading.tsx|*/error.tsx|*/not-found.tsx|*/globals.css) return 0 ;;
  esac

  # 나머지 중 소스 파일만 대상
  case "$1" in
    *.ts|*.tsx|*.js|*.jsx) return 1 ;;
    *) return 0 ;;
  esac
}

# tdd_has_test <경로> — 짝이 되는 테스트 파일이 있으면 0.
tdd_has_test() {
  local dir base parent ext
  dir=$(dirname "$1")
  base=$(basename "$1" | sed -E 's/\.(ts|tsx|js|jsx)$//')

  # 같은 폴더에 .test / .spec 파일
  for ext in ts tsx js jsx; do
    if [ -f "${dir}/${base}.test.${ext}" ] || [ -f "${dir}/${base}.spec.${ext}" ]; then
      return 0
    fi
  done

  # __tests__ 폴더
  parent=$(dirname "$dir")
  for ext in ts tsx js jsx; do
    if [ -f "${parent}/__tests__/${base}.test.${ext}" ] || [ -f "${dir}/__tests__/${base}.test.${ext}" ]; then
      return 0
    fi
  done

  # src/__tests__/ 루트 테스트 폴더
  for ext in ts tsx js jsx; do
    if [ -f "${ROOT}/src/__tests__/${base}.test.${ext}" ]; then
      return 0
    fi
  done

  return 1
}

# tdd_needs_test <경로> — 테스트가 필요한데 없으면 0.
tdd_needs_test() {
  tdd_exempt "$1" && return 1
  tdd_has_test "$1" && return 1
  return 0
}

# tdd_module_name <경로> — 확장자를 뗀 모듈명.
tdd_module_name() {
  basename "$1" | sed -E 's/\.(ts|tsx|js|jsx)$//'
}
