// eval 결과를 브라우저로 여는 단일 HTML로 그린다. 순수 함수이고 파일 쓰기는 run.ts가 한다.
// 채점 이유는 LLM 출력이라 임의 문자열이 섞일 수 있다. 모든 값은 esc()를 거친다.

import { exitCode, falsify, falsifyExitCode, summarize, wrongAnswer } from "./lib";
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

type Chip = { cls: string; text: string };
const statusChip = (r: Result): Chip => ({ cls: r.status, text: STATUS_LABEL[r.status] });

function rows(results: Result[], second: (r: Result) => string, chip: (r: Result) => Chip): string {
  return results.map((r) => {
    const { cls, text } = chip(r);
    return `<tr class="${cls}">
  <td class="id">${esc(r.id)}</td>
  <td>${second(r)}</td>
  <td><span class="chip ${cls}">${text}</span></td>
  <td class="reason">${esc(r.reason)}</td>
</tr>`;
  }).join("\n");
}

function table(heads: [string, string], body: string): string {
  return `<div class="table-wrap"><table>
    <colgroup><col class="c-id"><col><col class="c-status"><col class="c-reason"></colgroup>
    <thead><tr><th>케이스</th><th>${heads[0]}</th><th>결과</th><th>${heads[1]}</th></tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

function tile(title: string, value: string, tone = ""): string {
  return `<div class="tile ${tone}"><span class="muted">${title}</span><span class="num">${value}</span></div>`;
}

const stamp = (d: Date): string => d.toISOString().replace(/\.\d{3}Z$/, "Z");

export function reportFileName(startedAt: Date, kind?: "falsify"): string {
  return `harness-${kind ? `${kind}-` : ""}${stamp(startedAt).replaceAll("-", "").replaceAll(":", "")}.html`;
}

export function renderReport(cases: Case[], results: Result[], meta: ReportMeta): string {
  const summary = summarize(results);
  const ok = exitCode(summary) === 0;
  const byId = new Map(cases.map((c) => [c.id, c]));
  const tracks = (["review", "qa"] as const).filter((track) => summary.byTrack[track].total > 0);

  const tiles = tile(`전체 · ${ok ? "게이트 통과" : "게이트 실패"}`, `${summary.passed}/${summary.total}`, ok ? "good" : "bad")
    + tracks.map((track) => tile(track, `${summary.byTrack[track].passed}/${summary.byTrack[track].total}`)).join("");
  const sections = tracks.map((track) => `<section>
  <h2>${TRACK_TITLE[track]}</h2>
  ${table(["정답 라벨", "채점 이유"], rows(results.filter((r) => r.track === track), (r) => label(byId.get(r.id)), statusChip))}
</section>`).join("\n");
  return page("FinSight 하네스 eval 결과", meta, `<div class="score">${tiles}</div>\n${sections}`);
}

export function renderFalsifyReport(cases: Case[], probe: Result[], baseline: Result[], meta: ReportMeta): string {
  const f = falsify(probe, baseline);
  const ok = falsifyExitCode(f) === 0;
  const byId = new Map(cases.map((c) => [c.id, c]));
  const injected = (r: Result): string => {
    const c = byId.get(r.id);
    return c ? esc(wrongAnswer(c)) : "";
  };
  // 반증에서는 '실패'가 기대한 결과다. 칩은 판정이 아니라 기대와 맞았는지를 말한다.
  const probeChip = (r: Result): Chip => r.status === "fail" ? { cls: "pass", text: "정상(fail)" }
    : r.status === "pass" ? { cls: "fail", text: "채점자 누수" } : statusChip(r);
  const baselineChip = (r: Result): Chip => r.status === "fail" ? { cls: "pass", text: "하네스 필요" }
    : r.status === "pass" ? { cls: "error", text: "하네스 무관" } : statusChip(r);
  const leaksOk = probe.length - f.judgeLeaks.length;

  const tiles = tile(ok ? "게이트 통과" : "게이트 실패", `${leaksOk}/${probe.length}`, ok ? "good" : "bad")
    + tile("하네스 무관 케이스", `${f.harnessFree.length}/${baseline.length}`, f.harnessFree.length > 0 ? "warn" : "")
    + tile("에러", String(f.errors.length), f.errors.length > 0 ? "bad" : "");
  const body = `<div class="score">${tiles}</div>
<section>
  <h2>채점자 반증: 틀린 답에 fail을 주는가</h2>
  <p class="muted">케이스 기준을 정면으로 어기는 답을 채점자에게 바로 넣었다. 전부 fail이어야 채점을 믿을 수 있다.</p>
  ${table(["넣은 틀린 답", "채점 이유"], rows(probe, injected, probeChip))}
</section>
<section>
  <h2>하네스 제거: CLAUDE.md 없이도 통과하는가</h2>
  <p class="muted">같은 케이스를 CLAUDE.md 규칙 없는 일반 프롬프트로 돌렸다. 그래도 통과한 케이스는 하네스가 아니라 모델의 일반 지식을 잰다. 게이트를 닫지는 않지만 더 프로젝트 고유한 케이스로 바꿀 후보다.</p>
  ${table(["정답 라벨", "채점 이유"], rows(baseline, (r) => label(byId.get(r.id)), baselineChip))}
</section>`;
  return page("FinSight 하네스 eval 반증", meta, body);
}

function page(title: string, meta: ReportMeta, body: string): string {
  const when = stamp(meta.startedAt);
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} ${esc(when)}</title>
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
.tile.good .num { color: var(--pass); } .tile.bad .num { color: var(--fail); } .tile.warn .num { color: var(--error); }
p { margin: 0; max-width: 72ch; }
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
  <h1>${esc(title)}</h1>
  <div class="meta">
    <span>${esc(when)}</span>
    <span>응답 <code>${esc(meta.subjectModel)}</code></span>
    <span>채점 <code>${esc(meta.judgeModel)}</code></span>
  </div>
</header>
${body}
</main>
</body>
</html>
`;
}
