-- PostHog error tracking alert 웹훅(`/api/oncall/alert`)의 멱등 키입니다.
-- 핸들러가 CI에 위임하기 전에 event_id를 먼저 넣고, 재전송은 기본 키 충돌로 걸러냅니다.
-- 사용자 데이터가 아닙니다 — 이슈 이름·예외 메시지는 저장하지 않습니다(PostHog에서 직접 읽습니다).
create table public.oncall_alert_events (
  event_id uuid primary key,
  kind text not null check (kind in (
    '$error_tracking_issue_created',
    '$error_tracking_issue_reopened',
    '$error_tracking_issue_spiking'
  )),
  issue_id uuid not null,
  received_at timestamptz not null default now()
);

-- RLS를 켜고 정책은 두지 않습니다. 서버의 service role만 읽고 씁니다.
alter table public.oncall_alert_events enable row level security;
revoke all on table public.oncall_alert_events from public, anon, authenticated;
grant all on table public.oncall_alert_events to service_role;
