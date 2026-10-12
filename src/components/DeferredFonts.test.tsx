import { render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { DeferredFonts } from "./DeferredFonts";

it("화면에 아무것도 그리지 않습니다", () => {
  expect(renderToStaticMarkup(<DeferredFonts />)).toBe("");

  const { container } = render(<DeferredFonts />);

  expect(container).toBeEmptyDOMElement();
});
