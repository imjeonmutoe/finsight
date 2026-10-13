// 하네스 eval 회귀 게이트. golden set을 subject(Sonnet)에 돌리고 Opus가 pass/fail을 채점한다.
// 하나라도 fail·error면 exit 1. 네트워크·비용이 드므로 npm test가 아니라 npm run eval로만 돈다.
//
//   npm run eval

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import {
  JUDGE_SYSTEM, checkBalance, exitCode, judgePrompt, parseCase, qaSystemPrompt,
  reviewSystemPrompt, summarize,
} from "./lib";
import type { Case, Result } from "./lib";

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

async function runCase(c: Case, claudeMd: string, deps: Deps): Promise<Result> {
  try {
    const system = c.track === "review" ? reviewSystemPrompt(claudeMd) : qaSystemPrompt(claudeMd);
    const answer = await deps.answer(system, c.input);
    const verdict = await deps.judge(JUDGE_SYSTEM, judgePrompt(c, answer));
    return { id: c.id, track: c.track, status: verdict.pass ? "pass" : "fail", reason: verdict.reason };
  } catch (error) {
    return { id: c.id, track: c.track, status: "error", reason: error instanceof Error ? error.message : String(error) };
  }
}

export function runSuite(cases: Case[], claudeMd: string, deps: Deps): Promise<Result[]> {
  return Promise.all(cases.map((c) => runCase(c, claudeMd, deps)));
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

  const results = await runSuite(cases, claudeMd, liveDeps(new Anthropic()));
  const summary = summarize(results);
  for (const r of results) console.log(`${r.status.padEnd(5)} ${r.id}  ${r.reason}`);
  console.log(`\nreview ${summary.byTrack.review.passed}/${summary.byTrack.review.total} · `
    + `qa ${summary.byTrack.qa.passed}/${summary.byTrack.qa.total} · 전체 ${summary.passed}/${summary.total}`);
  process.exit(exitCode(summary));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
