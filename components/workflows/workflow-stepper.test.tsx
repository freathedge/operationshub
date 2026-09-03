// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkflowStepper } from "@/components/workflows/workflow-stepper";
import type { WorkflowProgress } from "@/lib/domain/workflows";

const PROGRESS: WorkflowProgress = {
  instance: {
    id: "instance-1",
    companyId: "company-1",
    templateId: "template-1",
    relatedRequestId: "request-1",
    status: "in_progress",
    createdAt: "2026-08-28T00:00:00.000Z",
  },
  steps: [
    {
      id: "step-1",
      instanceId: "instance-1",
      templateStepId: "template-step-1",
      stepOrder: 1,
      status: "completed",
      generatedTaskId: null,
      generatedApprovalId: "approval-1",
      createdAt: "2026-08-28T00:00:00.000Z",
      completedAt: "2026-08-28T01:00:00.000Z",
      title: "IT Review",
      description: null,
      stepType: "approval",
      responsibleRole: "it",
      responsibleDepartmentName: null,
    },
    {
      id: "step-2",
      instanceId: "instance-1",
      templateStepId: "template-step-2",
      stepOrder: 2,
      status: "in_progress",
      generatedTaskId: "task-1",
      generatedApprovalId: null,
      createdAt: "2026-08-28T01:00:00.000Z",
      completedAt: null,
      title: "Procurement",
      description: null,
      stepType: "task",
      responsibleRole: null,
      responsibleDepartmentName: "Procurement",
    },
  ],
};

describe("WorkflowStepper", () => {
  it("renders every step with its title and status", () => {
    render(<WorkflowStepper progress={PROGRESS} />);
    expect(screen.getByText("IT Review")).toBeInTheDocument();
    expect(screen.getByText("Procurement")).toBeInTheDocument();
    expect(screen.getAllByText("Completed")).toHaveLength(1);
    expect(screen.getAllByText("In Progress")).toHaveLength(2); // one badge for the step, one for the instance
  });

  it("links to the generated task when a step produced one", () => {
    render(<WorkflowStepper progress={PROGRESS} />);
    const link = screen.getByRole("link", { name: "View task" });
    expect(link).toHaveAttribute("href", "/tasks/task-1");
  });

  it("shows the responsible department or role", () => {
    render(<WorkflowStepper progress={PROGRESS} />);
    expect(screen.getByText(/Procurement/)).toBeInTheDocument();
    expect(screen.getByText(/It/)).toBeInTheDocument();
  });
});
