import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// next/font는 Next 컴파일러가 빌드 타임에 변환해 폰트 파일을 self-host한다. vitest는
// 그 변환을 거치지 않으므로 `JetBrains_Mono`가 함수가 아니다. layout.tsx를 렌더하는
// 테스트를 위해 최소 형태로 대체한다. 실제 서체 로딩은 빌드가 담당한다.
vi.mock("next/font/google", () => ({
  JetBrains_Mono: () => ({ variable: "font-jetbrains", className: "font-jetbrains" }),
}));

afterEach(cleanup);
