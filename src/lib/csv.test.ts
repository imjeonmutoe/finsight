// @vitest-environment node

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ColumnMapping, ImportContext } from "@/types/upload";
import { buildTransactions, detectHeaderRow, looksLikeHtml, parseAmount, parseCsvRows, parseDate } from "./csv";

const mapping: ColumnMapping = { date: 0, merchant: 1, amount: 2, skipRows: 0 };
const card: ImportContext = { sourceId: "card-a", sourceKind: "card", fileHash: "file-a", accountingMonth: "2026-02" };
const bank: ImportContext = { sourceId: "bank-a", sourceKind: "bank", fileHash: "file-b" };
const header = ["거래일자", "가맹점명", "금액"];
const row = ["2026-01-02", "㈜스타벅스 강남점", "5000"];

describe("CSV 구조", () => {
  it.each(["명세서가 아닌 일반 문서입니다", "<html>오류,잠시 후</html>", '{"name":"value","other":1}', "PK\u0003\u0004,파일"])(
    "E1: CSV가 아닌 내용은 한국어 오류를 반환합니다", (text) => {
      expect(() => parseCsvRows(text)).toThrow(/CSV.*확인/);
    },
  );

  it.each([
    // 카드사 '엑셀 내려받기'가 주는 실제 모양입니다. 빈 행이 먼저 나와 `<`로 시작하지 않고,
    // 줄마다 쉼표가 있어 셀로 쪼개지므로 "표처럼 보이는" 쓰레기로 파싱에 성공해 버립니다.
    ",,\n,,\n<html>,,\n<body>,,\n<table>,,\n<tr><th>이용일</th></tr>,,\n</table>,,\n</body></html>,,",
    ",,\r\n,,\r\n<!DOCTYPE html>,,\r\n<table>,,\r\n<tr><td>1</td></tr>,,\r\n</table>,,",
  ])("E1b: 빈 행 뒤에 숨은 HTML 표도 거부합니다", (text) => {
    // 고치기 전에는 여기서 던지지 않고 2000행짜리 가짜 표가 만들어졌습니다.
    expect(() => parseCsvRows(text)).toThrow(/CSV.*확인/);
  });

  it("셀 안의 꺾쇠는 HTML로 오인하지 않습니다", () => {
    // 태그 이름이 아닌 꺾쇠까지 막으면 정상 명세서를 거부합니다.
    expect(parseCsvRows("가맹점,메모\n㈜가게 <본점>,3 < 5")).toEqual([
      ["가맹점", "메모"], ["㈜가게 <본점>", "3 < 5"],
    ]);
  });

  it.each(["<table>", ",,\n,,\n<tr><td>1</td></tr>", "\r\n<!doctype html>", "  <TBODY>", "</table>"])(
    "looksLikeHtml이 HTML 표지를 찾습니다: %s", (text) => expect(looksLikeHtml(text)).toBe(true),
  );

  it.each(["", "a,b\n1,2", "가맹점,메모\n가게,3 < 5", "거래일자,가맹점명,금액\n2026-01-02,㈜가게 <본점>,5000"])(
    "looksLikeHtml이 정상 CSV를 HTML로 보지 않습니다: %s", (text) => expect(looksLikeHtml(text)).toBe(false),
  );

  it("E2: 빈 파일과 헤더만 있는 파일을 처리합니다", () => {
    expect(parseCsvRows("\ufeff \r\n\n")).toEqual([]);
    expect(detectHeaderRow([])).toBe(0);
    expect(buildTransactions([], mapping, card)).toEqual([]);
    expect(buildTransactions(parseCsvRows("거래일자,가맹점명,금액\n"), mapping, card)).toEqual([]);
  });

  it("따옴표 안의 쉼표·이스케이프·개행과 CRLF·CR을 처리합니다", () => {
    expect(parseCsvRows('\ufeff날짜,가맹점,금액,메모\r\n2026-01-02,"가게, \"\"본점\"\"\n두번째 줄","1,234",\r'))
      .toEqual([["날짜", "가맹점", "금액", "메모"], ["2026-01-02", '가게, "본점"\n두번째 줄', "1,234", ""]]);
    expect(parseCsvRows("a,b\rc,d")).toEqual([["a", "b"], ["c", "d"]]);
  });

  it.each(['a,b\n"끝나지 않은 셀,1', 'a,b\n잘못"된셀,1', 'a,b\n"셀"다른내용,1'])(
    "잘못된 따옴표를 조용히 복구하지 않습니다", (text) => {
      expect(() => parseCsvRows(text)).toThrow(/CSV/);
    },
  );

  it("구분자와 여는 따옴표 사이의 공백을 허용합니다", () => {
    // 닫는 따옴표 뒤 공백은 이미 허용하므로 여는 쪽만 거부하면 비대칭입니다.
    expect(parseCsvRows('a,b\n1, "가게, 본점"')).toEqual([["a", "b"], ["1", "가게, 본점"]]);
    expect(parseCsvRows('a,b\n"가게" ,1')).toEqual([["a", "b"], ["가게", "1"]]);
  });

  it("상단 요약 3행 뒤의 헤더를 찾고 요약·빈 행을 데이터 위치에서 제외합니다", () => {
    const rows = parseCsvRows("조회기간: 2026-01-01~2026-01-31\n고객: 합성이름\n청구금액,5000\n거래일자,가맹점명,금액\n2026-01-02,카페,5000\n합계,,5000\n\n2026-01-03,식당,1000");
    const skipRows = detectHeaderRow(rows);
    expect(skipRows).toBe(3);
    expect(buildTransactions(rows, { ...mapping, skipRows }, card).map((item) => item.dataRowIndex)).toEqual([0, 1]);
  });

  it("모르는 헤더도 구조가 있으면 수동 매핑할 위치를 찾습니다", () => {
    expect(detectHeaderRow([["조회기간: 합성 자료"], ["언제", "어디", "얼마"], row])).toBe(1);
  });

  it("대괄호로 시작하는 상단 요약은 JSON으로 오인하지 않습니다", () => {
    expect(detectHeaderRow(parseCsvRows("[거래내역]\n거래일자,가맹점명,금액\n2026-01-02,카페,1000"))).toBe(1);
  });
});

