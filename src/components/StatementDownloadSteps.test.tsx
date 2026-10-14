import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatementDownloadSteps } from "./StatementDownloadSteps";

describe("명세서 내려받기 안내", () => {
  it("카드와 은행의 공통 경로를 줍니다", () => {
    render(<StatementDownloadSteps />);

    expect(screen.getByText("카드")).toBeVisible();
    expect(screen.getByText(/이용내역 조회 또는 이용대금명세서 → 엑셀 내려받기/)).toBeVisible();
    expect(screen.getByText("은행")).toBeVisible();
    expect(screen.getByText(/거래내역 조회 → 엑셀 내려받기/)).toBeVisible();
  });

  it("카드사별 메뉴 경로를 적지 않습니다", () => {
    // 직접 확인할 수 없고 자주 바뀐다. 두 화면이 같은 카드사를 서로 다르게 안내했던 적이 있다.
    const { container } = render(<StatementDownloadSteps />);

    expect(container).not.toHaveTextContent(/신한|국민|삼성|현대|롯데|우리/);
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });

  it("메뉴 이름이 달라도 찾을 수 있게 단서를 줍니다", () => {
    render(<StatementDownloadSteps />);

    expect(screen.getByText(/화면 이름은 카드사마다 다를 수 있습니다/)).toBeVisible();
  });
});
