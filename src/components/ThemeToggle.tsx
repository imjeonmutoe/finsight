"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

// 현재 테마의 단일 소스는 `<html data-theme>`입니다. layout.tsx의 인라인 스크립트가 첫 페인트
// 전에 저장값(없으면 OS 설정)으로 세워 두므로, 여기서 우선순위를 다시 구현하지 않습니다.
// 두 곳에 같은 판단이 있으면 한쪽만 고쳐져 화면 색과 버튼 라벨이 어긋납니다.

function subscribe(onStoreChange: () => void): () => void {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, { attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function readTheme(): Theme | null {
  const theme = document.documentElement.dataset.theme;
  return theme === "light" || theme === "dark" ? theme : null;
}

/** 서버는 사용자의 선택을 알 수 없습니다. 첫 렌더에서는 테마를 단정하지 않습니다. */
function readServerTheme(): Theme | null {
  return null;
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, readServerTheme);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      // 사용자가 고른 값은 OS 설정보다 우선합니다. 다음 방문에도 이 선택이 이깁니다.
      window.localStorage.setItem("theme", next);
    } catch {}
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-md border border-border-default px-3 py-2 text-sm text-text hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {theme === null ? "테마 전환" : theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
    </button>
  );
}