describe("원 단위 금액", () => {
  it.each([
    ["1,234", 1234], ["₩1,234", 1234], ["1,234원", 1234], ["(1,234)", -1234],
    ["-1,234", -1234], ["1234.00", 1234], ["1,234.49", 1234], ["1,234.50", 1235],
    ["-1234.50", -1235], ["(₩1,234.50)", -1235], [" +₩1,234 원 ", 1234],
    ["0", 0], ["9007199254740991", Number.MAX_SAFE_INTEGER],
  ])("E4: %s를 정수 %s로 읽습니다", (raw, expected) => {
    const amount = parseAmount(raw);
    expect(amount).toBe(expected);
    expect(Number.isSafeInteger(amount)).toBe(true);
  });

  it.each(["", "abc", "1,23", "12원34", "1e3", "--100", "NaN", "Infinity", "9007199254740992", "9007199254740991.5"])(
    "금액 오류·정밀도 손실을 거부합니다: %s", (raw) => {
      expect(() => parseAmount(raw)).toThrow(/금액/);
    },
  );
});

describe("날짜", () => {
  it.each(["2026-01-02", "2026.1.2", "2026/01/02", "20260102", "2026년 1월 2일", "2026-01-02 13:24:59"])(
    "%s를 시간대와 무관한 날짜로 읽습니다", (raw) => expect(parseDate(raw)).toBe("2026-01-02"),
  );
  it("윤년을 검증합니다", () => expect(parseDate("2024-02-29")).toBe("2024-02-29"));
  it.each(["", "2026-02-29", "2026-13-01", "2026-04-31", "2026-00-01", "2026-01-00", "26-01-02", "2026-01-02가짜", "2026-01-02 25:00:00"])(
    "잘못된 날짜를 거부합니다: %s", (raw) => expect(() => parseDate(raw)).toThrow(/날짜/),
  );
});

