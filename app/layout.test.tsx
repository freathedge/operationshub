import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));

import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import RootLayout from "@/app/layout";

describe("RootLayout", () => {
  it("wraps children in ThemeProvider then TooltipProvider", () => {
    const element = RootLayout({ children: "hello-world-marker", params: Promise.resolve({}) });
    const bodyElement = element.props.children;
    const themeProviderElement = bodyElement.props.children;
    expect(themeProviderElement.type).toBe(ThemeProvider);

    const tooltipProviderElement = themeProviderElement.props.children;
    expect(tooltipProviderElement.type).toBe(TooltipProvider);

    expect(tooltipProviderElement.props.children).toBe("hello-world-marker");
  });
});
