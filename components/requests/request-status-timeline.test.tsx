// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RequestStatusTimeline } from "@/components/requests/request-status-timeline";

describe("RequestStatusTimeline", () => {
  it("highlights the current step for an in-progress request", () => {
    render(<RequestStatusTimeline status="in_progress" />);
    expect(screen.getByText("In Progress")).toBeInTheDocument();
  });

  it("shows a rejected badge instead of the stepper when rejected", () => {
    render(<RequestStatusTimeline status="rejected" />);
    expect(screen.getByText("Rejected")).toBeInTheDocument();
    expect(screen.queryByText("Under Review")).not.toBeInTheDocument();
  });
});
