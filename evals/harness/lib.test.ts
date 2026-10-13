// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  checkBalance, criticalRules, exitCode, judgePrompt, parseCase, parseFrontmatter,
  qaSystemPrompt, reviewSystemPrompt, summarize,
} from "./lib";
import type { Case, Result } from "./lib";

const CASES_DIR = fileURLToPath(new URL("./cases/", import.meta.url));
const CLAUDE_MD = readFileSync(fileURLToPath(new URL("../../CLAUDE.md", import.meta.url)), "utf8");

const review = (id: string, expect: "violation" | "pass", rule?: string): Case =>
  ({ id, track: "review", expect, ...(rule ? { rule } : {}), input: "코드" });
const qa = (id: string, falsePremise = false): Case =>
  ({ id, track: "qa", must: ["사실"], mustNot: [], falsePremise, input: "질문" });

describe("parseFrontmatter", () => {
  it("스칼라·리스트·본문을 나눈다", () => {
    const text = "---\nid: a\nmust:\n  - 첫째\n  - \"둘째: 콜론\"\nflag: true\n---\n\n본문 줄\n";
    expect(parseFrontmatter(text)).toEqual({
      data: { id: "a", must: ["첫째", "둘째: 콜론"], flag: "true" },
      body: "본문 줄",
    });
  });

  it("frontmatter가 없으면 에러", () => {
    expect(() => parseFrontmatter("본문만")).toThrow("frontmatter");
  });
});

describe("parseCase", () => {
  it("review 케이스를 읽는다", () => {
    const text = "---\nid: review-x\ntrack: review\nexpect: violation\nrule: 비밀키 접두사\n---\n```ts\nx\n```";
    expect(parseCase("review-x.md", text)).toEqual({
      id: "review-x", track: "review", expect: "violation", rule: "비밀키 접두사", input: "```ts\nx\n```",
    });
  });

  it("qa 케이스를 읽고 must_not·false_premise 기본값을 채운다", () => {
    const text = "---\nid: qa-x\ntrack: qa\nmust:\n  - 사실\n---\n질문?";
    expect(parseCase("qa-x.md", text)).toEqual({
      id: "qa-x", track: "qa", must: ["사실"], mustNot: [], falsePremise: false, input: "질문?",
    });
  });

  it.each([
    ["id가 파일명과 다르면", "---\nid: other\ntrack: qa\nmust:\n  - a\n---\n질문", "파일명"],
    ["track이 이상하면", "---\nid: x\ntrack: perf\n---\n본문", "track"],
    ["expect가 이상하면", "---\nid: x\ntrack: review\nexpect: maybe\n---\n본문", "expect"],
    ["violation에 rule이 없으면", "---\nid: x\ntrack: review\nexpect: violation\n---\n본문", "rule"],
    ["qa에 must가 없으면", "---\nid: x\ntrack: qa\n---\n질문", "must"],
    ["본문이 비면", "---\nid: x\ntrack: qa\nmust:\n  - a\n---\n", "본문"],
  ])("%s 에러", (_label, text, message) => {
    expect(() => parseCase("x.md", text)).toThrow(message);
  });
});

describe("checkBalance", () => {
  const balanced = [
    review("v1", "violation", "r1"), review("v2", "violation", "r2"),
    review("v3", "violation", "r3"), review("v4", "violation", "r4"),
    review("p1", "pass"), qa("q1"), qa("q2", true),
  ];

  it("균형이 맞으면 문제 없음", () => {
    expect(checkBalance(balanced)).toEqual([]);
  });

  it("위반 케이스가 4개 미만이면 지적", () => {
    expect(checkBalance(balanced.filter((c) => c.id !== "v4"))).toEqual([
      expect.stringContaining("violation"),
    ]);
  });

  it("오탐 방지 정상 케이스가 없으면 지적", () => {
    expect(checkBalance(balanced.filter((c) => c.id !== "p1"))).toEqual([
      expect.stringContaining("pass"),
    ]);
  });

  it("틀린 전제 가드가 없으면 지적", () => {
    expect(checkBalance(balanced.filter((c) => c.id !== "q2"))).toEqual([
      expect.stringContaining("false_premise"),
    ]);
  });

  it("id가 겹치거나 같은 rule을 두 번 노리면 지적", () => {
    const problems = checkBalance([...balanced, review("v1", "violation", "r1")]);
    expect(problems).toEqual(expect.arrayContaining([
      expect.stringContaining("중복 id"), expect.stringContaining("중복 rule"),
    ]));
  });
});

