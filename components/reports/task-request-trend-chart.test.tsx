// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import type { WeeklyTrend } from "@/lib/domain/reports";

const sampleData: WeeklyTrend[] = [
  { weekStart: "2026-08-31", completedTasks: 4, newRequests: 2 },
  { weekStart: "2026-09-07", completedTasks: 6, newRequests: 3 },
  { weekStart: "2026-09-14", completedTasks: 0, newRequests: 0 },
];

// Mock recharts' ResponsiveContainer to render content at fixed size
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");

  // Create a wrapper that renders the LineChart with explicit dimensions
  const MockResponsiveContainer = React.forwardRef<
    HTMLDivElement,
    { children: React.ReactNode; width?: number | string; height?: number | string }
  >(({ children }, ref) => (
    <div ref={ref} style={{ width: 600, height: 300 }}>
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child, { width: 600, height: 300 } as any)
          : child
      )}
    </div>
  ));
  MockResponsiveContainer.displayName = "MockResponsiveContainer";

  return {
    ...actual,
    ResponsiveContainer: MockResponsiveContainer,
  };
});

// Import after mocking
import { TaskRequestTrendChart } from "@/components/reports/task-request-trend-chart";

describe("TaskRequestTrendChart", () => {
  it("renders both lines from the data fixture", () => {
    const { container } = render(<TaskRequestTrendChart data={sampleData} />);

    // Check title renders
    expect(screen.getByText("Tasks Completed & Requests Received, by Week")).toBeInTheDocument();

    // Check legend labels are visible (they're rendered by the legend component)
    expect(screen.getByText("Completed Tasks")).toBeInTheDocument();
    expect(screen.getByText("New Requests")).toBeInTheDocument();

    // Check both line elements render
    const lineElements = container.querySelectorAll(".recharts-line");
    expect(lineElements.length).toBeGreaterThanOrEqual(2);
  });

  it("renders both series when every week is zero", () => {
    const { container } = render(
      <TaskRequestTrendChart
        data={[{ weekStart: "2026-09-14", completedTasks: 0, newRequests: 0 }]}
      />
    );

    // Check title renders
    expect(screen.getByText("Tasks Completed & Requests Received, by Week")).toBeInTheDocument();

    // Check legend labels are visible
    expect(screen.getByText("Completed Tasks")).toBeInTheDocument();
    expect(screen.getByText("New Requests")).toBeInTheDocument();

    // Check both line elements still render
    const lineElements = container.querySelectorAll(".recharts-line");
    expect(lineElements.length).toBeGreaterThanOrEqual(2);
  });

  it("forwards className prop to the chart container", () => {
    const { container } = render(
      <TaskRequestTrendChart data={sampleData} className="aspect-auto h-[250px] w-full" />
    );

    const chartContainer = container.querySelector('[data-slot="chart"]');
    expect(chartContainer).toBeInTheDocument();
    expect(chartContainer).toHaveClass("aspect-auto");
    expect(chartContainer).toHaveClass("h-[250px]");
    expect(chartContainer).toHaveClass("w-full");
  });
});
