// eval 결과를 브라우저로 여는 단일 HTML로 그린다. 순수 함수이고 파일 쓰기는 run.ts가 한다.
// 채점 이유는 LLM 출력이라 임의 문자열이 섞일 수 있다. 모든 값은 esc()를 거친다.

import { exitCode, summarize } from "./lib";
import type { Case, Result, Track } from "./lib";

export type ReportMeta = { startedAt: Date; subjectModel: string; judgeModel: string };

const STATUS_LABEL: Record<Result["status"], string> = { pass: "통과", fail: "실패", error: "에러" };
const TRACK_TITLE: Record<Track, string> = {
  review: "review: 경량 리뷰어가 규칙 위반을 잡는가",
  qa: "qa: CLAUDE.md만 보고 코드베이스 질문에 맞게 답하는가",
};

function esc(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function list(items: string[]): string {
  return `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`;
}

function label(c: Case | undefined): string {
  if (!c) return '<span class="muted">케이스 없음</span>';
  if (c.track === "review") {
    return c.expect === "violation"
      ? `<span class="chip label">위반</span><div class="muted">${esc(c.rule ?? "")}</div>`
      : '<span class="chip label">정상</span><div class="muted">오탐 방지</div>';
  }
  const premise = c.falsePremise ? '<span class="chip label">틀린 전제</span>' : "";
  const mustNot = c.mustNot.length > 0 ? `<div class="sub">must_not</div>${list(c.mustNot)}` : "";
  return `${premise}<div class="sub">must</div>${list(c.must)}${mustNot}`;
}

function rows(results: Result[], byId: Map<string, Case>): string {
  return results.map((r) => `<tr class="${r.status}">
  <td class="id">${esc(r.id)}</td>
  <td>${label(byId.get(r.id))}</td>
  <td><span class="chip ${r.status}">${STATUS_LABEL[r.status]}</span></td>
  <td class="reason">${esc(r.reason)}</td>
</tr>`).join("\n");
}

export function reportFileName(startedAt: Date): string {
  return `harness-${startedAt.toISOString().replace(/\.\d{3}Z$/, "Z").replaceAll("-", "").replaceAll(":", "")}.html`;
}

export function renderReport(cases: Case[], results: Result[], meta: ReportMeta): string {
  const summary = summarize(results);
  const ok = exitCode(summary) === 0;
  const byId = new Map(cases.map((c) => [c.id, c]));
  const tracks = (["review", "qa"] as const).filter((track) => summary.byTrack[track].total > 0);
  const when = meta.startedAt.toISOString().replace(/\.\d{3}Z$/, "Z");

  const tiles = tracks.map((track) => `<div class="tile"><span class="muted">${track}</span>
  <span class="num">${summary.byTrack[track].passed}/${summary.byTrack[track].total}</span></div>`).join("");
  const sections = tracks.map((track) => `<section>
  <h2>${TRACK_TITLE[track]}</h2>
  <div class="table-wrap"><table>
    <colgroup><col class="c-id"><col><col class="c-status"><col class="c-reason"></colgroup>
    <thead><tr><th>케이스</th><th>정답 라벨</th><th>결과</th><th>채점 이유</th></tr></thead>
    <tbody>${rows(results.filter((r) => r.track === track), byId)}</tbody>
  </table></div>
</section>`).join("\n");

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>하네스 eval ${esc(when)}</title>
<style>
:root {
  --bg: #f6f7f5; --surface: #ffffff; --fg: #1b2420; --muted: #5d6b64; --line: #dde3df;
  --pass: #1f7a4d; --pass-bg: #e3f2ea; --fail: #b3261e; --fail-bg: #fbe4e2; --error: #8a5a00; --error-bg: #fbf0d9;
  --sans: "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif;
  --mono: ui-monospace, "SF Mono", Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root {
  --bg: #121815; --surface: #1a221e; --fg: #e4ebe7; --muted: #9aa8a1; --line: #2c3732;
  --pass: #7fd3a6; --pass-bg: #1d3328; --fail: #f2a29b; --fail-bg: #3d1f1c; --error: #f0c46a; --error-bg: #3a2e14;
  color-scheme: dark; } }
body { margin: 0; background: var(--bg); color: var(--fg); font-family: var(--sans); font-size: 15px; line-height: 1.65;
  word-break: keep-all; overflow-wrap: break-word; }
main { max-width: 1040px; margin: 0 auto; padding-inline: 20px; padding-block: 36px 56px; display: grid; gap: 32px; }
h1, h2 { margin: 0; line-height: 1.3; text-wrap: balance; }
h1 { font-size: 26px; }
h2 { font-size: 18px; }
section, header { display: grid; gap: 12px; }
.muted { color: var(--muted); }
.meta { display: flex; flex-wrap: wrap; gap: 4px 18px; color: var(--muted); font-size: 13.5px; }
code, .id, .num { font-family: var(--mono); }
.score { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.tile { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; display: grid; }
.num { font-size: 28px; font-weight: 600; font-variant-numeric: tabular-nums; }
.tile.gate .num { color: var(--${ok ? "pass" : "fail"}); }
.table-wrap { overflow-x: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; }
table { width: 100%; border-collapse: collapse; min-width: 760px; table-layout: fixed; }
col.c-id { width: 230px; } col.c-status { width: 64px; } col.c-reason { width: 38%; }
th, td { text-align: left; vertical-align: top; padding: 12px 14px; border-bottom: 1px solid var(--line); }
tbody tr:last-child td { border-bottom: 0; }
th { font-size: 12.5px; font-weight: 500; color: var(--muted); background: var(--bg); }
tr.fail td:first-child { box-shadow: inset 3px 0 var(--fail); }
tr.error td:first-child { box-shadow: inset 3px 0 var(--error); }
.id { font-size: 13px; overflow-wrap: anywhere; }
.reason { font-size: 14px; }
.sub { font-size: 12px; color: var(--muted); margin-top: 4px; }
ul { margin: 0; padding-left: 18px; font-size: 13.5px; }
.chip { display: inline-block; font-size: 12px; padding: 1px 8px; border-radius: 999px; white-space: nowrap; font-weight: 500; }
.chip.pass { color: var(--pass); background: var(--pass-bg); }
.chip.fail { color: var(--fail); background: var(--fail-bg); }
.chip.error { color: var(--error); background: var(--error-bg); }
.chip.label { color: var(--muted); border: 1px solid var(--line); }
</style>
</head>
<body>
<main>
<header>
  <h1>FinSight 하네스 eval 결과</h1>
  <div class="meta">
    <span>${esc(when)}</span>
    <span>응답 <code>${esc(meta.subjectModel)}</code></span>
    <span>채점 <code>${esc(meta.judgeModel)}</code></span>
  </div>
</header>
<div class="score">
  <div class="tile gate"><span class="muted">전체 · ${ok ? "게이트 통과" : "게이트 실패"}</span>
  <span class="num">${summary.passed}/${summary.total}</span></div>
  ${tiles}
</div>
${sections}
</main>
</body>
</html>
`;
}