describe("golden set 무결성", () => {
  const files = readdirSync(CASES_DIR).filter((name) => name.endsWith(".md"));
  const cases = files.map((name) => parseCase(name, readFileSync(CASES_DIR + name, "utf8")));

  it("모든 케이스가 파싱되고 균형 규칙을 지킨다", () => {
    expect(cases.length).toBe(files.length);
    expect(checkBalance(cases)).toEqual([]);
  });
});

describe("프롬프트", () => {
  it("CRITICAL 규칙만 뽑고 '이유:' 이하와 굵게 표시를 걷어낸다", () => {
    const md = "- 일반 규칙\n- CRITICAL: **A**를 한다. 이유: 길다.\n- CRITICAL: B를 한다.\n";
    expect(criticalRules(md)).toEqual(["A를 한다.", "B를 한다."]);
  });

  it("실제 CLAUDE.md에서 CRITICAL 규칙이 뽑힌다", () => {
    // 형식이 바뀌어 0개가 되면 리뷰어 시스템 프롬프트가 조용히 비어 버린다.
    const rules = criticalRules(CLAUDE_MD);
    expect(rules.length).toBeGreaterThanOrEqual(20);
    expect(rules.every((rule) => !rule.includes("이유:"))).toBe(true);
  });

  it("리뷰어 프롬프트는 요약 규칙을 담고 CLAUDE.md 원문은 담지 않는다", () => {
    const prompt = reviewSystemPrompt(CLAUDE_MD);
    expect(prompt).toContain("NEXT_PUBLIC_");
    expect(prompt).not.toContain("### TDD 가드가 두 겹인 이유");
  });

  it("응답자 프롬프트는 CLAUDE.md 전문을 담는다", () => {
    expect(qaSystemPrompt(CLAUDE_MD)).toContain(CLAUDE_MD);
  });

  it("채점 프롬프트는 케이스 라벨과 응답을 담는다", () => {
    const violation = judgePrompt(review("v", "violation", "로그 금지"), "응답A");
    expect(violation).toContain("로그 금지");
    expect(violation).toContain("응답A");
    const pass = judgePrompt(review("p", "pass"), "응답B");
    expect(pass).toContain("위반이 없는");
    const question: Case = { id: "q", track: "qa", must: ["M1"], mustNot: ["N1"], falsePremise: true, input: "질문" };
    const prompt = judgePrompt(question, "응답C");
    expect(prompt).toContain("M1");
    expect(prompt).toContain("N1");
    expect(prompt).toContain("전제");
  });
});

describe("summarize / exitCode", () => {
  const results: Result[] = [
    { id: "a", track: "review", status: "pass", reason: "" },
    { id: "b", track: "qa", status: "fail", reason: "누락" },
    { id: "c", track: "qa", status: "error", reason: "429" },
  ];

  it("트랙별로 집계하고 실패·에러를 모은다", () => {
    const summary = summarize(results);
    expect(summary.total).toBe(3);
    expect(summary.passed).toBe(1);
    expect(summary.failed.map((r) => r.id)).toEqual(["b", "c"]);
    expect(summary.byTrack).toEqual({ review: { total: 1, passed: 1 }, qa: { total: 2, passed: 0 } });
  });

  it("전부 통과일 때만 0, 에러도 실패로 본다", () => {
    expect(exitCode(summarize(results.slice(0, 1)))).toBe(0);
    expect(exitCode(summarize(results))).toBe(1);
    expect(exitCode(summarize([results[2]!]))).toBe(1);
  });

  it("케이스가 0개면 통과로 치지 않는다", () => {
    expect(exitCode(summarize([]))).toBe(1);
  });
});
