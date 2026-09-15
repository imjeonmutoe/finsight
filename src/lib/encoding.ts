function hangulCount(text: string): number {
  let count = 0;
  for (const character of text) {
    if (character >= "가" && character <= "힣") count += 1;
  }
  return count;
}

export function detectEncoding(buf: Uint8Array): "utf-8" | "euc-kr" {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return "utf-8";

  // UTF-8 디코딩 성공만으로는 판정할 수 없습니다. EUC-KR 바이트가 그대로 valid UTF-8인 한글
  // 음절이 217자 있어(치·킨·창·천 등) 그런 파일은 깨짐 없이 라틴 문자로 읽혀 버립니다.
  // 그래서 양쪽으로 디코딩해 한글이 더 많이 나오는 쪽을 택합니다.
  const utf8 = new TextDecoder("utf-8").decode(buf);
  const euckr = new TextDecoder("euc-kr").decode(buf);
  return hangulCount(euckr) > hangulCount(utf8) ? "euc-kr" : "utf-8";
}

export function decodeCsv(buf: Uint8Array, encoding?: "utf-8" | "euc-kr"): string {
  return new TextDecoder(encoding ?? detectEncoding(buf)).decode(buf).replace(/^﻿/, "");
}
