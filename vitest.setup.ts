import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

// jsdom doesn't implement window.matchMedia. SidebarProvider renders
// SidebarMenuButton, which calls useSidebar() -> useIsMobile() (hooks/use-mobile.ts),
// and that calls window.matchMedia directly, so it must be stubbed for any test
// that renders inside a SidebarProvider. Centralized here (rather than per-file)
// since multiple test files render a SidebarProvider. This setup file also runs
// for tests using the default "node" environment (per vitest.config.ts), which
// has no `window` global, so guard the stub behind a typeof check.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// jsdom doesn't implement ResizeObserver. cmdk's CommandList (components/ui/command.tsx,
// used by CommandSearch) observes its own height with one on mount, so it must be stubbed
// for any test that renders a Command/CommandDialog.
if (typeof window !== "undefined" && typeof window.ResizeObserver === "undefined") {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom also doesn't implement Element.scrollIntoView, which cmdk's CommandList calls when
// the selected item changes (same CommandSearch usage as above).
if (typeof window !== "undefined" && typeof window.Element.prototype.scrollIntoView === "undefined") {
  window.Element.prototype.scrollIntoView = function scrollIntoView() {};
}
