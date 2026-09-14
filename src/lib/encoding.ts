export function detectEncoding(buf: Uint8Array): "utf-8" | "euc-kr" {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return "utf-8";

  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return "utf-8";
  } catch {
    // 잘못된 UTF-8인 경우에만 아래에서 디코딩 치환 비율을 비교합니다.
  }

  const text = new TextDecoder("utf-8").decode(buf);
  let nonAscii = 0;
  let replacements = 0;
  for (const character of text) {
    if (character > "\u007f") nonAscii += 1;
    if (character === "\ufffd") replacements += 1;
  }
  // 숫자·쉼표가 많은 CSV에서도 한글 깨짐 비율이 희석되지 않게 합니다.
  return nonAscii > 0 && replacements / nonAscii > 0.1 ? "euc-kr" : "utf-8";
}

export function decodeCsv(buf: Uint8Array, encoding?: "utf-8" | "euc-kr"): string {
  return new TextDecoder(encoding ?? detectEncoding(buf)).decode(buf).replace(/^\ufeff/, "");
}
