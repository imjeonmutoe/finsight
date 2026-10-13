// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderFalsifyReport, renderReport, reportFileName } from "./report";
import type { Case, Result } from "./lib";

const cases: Case[] = [
  { id: "review-a", track: "review", expect: "violation", rule: "비밀키 접두사", input: "코드" },
  { id: "review-b", track: "review", expect: "pass", input: "코드" },
  { id: "qa-a", track: "qa", must: ["행 번호만"], mustNot: ["원본 로그"], falsePremise: true, input: "질문" },
];
const results: Result[] = [
  { id: "review-a", track: "review", status: "pass", reason: "지적함" },
  { id: "review-b", track: "review", status: "fail", reason: "오탐" },
  { id: "qa-a", track: "qa", status: "error", reason: "429" },
];
const meta = { startedAt: new Date("2026-10-13T02:30:05Z"), subjectModel: "sonnet-x", judgeModel: "opus-x" };

describe("renderReport", () => {
  const html = renderReport(cases, results, meta);

  it("한국어 문서이고 줄바꿈 규칙을 건다", () => {
    expect(html).toContain('<html lang="ko">');
    expect(html).toContain("word-break: keep-all");
  });

  it("집계와 모델·실행 시각을 담는다", () => {
    expect(html).toContain("1/3");
    expect(html).toContain("sonnet-x");
    expect(html).toContain("opus-x");
    expect(html).toContain("2026-10-13T02:30:05");
    expect(html).toContain("게이트 실패");
  });

  it("케이스마다 상태·라벨·이유를 담는다", () => {
    for (const text of ["review-a", "비밀키 접두사", "지적함", "오탐", "행 번호만", "원본 로그", "틀린 전제", "429"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain('class="chip fail"');
    expect(html).toContain('class="chip error"');
  });

  it("전부 통과면 게이트 통과로 적는다", () => {
    const passed = renderReport(cases, results.map((r) => ({ ...r, status: "pass" as const })), meta);
    expect(passed).toContain("게이트 통과");
  });

  it("LLM 출력과 케이스 문자열을 이스케이프한다", () => {
    const evil = renderReport(
      [{ ...cases[0]!, rule: "<b>규칙</b>" } as Case],
      [{ id: "review-a", track: "review", status: "fail", reason: `<script>alert("x")</script> & '` }],
      meta,
    );
    expect(evil).not.toContain("<script>alert");
    expect(evil).not.toContain("<b>규칙</b>");
    expect(evil).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;");
  });
});

describe("reportFileName", () => {
  it("UTC 시각으로 정렬되는 파일명을 만든다", () => {
    expect(reportFileName(meta.startedAt)).toBe("harness-20261013T023005Z.html");
    expect(reportFileName(meta.startedAt, "falsify")).toBe("harness-falsify-20261013T023005Z.html");
  });
});

describe("renderFalsifyReport", () => {
  const probe: Result[] = [
    { id: "review-a", track: "review", status: "fail", reason: "놓쳤다" },
    { id: "review-b", track: "review", status: "pass", reason: "<i>통과시킴</i>" },
  ];
  const baseline: Result[] = [
    { id: "review-a", track: "review", status: "pass", reason: "일반 상식으로 잡음" },
    { id: "qa-a", track: "qa", status: "fail", reason: "모름" },
  ];
  const html = renderFalsifyReport(cases, probe, baseline, meta);

  it("채점자 누수와 하네스 무관 케이스를 구분해 표시한다", () => {
    expect(html).toContain("채점자 누수");
    expect(html).toContain("하네스 무관");
    expect(html).toContain("하네스 필요");
    expect(html).toContain("게이트 실패");
    expect(html).toContain("1/2");
  });

  it("넣은 틀린 답과 이유를 이스케이프해 담는다", () => {
    expect(html).toContain("위반 없음");
    expect(html).toContain("&lt;i&gt;통과시킴&lt;/i&gt;");
    expect(html).not.toContain("<i>통과시킴");
  });
});
