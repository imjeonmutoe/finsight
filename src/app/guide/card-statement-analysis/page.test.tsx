import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CATEGORIES } from "@/types/category";
import GuidePage, { metadata } from "./page";

afterEach(() => vi.unstubAllEnvs());

describe("카드 명세서 분석 가이드", () => {
  it("검색어 '카드 명세서 분석'을 h1과 제목에 둡니다", () => {
    render(<GuidePage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("카드 명세서 분석");
    expect(metadata.title).toBe("카드 명세서 분석하는 법");
    expect(metadata.alternates?.canonical).toBe("/guide/card-statement-analysis");
  });

  it("내려받기부터 결과 읽기까지 단계를 순서대로 안내합니다", () => {
    render(<GuidePage />);

    const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(headings.slice(0, 4)).toEqual([
      "1. 명세서 파일 내려받기",
      "2. 파일 올리고 컬럼 확인하기",
      "3. 카테고리 분류 확인하기",
      "4. 결과 읽는 법",
    ]);
  });

  it("업로드 제약을 제품 상수와 같은 값으로 밝힙니다", () => {
    render(<GuidePage />);

    expect(screen.getByText(/파일당 4MB/)).toBeVisible();
    expect(screen.getByText(/10,000행까지/)).toBeVisible();
    expect(screen.getByText(/\.xlsx/)).toBeVisible();
  });

  it("카테고리 고정 목록 12개를 그대로 보여줍니다", () => {
    render(<GuidePage />);

    const list = screen.getByRole("list", { name: "카테고리 목록" });
    expect(list.children).toHaveLength(CATEGORIES.length);
    for (const category of CATEGORIES) expect(list).toHaveTextContent(category);
  });

  it("총지출의 정의를 명세서와 대조할 수 있게 밝힙니다", () => {
    render(<GuidePage />);

    expect(screen.getByText(/총지출은 지출에서 환불을 뺀 금액입니다/)).toBeVisible();
  });

  it("샘플 대시보드·개인정보처리방침·홈으로 가는 길을 둡니다", () => {
    render(<GuidePage />);

    expect(screen.getByRole("link", { name: "샘플 대시보드 보기" })).toHaveAttribute("href", "/demo");
    expect(screen.getByRole("link", { name: "개인정보처리방침" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "FinSight 홈으로" })).toHaveAttribute("href", "/");
  });

  it("글 구조화 데이터를 브랜드와 이어 답니다", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://finsight.example");
    const { container } = render(<GuidePage />);

    const script = container.querySelector('script[type="application/ld+json"]');
    const data = JSON.parse(script?.textContent ?? "{}");
    expect(data).toMatchObject({
      "@type": "Article",
      headline: "카드 명세서 분석하는 법",
      inLanguage: "ko",
      mainEntityOfPage: "https://finsight.example/guide/card-statement-analysis",
      publisher: { "@id": "https://finsight.example/#organization" },
    });
  });
});
