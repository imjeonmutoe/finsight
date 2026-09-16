import type { Category } from "@/types/category";

/**
 * 카테고리 12색 팔레트. 값은 globals.css의 `--color-category-*` 토큰에 있고 여기서는
 * 카테고리 → 토큰 대응만 정한다. 모든 차트가 이 파일만 참조해야 같은 카테고리가
 * 화면마다 다른 색으로 보이지 않는다.
 *
 * dataviz 스킬의 검증기(scripts/validate_palette.js)로 고정한 결과다:
 *  - 라이트(surface #f7f7f5): 밝기 밴드·채도 PASS, 인접 CVD ΔE 9.2, 정상시야 ΔE 19.6
 *  - 다크(surface #191918): 밝기 밴드·채도 PASS, 인접 CVD ΔE 9.0, 정상시야 ΔE 19.3
 * 아래 나열 순서가 그 검증을 통과한 인접 순서이므로 **순서를 바꾸지 마라.** 색을 바꾸거나
 * 순서를 바꾸면 검증기를 다시 돌려야 한다.
 *
 * 라이트 모드에서 네 색(배달·의료/건강·교통·문화/여가)은 표면 대비 3:1 미만이라 검증기가
 * relief를 요구한다. 그래서 색을 쓰는 곳은 **항상 카테고리명과 금액을 글자로 함께 표시한다.**
 * 색만으로 항목을 구분하는 차트를 만들지 마라. 미분류는 정체성이 없으므로 카테고리 색을
 * 주지 않고 중립 토큰을 쓴다.
 */
export const CATEGORY_COLOR_TOKENS: Record<Category, string> = {
  "식비": "--color-category-food",
  "카페/간식": "--color-category-cafe",
  "배달": "--color-category-delivery",
  "교통": "--color-category-transit",
  "주거/통신": "--color-category-housing",
  "구독/멤버십": "--color-category-subscription",
  "쇼핑": "--color-category-shopping",
  "의료/건강": "--color-category-health",
  "문화/여가": "--color-category-culture",
  "교육": "--color-category-education",
  "금융/이체": "--color-category-finance",
  "기타": "--color-category-etc",
};

export const UNCLASSIFIED_COLOR_TOKEN = "--color-disabled";

export function categoryColor(category: Category | null): string {
  return `var(${category === null ? UNCLASSIFIED_COLOR_TOKEN : CATEGORY_COLOR_TOKENS[category]})`;
}
