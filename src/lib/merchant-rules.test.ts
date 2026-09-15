// @vitest-environment node

import { describe, expect, it } from "vitest";
import { CATEGORIES } from "@/types/category";
import type { Category } from "@/types/category";
import { normalizeMerchant } from "./merchant";
import { RULE_PATTERNS, classifyByRule } from "./merchant-rules";

const examples: Record<Category, string[]> = {
  식비: ["김밥천국", "본죽", "한솥도시락", "맥도날드", "버거킹", "롯데리아"],
  "카페/간식": ["스타벅스", "투썸플레이스", "이디야", "메가커피", "컴포즈커피", "파리바게뜨"],
  배달: ["쿠팡이츠", "배달의민족", "요기요", "땡겨요", "배달특급"],
  교통: ["카카오택시", "카카오모빌리티", "티머니", "코레일", "에스알", "서울교통공사"],
  "주거/통신": ["한국전력", "서울도시가스", "삼천리도시가스", "에스케이텔레콤", "케이티통신", "엘지유플러스"],
  "구독/멤버십": ["넷플릭스", "유튜브프리미엄", "쿠팡플레이", "왓챠", "티빙", "멜론", "지니뮤직", "스포티파이", "애플", "구글", "NETFLIX", "APPLE.COM/BILL"],
  쇼핑: ["쿠팡", "네이버페이", "지마켓", "옥션", "무신사", "다이소"],
  "의료/건강": ["서울아산병원", "세브란스병원", "삼성서울병원", "서울대학교병원", "정관장"],
  "문화/여가": ["씨지브이", "롯데시네마", "메가박스", "예술의전당", "롯데월드"],
  교육: ["교보문고", "영풍문고", "메가스터디", "해커스", "대성마이맥"],
  "금융/이체": ["삼성화재", "현대해상", "디비손해보험", "교보생명", "한화생명"],
  기타: ["우체국", "대한적십자사", "굿네이버스", "월드비전", "유니세프"],
};

describe("내장 가맹점 규칙", () => {
  it("12개 카테고리마다 3개 이상, 전체 60개 이상의 실제 가맹점을 분류합니다", () => {
    expect(Object.values(examples).flat().length).toBeGreaterThanOrEqual(60);
    for (const category of CATEGORIES) {
      expect(examples[category].length).toBeGreaterThanOrEqual(3);
      for (const merchant of examples[category]) {
        expect(classifyByRule(normalizeMerchant(merchant))).toBe(category);
      }
    }
  });

  it("규칙을 길이 내림차순으로 정렬해 구체적인 패턴이 먼저 매칭되게 합니다", () => {
    // 소스 배열 순서가 우연히 맞아도 동작하므로, 정렬 자체가 사라진 것을 행동 테스트로는 못 잡습니다.
    const lengths = RULE_PATTERNS.map((pattern) => pattern.length);
    expect(lengths).toEqual([...lengths].sort((left, right) => right - left));
    // 패턴이 normalizeMerchant 결과와 같은 형태여야 부분 문자열 매칭이 성립합니다.
    for (const pattern of RULE_PATTERNS) {
      expect(normalizeMerchant(pattern)).toBe(pattern);
    }
  });

  it("구체적인 쿠팡이츠·쿠팡플레이가 쿠팡보다 우선합니다", () => {
    expect(classifyByRule("쿠팡이츠강남2호점")).toBe("배달");
    expect(classifyByRule("쿠팡플레이월정액")).toBe("구독/멤버십");
    expect(classifyByRule("쿠팡결제")).toBe("쇼핑");
  });

  it("접미가 붙은 가맹점은 포함 매칭하고 모르는 가맹점은 남겨둡니다", () => {
    expect(classifyByRule(normalizeMerchant("㈜스타벅스 강남2호점*(직영)"))).toBe("카페/간식");
    expect(classifyByRule("이름없는가게")).toBeNull();
    expect(classifyByRule("")).toBeNull();
  });
});
