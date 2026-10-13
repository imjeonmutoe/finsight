// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { runBaseline, runJudgeProbe, runSuite } from "./run";
import type { Deps } from "./run";
import { wrongAnswer } from "./lib";
import type { Case } from "./lib";

const CLAUDE_MD = "- CRITICAL: 비밀키에 NEXT_PUBLIC_ 접두사를 붙이지 않는다.\n";
const reviewCase: Case = { id: "v", track: "review", expect: "violation", rule: "비밀키", input: "코드" };
const qaCase: Case = { id: "q", track: "qa", must: ["사실"], mustNot: [], falsePremise: false, input: "질문" };

function deps(overrides: Partial<Deps> = {}): Deps {
  return {
    answer: vi.fn(async () => "응답"),
    judge: vi.fn(async () => ({ pass: true, reason: "충족" })),
    ...overrides,
  };
}

describe("runSuite", () => {
  it("트랙에 맞는 시스템 프롬프트로 응답을 받고 채점한다", async () => {
    const d = deps();
    const results = await runSuite([reviewCase, qaCase], CLAUDE_MD, d);

    expect(results).toEqual([
      { id: "v", track: "review", status: "pass", reason: "충족" },
      { id: "q", track: "qa", status: "pass", reason: "충족" },
    ]);
    expect(d.answer).toHaveBeenNthCalledWith(1, expect.stringContaining("리뷰어"), "코드");
    expect(d.answer).toHaveBeenNthCalledWith(2, expect.stringContaining(CLAUDE_MD), "질문");
    expect(d.judge).toHaveBeenCalledWith(expect.any(String), expect.stringContaining("응답"));
  });

  it("채점자가 fail을 주면 fail", async () => {
    const results = await runSuite([qaCase], CLAUDE_MD, deps({
      judge: async () => ({ pass: false, reason: "누락" }),
    }));
    expect(results[0]).toMatchObject({ status: "fail", reason: "누락" });
  });

  it("응답·채점 호출이 던지면 error로 남기고 나머지 케이스는 계속 돈다", async () => {
    const results = await runSuite([reviewCase, qaCase], CLAUDE_MD, deps({
      answer: async (_system, user) => {
        if (user === "코드") throw new Error("429");
        return "응답";
      },
    }));
    expect(results.map((r) => r.status)).toEqual(["error", "pass"]);
    expect(results[0]?.reason).toContain("429");
  });
});

describe("반증 실행", () => {
  it("runJudgeProbe는 subject를 부르지 않고 틀린 답을 채점자에게 넣는다", async () => {
    const d = deps({ judge: vi.fn(async () => ({ pass: false, reason: "틀림" })) });
    const results = await runJudgeProbe([reviewCase], d);
    expect(d.answer).not.toHaveBeenCalled();
    expect(d.judge).toHaveBeenCalledWith(expect.any(String), expect.stringContaining(wrongAnswer(reviewCase)));
    expect(results[0]).toMatchObject({ id: "v", status: "fail" });
  });

  it("runBaseline은 CLAUDE.md 없는 프롬프트로 답을 받는다", async () => {
    const d = deps();
    await runBaseline([reviewCase, qaCase], d);
    for (const [system] of vi.mocked(d.answer).mock.calls) {
      expect(system).not.toContain("NEXT_PUBLIC_");
      expect(system).not.toContain("CRITICAL");
    }
  });
});
