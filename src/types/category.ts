export const CATEGORIES = [
  '식비', '카페/간식', '배달', '교통', '주거/통신', '구독/멤버십',
  '쇼핑', '의료/건강', '문화/여가', '교육', '금융/이체', '기타',
] as const
export type Category = (typeof CATEGORIES)[number]
