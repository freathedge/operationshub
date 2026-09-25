// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "@/components/page-header";

describe("PageHeader", () => {
  it("renders the title", () => {
    render(<PageHeader title="Tasks" />);
    expect(screen.getByRole("heading", { name: "Tasks" })).toBeInTheDocument();
  });

  it("renders a subtitle when provided", () => {
    render(<PageHeader title="Tasks" subtitle="Everything assigned to your team" />);
    expect(screen.getByText("Everything assigned to your team")).toBeInTheDocument();
  });

  it("omits the subtitle paragraph when none is provided", () => {
    const { container } = render(<PageHeader title="Tasks" />);
    expect(container.querySelectorAll("p").length).toBe(0);
  });

  it("renders the action slot when provided", () => {
    render(<PageHeader title="Tasks" action={<button>New task</button>} />);
    expect(screen.getByRole("button", { name: "New task" })).toBeInTheDocument();
  });
});
