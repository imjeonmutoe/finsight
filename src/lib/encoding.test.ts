// @vitest-environment node

import { describe, expect, it } from "vitest";
import { decodeCsv, detectEncoding } from "./encoding";

// '스타벅스'의 EUC-KR bytes. 테스트에서 외부 파일이나 인코더를 사용하지 않습니다.
const koreanBytes = new Uint8Array([0xbd, 0xba, 0xc5, 0xb8, 0xb9, 0xf7, 0xbd, 0xba]);

describe("CSV 인코딩", () => {
  it("빈 파일·ASCII·UTF-8 한글은 UTF-8로 읽습니다", () => {
    for (const text of ["", "date,amount\n2026-01-01,1000", "가맹점,금액\n스타벅스,5000"]) {
      const bytes = new TextEncoder().encode(text);
      expect(detectEncoding(bytes)).toBe("utf-8");
      expect(decodeCsv(bytes)).toBe(text);
    }
  });

  it("UTF-8 BOM을 우선하며 결과에서 제거합니다", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("날짜,금액")]);
    expect(detectEncoding(bytes)).toBe("utf-8");
    expect(decodeCsv(bytes)).toBe("날짜,금액");
  });

  it("E3: EUC-KR 한글을 깨짐 없이 읽습니다", () => {
    expect(detectEncoding(koreanBytes)).toBe("euc-kr");
    expect(decodeCsv(koreanBytes)).toBe("스타벅스");
  });

  it("긴 ASCII 내용에 섞인 EUC-KR 가맹점도 감지합니다", () => {
    const bytes = new Uint8Array([...new TextEncoder().encode("1,2\n".repeat(1000)), ...koreanBytes]);
    expect(detectEncoding(bytes)).toBe("euc-kr");
    expect(decodeCsv(bytes)).toMatch(/스타벅스$/);
  });

  it("수동 인코딩을 지정하면 자동 감지를 건너뜁니다", () => {
    expect(decodeCsv(koreanBytes, "euc-kr")).toBe("스타벅스");
    expect(decodeCsv(koreanBytes, "utf-8")).toContain("\ufffd");
  });

  it("정상 UTF-8에 원래 들어 있던 치환 문자를 디코딩 실패로 오인하지 않습니다", () => {
    const bytes = new TextEncoder().encode("가맹점,금액\n\ufffd,1000");
    expect(detectEncoding(bytes)).toBe("utf-8");
    expect(decodeCsv(bytes)).toBe("가맹점,금액\n\ufffd,1000");
  });
});