describe("거래 생성", () => {
  it("공유 타입의 필드만 반환하고 원본 입력을 변경하지 않습니다", () => {
    const rows = [header, [...row, "123-456-789012", "4111-1111-1111-1111"]];
    const before = structuredClone(rows);
    const result = buildTransactions(rows, mapping, card);
    expect(result).toEqual([{
      sourceId: "card-a", occurredOn: "2026-01-02", accountingMonth: "2026-02",
      merchantRaw: "㈜스타벅스 강남점", merchantNorm: "스타벅스강남점", amountKrw: 5000,
      kind: "expense", sourceTransactionKey: null, dataRowIndex: 0,
      dedupeHash: expect.stringMatching(/^[a-f0-9]{64}$/), candidateHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    }]);
    expect(rows).toEqual(before);
    expect(JSON.stringify(result)).not.toContain("123-456-789012");
    expect(JSON.stringify(result)).not.toContain("4111-1111-1111-1111");
  });

  it("같은 파일의 동일 행을 모두 보존하고 재파싱 해시는 같습니다", () => {
    const rows = [header, row, row];
    const result = buildTransactions(rows, mapping, card);
    expect(result).toHaveLength(2);
    expect(result[0]?.dedupeHash).not.toBe(result[1]?.dedupeHash);
    expect(result[0]?.candidateHash).toBe(result[1]?.candidateHash);
    expect(buildTransactions(rows, mapping, card)).toEqual(result);
    const partial = buildTransactions([header, row], mapping, { ...card, fileHash: "partial" });
    expect(partial[0]?.dedupeHash).not.toBe(result[0]?.dedupeHash);
    expect(partial[0]?.candidateHash).toBe(result[0]?.candidateHash);
  });

  it("E5: 분리 입출금은 절댓값이며 ADR-013에 따라 유형이 항상 있습니다", () => {
    const rows = [["날짜", "내용", "출금액", "입금액"],
      ["2026-01-02", "출금", "-5000", ""], ["2026-01-02", "입금", "", "3000000"],
      ["2026-01-02", "양쪽 값", "1000", "2000"]];
    const result = buildTransactions(rows, { date: 0, merchant: 1, withdrawal: 2, deposit: 3, skipRows: 0 }, bank);
    expect(result.map((item) => [item.kind, item.amountKrw, item.accountingMonth]))
      .toEqual([["expense", 5000, "2026-01"], ["income", 3000000, "2026-01"], ["expense", 1000, "2026-01"]]);
  });

  it("E6: 명시 유형을 최우선으로 쓰며 모르는 값은 지출입니다", () => {
    const values = ["환불", "승인취소", "카드대금 납부", "본인 계좌 이체", "급여", "미지정", "income", "transfer"];
    const result = buildTransactions([[...header, "거래구분"], ...values.map((value) => ["2026-01-02", "카페", "-5000", value])], { ...mapping, transactionKind: 3 }, card);
    expect(result.map((item) => item.kind)).toEqual(["refund", "refund", "transfer", "transfer", "income", "expense", "income", "transfer"]);
    expect(result.every((item) => item.amountKrw === 5000)).toBe(true);
  });

  it("거래구분 셀이 비면 미지정으로 보고 아래 규칙으로 내려갑니다", () => {
    // 빈 셀까지 '사전에 없는 값'으로 보면 거래구분이 매핑된 은행 파일의 입금이 전부 지출이 됩니다.
    const result = buildTransactions([["날짜", "적요", "출금액", "입금액", "거래구분"],
      ["2026-01-25", "급여", "", "3000000", ""],
      ["2026-01-05", "이마트", "50000", "", ""],
      ["2026-01-26", "이자", "", "1500", "이자"]],
    { date: 0, merchant: 1, withdrawal: 2, deposit: 3, transactionKind: 4, skipRows: 0 }, bank);
    expect(result.map((item) => [item.kind, item.amountKrw]))
      .toEqual([["income", 3000000], ["expense", 50000], ["expense", 1500]]);
    expect(buildTransactions([[...header, "거래구분"], ["2026-01-02", "카페", "-5000", ""]], { ...mapping, transactionKind: 3 }, card)[0]?.kind)
      .toBe("refund");
  });

  it("안 쓰는 원장 컬럼의 0은 값이 없는 것으로 봅니다", () => {
    // 빈칸 대신 0을 찍는 명세서가 있습니다. 0을 값으로 보면 입금이 0원 지출이 됩니다.
    const result = buildTransactions([["날짜", "적요", "출금액", "입금액"],
      ["2026-01-25", "급여입금", "0", "3200000"],
      ["2026-01-05", "카드대금", "450000", "0"],
      ["2026-01-31", "잔액 이월", "0", "0"]],
    { date: 0, merchant: 1, withdrawal: 2, deposit: 3, skipRows: 0 }, bank);
    expect(result.map((item) => [item.kind, item.amountKrw]))
      .toEqual([["income", 3200000], ["expense", 450000]]);
  });

  it("명시 유형이 분리 입출금보다 우선하고 가맹점으로 유형을 추정하지 않습니다", () => {
    const result = buildTransactions([["날짜", "가맹점", "출금", "입금", "거래구분"],
      ["2026-01-02", "환불 입금", "", "5000", "환불"],
      ["2026-01-02", "급여", "", "5000", "알수없음"]],
    { date: 0, merchant: 1, withdrawal: 2, deposit: 3, transactionKind: 4, skipRows: 0 }, bank);
    expect(result.map((item) => item.kind)).toEqual(["refund", "expense"]);
    expect(buildTransactions([header, ["2026-01-02", "카드대금 납부", "5000"]], mapping, bank)[0]?.kind).toBe("expense");
  });

  it("단일 금액의 음수만 환불로 도출하고 절댓값을 저장합니다", () => {
    const result = buildTransactions([header, ["2026-01-02", "카페", "(1,234)"], ["2026-01-02", "카페", "-0.49"]], mapping, card);
    expect(result.map((item) => [item.kind, item.amountKrw])).toEqual([["refund", 1234], ["refund", 0]]);
  });

  it("E8: 해외결제는 원화환산만 사용하고 국내 빈 환산은 원화 금액으로 대체합니다", () => {
    const result = buildTransactions([[...header, "원화환산금액", "외화금액"],
      ["2026-01-02", "해외", "10", "13500", "10"],
      ["2026-01-02", "국내", "5000", "", ""],
      ["2026-01-02", "해외환불", "-10", "-13500", "-10"],
      ["2026-01-02", "영원", "5000", "0", "0"]], { ...mapping, krwEquivalent: 3 }, card);
    expect(result.map((item) => [item.amountKrw, item.kind]))
      .toEqual([[13500, "expense"], [5000, "expense"], [13500, "refund"], [0, "expense"]]);
  });

  it("해외결제 행의 부호는 외화로 적힌 금액 컬럼에서 읽습니다", () => {
    // 원화환산액을 절댓값으로만 적는 명세서가 있어, 환산액 부호로 판정하면 환불이 지출이 됩니다.
    const result = buildTransactions([[...header, "원화환산금액"],
      ["2026-01-02", "해외취소", "-19.99 USD", "27900"],
      ["2026-01-03", "해외결제", "19.99 USD", "27900"]], { ...mapping, krwEquivalent: 3 }, card);
    expect(result.map((item) => [item.kind, item.amountKrw]))
      .toEqual([["refund", 27900], ["expense", 27900]]);
  });

  it("금액이 없는 행은 건너뛰고 모든 행이 그러면 매핑 오류로 처리합니다", () => {
    const rows = [header, ["2026-01-02", "카페", "5000"], ["2026-01-03", "잔액 이월", ""], ["2026-01-04", "구분선", "-"]];
    expect(buildTransactions(rows, mapping, card).map((item) => [item.merchantRaw, item.dataRowIndex]))
      .toEqual([["카페", 0]]);
    expect(() => buildTransactions([header, ["2026-01-03", "잔액 이월", ""]], mapping, card)).toThrow(/금액/);
  });

  it.each(["합계", "총계", "소계", "누계", "이월", "중간합계", "합 계"])(
    "요약행 %s를 건너뜁니다", (label) => {
      expect(buildTransactions([header, ["2026-01-02", "카페", "5000"], [label, "", "9999"]], mapping, card)).toHaveLength(1);
    },
  );

  it("날짜와 금액이 둘 다 없는 푸터 행을 건너뜁니다", () => {
    // 현대카드 명세서 마지막 줄은 날짜 칸이 '-'이고 합계 문구는 가맹점 칸에 있다.
    // 날짜도 금액도 없으면 거래가 될 수 없으므로 잘못된 거래 날짜를 숨기는 경우가 아니다.
    const footer = ["-", "총 합계 151건", ""];

    expect(buildTransactions([header, ["2026-01-02", "카페", "5000"], footer], mapping, card)).toHaveLength(1);
  });

  it("자리표시자 날짜라도 금액이 있으면 숨기지 않습니다", () => {
    expect(() => buildTransactions([header, ["-", "카페", "5000"]], mapping, card)).toThrow(/날짜/);
  });

  it("요약 표시는 날짜 위치에서만 인정합니다", () => {
    expect(() => buildTransactions([header, ["2026-01-02", "합계", "5000"], ["알수없음", "카페", "5000"]], mapping, card)).toThrow(/3행/);
  });

  it("E7: 할부 청구월이 다르면 같은 승인번호·승인일·회차금액도 별개입니다", () => {
    const result = buildTransactions([[...header, "청구월", "승인번호"],
      ["2025-12-01", "가게", "10000", "2026.01", "REF-001"],
      ["2025-12-01", "가게", "10000", "2026년 2월", "REF-001"]],
    { ...mapping, billingMonth: 3, transactionId: 4 }, card);
    expect(result.map((item) => item.accountingMonth)).toEqual(["2026-01", "2026-02"]);
    expect(result.every((item) => item.occurredOn === "2025-12-01" && item.amountKrw === 10000)).toBe(true);
    expect(result[0]?.sourceTransactionKey).toBe(result[1]?.sourceTransactionKey);
    expect(result[0]?.sourceTransactionKey).toMatch(/^[a-f0-9]{64}$/);
    expect(result[0]?.dedupeHash).not.toBe(result[1]?.dedupeHash);
  });

  it("카드의 청구월 누락은 오류이고 은행은 항상 거래월을 씁니다", () => {
    expect(() => buildTransactions([header, row], mapping, { ...card, accountingMonth: undefined })).toThrow(/청구월/);
    expect(() => buildTransactions([header, row], mapping, { ...card, accountingMonth: "2026-13" })).toThrow(/청구월/);
    expect(buildTransactions([[...header, "청구월"], [...row, "잘못된월"]], { ...mapping, billingMonth: 3 }, { ...bank, accountingMonth: "2026-03" })[0]?.accountingMonth).toBe("2026-01");
    expect(buildTransactions([[...header, "청구월"], [...row, ""]], { ...mapping, billingMonth: 3 }, card)[0]?.accountingMonth).toBe("2026-02");
  });

  it("유일한 참조번호만 해시로 보존하며 겹치는 다른 파일에서도 같습니다", () => {
    const rows = [[...header, "거래고유번호"], [...row, "REF-001"]];
    const selected = { ...mapping, transactionId: 3 };
    const first = buildTransactions(rows, selected, card);
    const other = buildTransactions(rows, selected, { ...card, fileHash: "file-c" });
    expect(first[0]?.sourceTransactionKey).toBe(createHash("sha256").update("REF-001").digest("hex"));
    expect(first[0]?.dedupeHash).toBe(other[0]?.dedupeHash);
    expect(JSON.stringify(first)).not.toContain("REF-001");
  });

  it("동일 유형·청구월에서 반복된 번호 컬럼은 고유번호로 사용하지 않습니다", () => {
    const result = buildTransactions([[...header, "승인번호"], [...row, "REF-001"], [...row, "REF-001"], [...row, "REF-002"]], { ...mapping, transactionId: 3 }, card);
    expect(result.map((item) => item.sourceTransactionKey)).toEqual([null, null, null]);
    expect(new Set(result.map((item) => item.dedupeHash)).size).toBe(3);
  });

  it("구매·취소는 같은 번호여도 유형별로 유일하므로 각각 보존합니다", () => {
    const result = buildTransactions([[...header, "승인번호", "거래구분"], [...row, "REF-001", "승인"], [...row, "REF-001", "취소"]], { ...mapping, transactionId: 3, transactionKind: 4 }, card);
    expect(result[0]?.sourceTransactionKey).toBe(result[1]?.sourceTransactionKey);
    expect(result[0]?.sourceTransactionKey).not.toBeNull();
    expect(result[0]?.dedupeHash).not.toBe(result[1]?.dedupeHash);
  });

  it.each(["계좌번호", "카드번호", "미확인식별자"])("%s는 거래번호로 선택할 수 없습니다", (name) => {
    expect(() => buildTransactions([[...header, name], [...row, "4111-1111-1111-1111"]], { ...mapping, transactionId: 3 }, card)).toThrow(/거래 고유번호/);
  });

  it.each(["4111111111111111", "123-456-789012", "test@example.com", "010-1234-5678", "4111-****-****-1111"])(
    "참조번호 헤더 아래의 식별자 패턴도 보존하지 않습니다", (value) => {
      expect(buildTransactions([[...header, "승인번호"], [...row, value]], { ...mapping, transactionId: 3 }, card)[0]?.sourceTransactionKey).toBeNull();
    },
  );

  it("빈 참조번호는 해당 행만 파일 기반 해시로 처리합니다", () => {
    const result = buildTransactions([[...header, "승인번호"], [...row, ""], [...row, "REF-002"]], { ...mapping, transactionId: 3 }, card);
    expect(result[0]?.sourceTransactionKey).toBeNull();
    expect(result[1]?.sourceTransactionKey).toMatch(/^[a-f0-9]{64}$/);
  });

  it("8자리 숫자 승인번호는 문자열 그대로 해시해 앞자리 0을 보존합니다", () => {
    const result = buildTransactions([[...header, "승인번호"], [...row, "00123456"]], { ...mapping, transactionId: 3 }, card);
    expect(result[0]?.sourceTransactionKey).toBe(createHash("sha256").update("00123456").digest("hex"));
  });

  it("12자리까지의 숫자 승인번호를 보존하고 카드번호 길이대는 버립니다", () => {
    // 10~12자리 거래번호가 흔합니다. 버리면 파일 기반 해시로 떨어져 중복 확인이 상시 발생합니다.
    for (const value of ["1234567890", "123456789012"]) {
      expect(buildTransactions([[...header, "승인번호"], [...row, value]], { ...mapping, transactionId: 3 }, card)[0]?.sourceTransactionKey)
        .toBe(createHash("sha256").update(value).digest("hex"));
    }
    // 13자리부터는 카드번호 자리수와 겹치므로 보존하지 않습니다.
    expect(buildTransactions([[...header, "승인번호"], [...row, "1234567890123"]], { ...mapping, transactionId: 3 }, card)[0]?.sourceTransactionKey)
      .toBeNull();
  });

  it.each(["계좌번호", "카드 번호", "account_number", "card_number"])(
    "%s 컬럼을 가맹점에 잘못 매핑해도 결과로 전파하지 않습니다", (name) => {
      expect(() => buildTransactions([["날짜", name, "금액"], ["2026-01-02", "4111111111111111", "5000"]], mapping, card)).toThrow(/매핑/);
    },
  );

  it("없는 컬럼·금액·유효하지 않은 행을 조용히 저장하지 않습니다", () => {
    expect(() => buildTransactions([header, row], { ...mapping, amount: 8 }, card)).toThrow(/매핑/);
    expect(() => buildTransactions([header, row], { ...mapping, date: -1 }, card)).toThrow(/매핑/);
    expect(() => buildTransactions([header, row], { ...mapping, skipRows: 5 }, card)).toThrow(/매핑/);
    expect(() => buildTransactions([header, row], { date: 0, merchant: 1, skipRows: 0 }, card)).toThrow(/금액/);
    expect(() => buildTransactions([header, ["2026-01-02", "비밀가맹점"]], mapping, card)).toThrow(/2행/);
    expect(() => buildTransactions([header, ["잘못된날짜", "비밀가맹점", "5000"]], mapping, card)).toThrow(/2행/);
    // catch 블록을 건너뛰면 아무것도 검사하지 않고 통과하므로 실행 횟수를 고정합니다.
    expect.assertions(7);
    try {
      buildTransactions([header, ["2026-01-02", "비밀가맹점", "비밀금액"]], mapping, card);
    } catch (error) {
      expect(String(error)).not.toMatch(/비밀가맹점|비밀금액/);
    }
  });
});
