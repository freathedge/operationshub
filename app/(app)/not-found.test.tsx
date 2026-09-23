// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import NotFound from "@/app/(app)/not-found";

describe("NotFound", () => {
  it("renders a link back to the dashboard", () => {
    render(<NotFound />);
    expect(screen.getByText("Page not found")).toBeInTheDocument();
    expect(screen.getByText("Back to dashboard").closest("a")).toHaveAttribute(
      "href",
      "/dashboard"
    );
  });
});
