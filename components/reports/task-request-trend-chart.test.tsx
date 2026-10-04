// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TaskRequestTrendChart } from "@/components/reports/task-request-trend-chart";
import type { WeeklyTrend } from "@/lib/domain/reports";

const sampleData: WeeklyTrend[] = [
  { weekStart: "2026-08-31", completedTasks: 4, newRequests: 2 },
  { weekStart: "2026-09-07", completedTasks: 6, newRequests: 3 },
  { weekStart: "2026-09-14", completedTasks: 0, newRequests: 0 },
];

describe("TaskRequestTrendChart", () => {
  it("renders the card title", () => {
    render(<TaskRequestTrendChart data={sampleData} />);
    expect(screen.getByText("Tasks Completed & Requests Received, by Week")).toBeInTheDocument();
  });

  it("renders without crashing when every week is zero", () => {
    render(
      <TaskRequestTrendChart
        data={[{ weekStart: "2026-09-14", completedTasks: 0, newRequests: 0 }]}
      />
    );
    expect(screen.getByText("Tasks Completed & Requests Received, by Week")).toBeInTheDocument();
  });
});
