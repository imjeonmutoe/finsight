"use client";

import { useEffect } from "react";

/**
 * Pretendard @font-face 선언(92개 서브셋, gzip 약 15KB)을 첫 렌더 뒤에 받는다.
 * 레이아웃에서 정적으로 import하면 모든 화면의 렌더 차단 CSS가 세 배로 커지고,
 * 첫 페인트 전에 서브셋 woff2 수백 KB가 CSS·JS와 대역을 다툰다. 서체는 원래
 * font-display: swap이라 시스템 폰트 스택(globals.css의 --font-sans)으로 먼저 그려지고
 * 같은 모양으로 바뀐다.
 */
export function DeferredFonts() {
  useEffect(() => {
    void import("pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css");
  }, []);
  return null;
}
