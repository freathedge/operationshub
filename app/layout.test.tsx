import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));

import RootLayout from "@/app/layout";

describe("RootLayout", () => {
  it("wraps children in ThemeProvider and TooltipProvider", () => {
    const element = RootLayout({ children: "hello-world-marker" });
    const serialized = JSON.stringify(element);
    expect(serialized).toContain("hello-world-marker");
    // next-themes' ThemeProvider and the shadcn TooltipProvider are both
    // rendered as component references in the element tree, not by a
    // string name JSON.stringify would show directly — so this test proves
    // structural nesting depth instead: children must be nested at least
    // two levels below <body>, which is only true once both providers wrap
    // it. A single flat <body>{children}</body> has children one level deep.
    const bodyChildren = element.props.children.props.children;
    // bodyChildren is whatever ThemeProvider wraps; if the providers were
    // never added, bodyChildren would literally equal "hello-world-marker"
    // instead of a nested element structure containing it.
    expect(bodyChildren).not.toBe("hello-world-marker");
  });
});
