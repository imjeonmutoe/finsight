#!/bin/bash
# 프로덕션 배포. `vercel deploy --prod`를 리포에서 직접 돌리지 않는 이유가 두 가지 있다.
#
# 1) gitForkProtection. 리포에 `.git`이 있으면 CLI가 커밋 메타데이터를 함께 올리고,
#    Vercel 프로젝트가 Git 연결 없이(link: null) 이 보호를 켜 둔 상태라 배포가
#    BLOCKED된다("the commit author doesn't have permission"). 대시보드에서 상태를
#    보지 않으면 UNKNOWN으로만 보여 원인을 찾기 어렵다. `.git`이 없는 사본에서
#    올리면 CLI가 git 메타데이터를 붙이지 않아 이 검사를 타지 않는다.
#
# 2) CLI는 `.gitignore`를 따르지 않는다. `.vercelignore`가 없으면 작업 디렉토리가
#    통째로 올라간다 — 실제로 첫 배포에 `.env`가 그대로 올라가 시크릿 5개를 전부
#    재발급해야 했다. 그래서 아래에서 `.vercelignore` 존재를 먼저 확인하고,
#    복사 단계에서도 `.env*`를 한 번 더 뺀다. 두 겹이 동시에 무너져야 사고가 난다.
#
# 사용법:
#   bash scripts/deploy.sh
#
# 배포 전 `npm run lint && npm run build && npm run test`가 통과하는지 확인할 것.
# 여기서 다시 돌리지 않는 이유: 빌드가 깨지면 Vercel이 실패한 배포를 프로덕션으로
# 승격하지 않으므로, 로컬에서 한 번 더 도는 시간만큼만 손해다.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ ! -f .vercelignore ]; then
  echo ".vercelignore가 없습니다. 이 파일 없이 배포하면 .env가 업로드됩니다." >&2
  exit 1
fi

if [ ! -f .vercel/project.json ]; then
  echo ".vercel/project.json이 없습니다. 먼저 'vercel link'로 프로젝트를 연결하십시오." >&2
  exit 1
fi

# 무엇을 올리는지 남긴다. 프로덕션 배포라 나중에 "그때 뭐가 올라갔지"를 되짚을 일이 생긴다.
echo "커밋:   $(git rev-parse --short HEAD) $(git log -1 --pretty=%s)"
DIRTY="$(git status --porcelain | wc -l | tr -d ' ')"
if [ "$DIRTY" != "0" ]; then
  echo "주의:   커밋되지 않은 변경 ${DIRTY}건이 함께 배포됩니다"
  git status --porcelain | sed 's/^/        /'
fi

STAGE="$(mktemp -d)"
trap 'chmod -R u+w "$STAGE" 2>/dev/null; command rm -r -f "$STAGE"' EXIT

# `.vercel/`은 프로젝트 연결 정보라 반드시 따라가야 한다(CLI가 업로드에서는 알아서 뺀다).
# node_modules·.next는 Vercel이 원격에서 새로 만들므로 복사 시간만 잡아먹는다.
rsync -a \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude '.next/' \
  --exclude '.env' \
  --exclude '.env.*' \
  "$ROOT"/ "$STAGE"/

# 복사 제외가 뚫렸는지 직접 확인한다. 조건을 믿지 않고 결과를 본다.
LEAKED="$(find "$STAGE" -maxdepth 2 \( -name '.env' -o -name '.env.*' \) | head -5)"
if [ -n "$LEAKED" ]; then
  echo "복사본에 환경파일이 남아 있습니다. 배포를 중단합니다:" >&2
  echo "$LEAKED" >&2
  exit 1
fi

cd "$STAGE"
vercel deploy --prod --yes
