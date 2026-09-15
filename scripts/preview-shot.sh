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
# macOS의 최소 창 너비 때문에 --window-size가 이 아래로는 줄어들지 않는다. 그런데도 Chrome은
# 요청한 폭으로 PNG를 잘라 내놓기 때문에, 넓은 뷰포트로 그려진 레이아웃의 크롭이 좁은 화면인
# 것처럼 보인다. 실제로 450px 요청에도 카드가 오른쪽 여백 없이 잘려 나와 없는 오버플로가 있는
# 것처럼 읽혔다. 조용히 틀린 근거를 만드느니 거부한다.
MIN_WIDTH=500

if [ ! -x "$CHROME" ]; then
  echo "Chrome을 찾지 못했습니다: $CHROME" >&2
  echo "육안 검증을 건너뛰지 말고, 사용자에게 직접 확인을 요청하십시오." >&2
  exit 1
fi

if [ "$WIDTH" -lt "$MIN_WIDTH" ]; then
  echo "폭 ${WIDTH}px는 이 스크립트로 검증할 수 없습니다 (최소 ${MIN_WIDTH}px)." >&2
  echo "headless Chrome이 창을 그보다 좁게 만들지 못해, 넓게 그린 화면을 잘라낸 PNG가 나옵니다." >&2
  echo "폰 폭은 브라우저 자동화 도구의 기기 에뮬레이션(Emulation.setDeviceMetricsOverride)으로" >&2
  echo "확인하거나, 사용자에게 직접 확인을 요청하십시오." >&2
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
