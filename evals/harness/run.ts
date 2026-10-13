// 하네스 eval 회귀 게이트. golden set을 subject(Sonnet)에 돌리고 Opus가 pass/fail을 채점한다.
// 하나라도 fail·error면 exit 1. 네트워크·비용이 드므로 npm test가 아니라 npm run eval로만 돈다.
//
//   npm run eval                 # 회귀 게이트
//   npm run eval -- --falsify    # 반증: 채점자가 틀린 답을 거르는지, 케이스가 CLAUDE.md 없이도 통과하는지

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import {
  JUDGE_SYSTEM, baselineSystemPrompt, checkBalance, exitCode, falsify, falsifyExitCode, judgePrompt,
  parseCase, qaSystemPrompt, reviewSystemPrompt, summarize, wrongAnswer,
} from "./lib";
import type { Case, Result } from "./lib";
import { renderFalsifyReport, renderReport, reportFileName } from "./report";

// subject와 judge를 다른 모델로 둔다. 같은 모델이 자기 답을 채점하면 같은 맹점을 공유한다.
const SUBJECT_MODEL = "claude-sonnet-5-5";
const JUDGE_MODEL = "claude-opus-5-5";
const MAX_TOKENS = 16000;

const verdictSchema = z.object({ pass: z.boolean(), reason: z.string() });
type Verdict = z.infer<typeof verdictSchema>;

export type Deps = {
  answer(system: string, user: string): Promise<string>;
  judge(system: string, user: string): Promise<Verdict>;
};

async function judgeCase(c: Case, answer: () => Promise<string>, deps: Deps): Promise<Result> {
  try {
    const verdict = await deps.judge(JUDGE_SYSTEM, judgePrompt(c, await answer()));
    return { id: c.id, track: c.track, status: verdict.pass ? "pass" : "fail", reason: verdict.reason };
  } catch (error) {
    return { id: c.id, track: c.track, status: "error", reason: error instanceof Error ? error.message : String(error) };
  }
}

export function runSuite(cases: Case[], claudeMd: string, deps: Deps): Promise<Result[]> {
  return Promise.all(cases.map((c) => judgeCase(c, () => deps.answer(
    c.track === "review" ? reviewSystemPrompt(claudeMd) : qaSystemPrompt(claudeMd), c.input,
  ), deps)));
}

// 하네스 제거: CLAUDE.md 없는 기준선 프롬프트로 같은 케이스를 돌린다.
export function runBaseline(cases: Case[], deps: Deps): Promise<Result[]> {
  return Promise.all(cases.map((c) => judgeCase(c, () => deps.answer(baselineSystemPrompt(c.track), c.input), deps)));
}

// 채점자 반증: subject 없이 틀린 답을 바로 채점자에게 넣는다.
export function runJudgeProbe(cases: Case[], deps: Deps): Promise<Result[]> {
  return Promise.all(cases.map((c) => judgeCase(c, async () => wrongAnswer(c), deps)));
}

function textOf(response: Anthropic.Message): string {
  // refusal·max_tokens로 끊긴 응답을 채점하면 결과가 우연에 달린다. error로 남긴다.
  if (response.stop_reason !== "end_turn") throw new Error(`${response.model} stop_reason=${response.stop_reason}`);
  return response.content.filter((block) => block.type === "text").map((block) => block.text).join("");
}

function liveDeps(client: Anthropic): Deps {
  return {
    async answer(system, user) {
      // Sonnet 5.5는 temperature 기본값 외를 400으로 거절한다. 경량 리뷰어답게 effort를 낮춘다.
      return textOf(await client.messages.create({
        model: SUBJECT_MODEL, max_tokens: MAX_TOKENS, system,
        messages: [{ role: "user", content: user }],
        output_config: { effort: "low" },
      }));
    },
    async judge(system, user) {
      // Opus 5.5의 effort 기본값은 medium이다. 채점은 정확도가 우선이라 high로 올린다.
      const text = textOf(await client.messages.create({
        model: JUDGE_MODEL, max_tokens: MAX_TOKENS, system,
        messages: [{ role: "user", content: user }],
        output_config: { effort: "high", format: zodOutputFormat(verdictSchema) },
      }));
      return verdictSchema.parse(JSON.parse(text));
    },
  };
}

async function main(): Promise<void> {
  const casesDir = fileURLToPath(new URL("./cases/", import.meta.url));
  const claudeMd = readFileSync(fileURLToPath(new URL("../../CLAUDE.md", import.meta.url)), "utf8");
  const cases = readdirSync(casesDir).filter((name) => name.endsWith(".md")).sort()
    .map((name) => parseCase(name, readFileSync(casesDir + name, "utf8")));

  const problems = checkBalance(cases);
  if (problems.length > 0) {
    console.error(`golden set 균형이 깨졌습니다:\n${problems.join("\n")}`);
    process.exit(1);
  }

  const startedAt = new Date();
  const deps = liveDeps(new Anthropic());
  const meta = { startedAt, subjectModel: SUBJECT_MODEL, judgeModel: JUDGE_MODEL };
  let html: string;
  let code: 0 | 1;

  if (process.argv.includes("--falsify")) {
    const [probe, baseline] = await Promise.all([runJudgeProbe(cases, deps), runBaseline(cases, deps)]);
    const f = falsify(cases, probe, baseline);
    console.log("[채점자 반증] 틀린 답에 fail이 나와야 정상");
    for (const r of probe) console.log(`${r.status.padEnd(5)} ${r.id}  ${r.reason}`);
    console.log("\n[하네스 제거] CLAUDE.md 없이 통과하면 그 케이스는 하네스를 재지 못한다");
    for (const r of baseline) console.log(`${r.status.padEnd(5)} ${r.id}  ${r.reason}`);
    console.log(`\n채점자 누수 ${f.judgeLeaks.length}/${f.probeTotal} · 하네스 무관 ${f.harnessFree.length}/${baseline.length}`
      + ` · 에러 ${f.errors.length}`);
    html = renderFalsifyReport(cases, probe, baseline, meta);
    code = falsifyExitCode(f);
  } else {
    const results = await runSuite(cases, claudeMd, deps);
    const summary = summarize(results);
    for (const r of results) console.log(`${r.status.padEnd(5)} ${r.id}  ${r.reason}`);
    console.log(`\nreview ${summary.byTrack.review.passed}/${summary.byTrack.review.total} · `
      + `qa ${summary.byTrack.qa.passed}/${summary.byTrack.qa.total} · 전체 ${summary.passed}/${summary.total}`);
    html = renderReport(cases, results, meta);
    code = exitCode(summary);
  }

  // 실패한 실행일수록 보고서가 필요하므로 결과와 상관없이 매번 쓴다. 공개 리포라 커밋하지 않는다(.gitignore).
  const reportDir = fileURLToPath(new URL("../../.evals/", import.meta.url));
  const reportPath = reportDir + reportFileName(startedAt, process.argv.includes("--falsify") ? "falsify" : undefined);
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(reportPath, html);
  console.log(`보고서: ${reportPath}`);
  process.exit(code);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
