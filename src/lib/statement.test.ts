// @vitest-environment node

import { describe, expect, it } from "vitest";
import { parseHtmlTable, parseStatementRows } from "./statement";

const TABLE = `<html><head><style>td { color: red; }</style></head><body>
<p>2026년 10월 이용대금명세서</p>
<table>
  <tr><th>이용일</th><th>이용가맹점</th><th>이용금액</th></tr>
  <tr><td>2026.09.01</td><td>카페</td><td>5,000</td></tr>
  <tr><td>2026.09.02</td><td>식당</td><td>12,000</td></tr>
</table></body></html>`;

describe("HTML 명세서 표 읽기", () => {
  it("행과 셀을 그대로 표로 만듭니다", () => {
    // 카드사 '엑셀 내려받기'는 HTML 표를 내려줍니다. 이게 실제로 받는 모양입니다.
    expect(parseHtmlTable(TABLE)).toEqual([
      ["이용일", "이용가맹점", "이용금액"],
      ["2026.09.01", "카페", "5,000"],
      ["2026.09.02", "식당", "12,000"],
    ]);
  });

  it("셀 안의 쉼표를 값의 일부로 지킵니다", () => {
    // CSV로 잘못 읽으면 여기서 칸이 쪼개집니다. HTML은 칸 경계가 태그라 그럴 일이 없습니다.
    const rows = parseHtmlTable("<table><tr><td>가게, 본점</td><td>1,234</td></tr></table>");

    expect(rows).toEqual([["가게, 본점", "1,234"]]);
  });

  it("엔티티를 풀고 중첩 태그와 줄바꿈을 정리합니다", () => {
    const rows = parseHtmlTable(
      "<table><tr><td><span>㈜가게</span>&nbsp;&amp;<br>본점</td><td>&#44;&lt;&gt;</td></tr></table>",
    );

    expect(rows).toEqual([["㈜가게 & 본점", ",<>"]]);
  });

  it("셀 밖의 내용은 표에 넣지 않습니다", () => {
    // style·script 텍스트나 안내 문단이 칸으로 섞이면 매핑이 통째로 어긋납니다.
    expect(parseHtmlTable(TABLE)[0]).toEqual(["이용일", "이용가맹점", "이용금액"]);
    expect(JSON.stringify(parseHtmlTable(TABLE))).not.toContain("color");
    expect(JSON.stringify(parseHtmlTable(TABLE))).not.toContain("이용대금명세서");
  });

  it("칸 수가 다른 행을 가장 넓은 행에 맞춰 채웁니다", () => {
    // 명세서 상단 요약행은 칸이 적습니다. 폭이 들쭉날쭉하면 헤더 탐지가 흔들립니다.
    const rows = parseHtmlTable("<table><tr><td>합계</td></tr><tr><td>a</td><td>b</td><td>c</td></tr></table>");

    expect(rows).toEqual([["합계", "", ""], ["a", "b", "c"]]);
  });

  it("빈 행은 버립니다", () => {
    const rows = parseHtmlTable("<table><tr><td> </td><td></td></tr><tr><td>a</td><td>b</td></tr></table>");

    expect(rows).toEqual([["a", "b"]]);
  });

  it("표가 없으면 읽지 못했다고 알립니다", () => {
    expect(() => parseHtmlTable("<html><body>로그인이 필요합니다</body></html>")).toThrow(/표/);
  });
});

describe("명세서 파일 읽기", () => {
  it("HTML이면 표로, CSV면 CSV로 읽습니다", () => {
    expect(parseStatementRows(TABLE)).toEqual(parseHtmlTable(TABLE));
    expect(parseStatementRows("거래일자,가맹점명,금액\n2026-01-02,카페,5000"))
      .toEqual([["거래일자", "가맹점명", "금액"], ["2026-01-02", "카페", "5000"]]);
  });

  it("빈 행이 앞에 붙은 카드사 파일도 표로 읽습니다", () => {
    // 실제 현대카드 파일은 `,,` 빈 행 100여 개 뒤에 <html>이 나옵니다.
    const rows = parseStatementRows(",,\n,,\n,,\n" + TABLE);

    expect(rows[0]).toEqual(["이용일", "이용가맹점", "이용금액"]);
    expect(rows).toHaveLength(3);
  });
});
