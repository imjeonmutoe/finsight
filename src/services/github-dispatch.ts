import "server-only";

// 이 리포의 워크플로우 하나만 깨웁니다. `repository_dispatch`가 아니라 `workflow_dispatch`인 이유는
// 토큰 권한입니다 — 전자는 Contents: write(= 코드 푸시)가, 후자는 Actions: write만 필요합니다.
// 토큰은 이 리포에만 Actions: write를 준 fine-grained PAT입니다.
const DISPATCH_URL =
  "https://api.github.com/repos/imjeonmutoe/finsight/actions/workflows/oncall-alert.yml/dispatches";

export type OncallAlertKind =
  | "$error_tracking_issue_created"
  | "$error_tracking_issue_reopened"
  | "$error_tracking_issue_spiking";

export type OncallAlert = {
  eventId: string;
  kind: OncallAlertKind;
  issueId: string;
  currentBucketValue: number | null;
  computedBaseline: number | null;
};

/**
 * `.github/workflows/oncall-alert.yml`을 깨웁니다. 서버리스는 `claude -p`를 띄울 수 없으므로
 * 분석은 CI가 합니다. 이슈 이름·예외 메시지는 넘기지 않습니다 — CI가 PostHog에서 직접 읽습니다.
 */
export async function dispatchOncallAlert(alert: OncallAlert): Promise<void> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) throw new Error("GITHUB_DISPATCH_TOKEN 환경변수가 없습니다.");

  const response = await fetch(DISPATCH_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
    },
    // workflow_dispatch 입력은 문자열만 받습니다. 없는 값은 빈 문자열입니다.
    body: JSON.stringify({
      ref: "main",
      inputs: {
        event_id: alert.eventId,
        kind: alert.kind,
        issue_id: alert.issueId,
        current_bucket_value: alert.currentBucketValue === null ? "" : String(alert.currentBucketValue),
        computed_baseline: alert.computedBaseline === null ? "" : String(alert.computedBaseline),
      },
    }),
  });
  // 오류 본문을 싣지 않습니다. 상태 코드만으로 원인(401 토큰·404 권한)을 가를 수 있습니다.
  if (!response.ok) throw new Error(`GitHub workflow_dispatch 요청이 ${response.status}로 실패했습니다.`);
}
