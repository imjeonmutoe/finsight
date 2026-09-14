#!/bin/bash
# 프로덕션 빌드를 띄우고 headless Chrome으로 스크린샷을 찍는다.
# UI를 만지는 step의 육안 검증용. 에이전트 세션은 출력된 PNG 경로를 열어 직접 확인한다.
#
# 사용법:
#   bash scripts/preview-shot.sh [경로] [폭] [높이]
#   bash scripts/preview-shot.sh                       # / 를 1440x2100으로
#   bash scripts/preview-shot.sh /dashboard 1440 3000
#
# 브라우저 자동화 도구(예: Claude의 claude-in-chrome 확장)가 붙어 있으면 그쪽이 더 낫다.
# 이 스크립트는 그런 도구 없이도 육안 검증을 건너뛰지 않기 위한 fallback이라,
# codex·claude 어느 쪽에서 돌리든 동작한다.

set -euo pipefail

ROUTE="${1:-/}"
WIDTH="${2:-1440}"
HEIGHT="${3:-2100}"
PORT="${PORT:-3210}"
OUT="${OUT:-/tmp/finsight-preview.png}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [ ! -x "$CHROME" ]; then
  echo "Chrome을 찾지 못했습니다: $CHROME" >&2
  echo "육안 검증을 건너뛰지 말고, 사용자에게 직접 확인을 요청하십시오." >&2
  exit 1
fi

npm run build >/dev/null

PORT="$PORT" npm run start -- --port "$PORT" >/tmp/finsight-preview-server.log 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

for _ in $(seq 1 40); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT$ROUTE" || true)" = "200" ]; then
    break
  fi
  sleep 1
done

if [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT$ROUTE" || true)" != "200" ]; then
  echo "서버가 뜨지 않았습니다. 로그: /tmp/finsight-preview-server.log" >&2
  exit 1
fi

"$CHROME" --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
  --virtual-time-budget=6000 --window-size="$WIDTH,$HEIGHT" \
  --screenshot="$OUT" "http://localhost:$PORT$ROUTE" >/dev/null 2>&1

echo "$OUT"
