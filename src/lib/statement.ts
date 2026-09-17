import { looksLikeHtml, parseCsvRows } from "./csv";

// 카드사·은행의 "엑셀 내려받기"는 대부분 HTML 표를 `.xls`로 내려줍니다. 사용자에게 스프레드시트로
// 열어 CSV로 내보내라고 시키는 대신 여기서 직접 읽습니다. 표 구조가 곧 칸 경계라
// `가게, 본점` 같은 값이 쉼표에서 쪼개지지 않습니다 — CSV보다 오히려 안전합니다.
const ROW = /<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi;
const CELL = /<(t[dh])\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
const LINE_BREAK = /<br\s*\/?>/gi;
const TAG = /<[^>]*>/g;
const ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi;
const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(ENTITY, (whole, body: string) => {
    if (!body.startsWith("#")) return NAMED[body.toLowerCase()] ?? whole;
    const code = body[1]?.toLowerCase() === "x" ? Number.parseInt(body.slice(2), 16) : Number(body.slice(1));
    // 서로게이트 구간과 범위 밖 값은 fromCodePoint가 던집니다. 원문을 그대로 둡니다.
    if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return whole;
    return String.fromCodePoint(code);
  });
}

function cellText(html: string): string {
  return decodeEntities(html.replace(LINE_BREAK, " ").replace(TAG, "")).replace(/\s+/g, " ").trim();
}

/**
 * HTML 문서에서 표의 행을 읽습니다. `<td>`·`<th>` 안쪽만 보므로 style·script나 안내 문단은
 * 칸으로 섞이지 않습니다. 렌더링하지 않고 텍스트만 뽑습니다.
 */
export function parseHtmlTable(text: string): string[][] {
  const rows: string[][] = [];
  for (const [, inner = ""] of text.matchAll(ROW)) {
    const cells = [...inner.matchAll(CELL)].map(([, , content = ""]) => cellText(content));
    if (cells.some((cell) => cell !== "")) rows.push(cells);
  }
  if (rows.length === 0) throw new Error("HTML에서 표를 찾지 못했습니다. 명세서를 다시 내려받아 주세요.");

  // 상단 요약행은 칸이 적습니다. 폭이 들쭉날쭉하면 헤더 탐지가 흔들립니다.
  const width = Math.max(...rows.map((row) => row.length));
  return rows.map((row) => [...row, ...Array<string>(width - row.length).fill("")]);
}

/** 명세서 파일 한 개를 행 목록으로 읽습니다. CSV와 HTML 표 둘 다 받습니다. */
export function parseStatementRows(text: string): string[][] {
  return looksLikeHtml(text) ? parseHtmlTable(text) : parseCsvRows(text);
}
