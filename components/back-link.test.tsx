// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BackLink } from "@/components/back-link";

describe("BackLink", () => {
  it("renders a link to the given href with the default label", () => {
    render(<BackLink href="/dashboard" />);
    const link = screen.getByRole("link", { name: /back/i });
    expect(link).toHaveAttribute("href", "/dashboard");
  });

  it("renders a custom label when provided", () => {
    render(<BackLink href="/tasks" label="Back to tasks" />);
    expect(screen.getByRole("link", { name: /back to tasks/i })).toBeInTheDocument();
  });
});
