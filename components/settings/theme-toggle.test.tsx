// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "@/components/settings/theme-toggle";

const setThemeMock = vi.fn();
let mockResolvedTheme = "light";
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: mockResolvedTheme, setTheme: setThemeMock }),
}));

describe("ThemeToggle", () => {
  it("renders a button once mounted", async () => {
    render(<ThemeToggle />);
    expect(await screen.findByRole("button")).toBeInTheDocument();
  });

  it("switches from light to dark when clicked", async () => {
    mockResolvedTheme = "light";
    render(<ThemeToggle />);
    const button = await screen.findByRole("button");
    await userEvent.click(button);
    expect(setThemeMock).toHaveBeenCalledWith("dark");
  });

  it("switches from dark to light when clicked", async () => {
    mockResolvedTheme = "dark";
    render(<ThemeToggle />);
    const button = await screen.findByRole("button");
    await userEvent.click(button);
    expect(setThemeMock).toHaveBeenCalledWith("light");
  });
});
