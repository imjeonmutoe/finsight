import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// next/font는 Next 컴파일러가 빌드 타임에 변환해 폰트 파일을 self-host한다. vitest는
// 그 변환을 거치지 않으므로 `JetBrains_Mono`가 함수가 아니다. layout.tsx를 렌더하는
// 테스트를 위해 최소 형태로 대체한다. 실제 서체 로딩은 빌드가 담당한다.
vi.mock("next/font/google", () => ({
  JetBrains_Mono: () => ({ variable: "font-jetbrains", className: "font-jetbrains" }),
}));

// jsdom은 scrollIntoView를 구현하지 않는다(호출하면 TypeError). 레이아웃이 없는 환경이라
// 동작을 흉내 낼 것도 없으므로 빈 함수로 둔다. 실제 스크롤은 브라우저가 담당한다.
// 이 setup은 `@vitest-environment node` 파일에서도 도는데 거기엔 Element 자체가 없다.
if (typeof Element !== "undefined") {
  Element.prototype.scrollIntoView = () => {};
}

afterEach(cleanup);
