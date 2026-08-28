import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { WorkflowProgress } from "@/lib/domain/workflows";

function formatLabel(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function stepBadgeVariant(status: "pending" | "in_progress" | "completed") {
  if (status === "completed") return "default" as const;
  if (status === "in_progress") return "secondary" as const;
  return "outline" as const;
}

export function WorkflowStepper({ progress }: { progress: WorkflowProgress }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-medium">Workflow progress</h2>
        <Badge variant={progress.instance.status === "completed" ? "default" : "secondary"}>
          {formatLabel(progress.instance.status)}
        </Badge>
      </div>
      <ol className="flex flex-col gap-2">
        {progress.steps.map((step) => (
          <li
            key={step.id}
            className="flex items-center justify-between gap-4 rounded-md border p-3 text-sm"
          >
            <div className="flex flex-col gap-1">
              <span className="font-medium">{step.title}</span>
              <span className="text-muted-foreground">
                {step.responsibleRole
                  ? formatLabel(step.responsibleRole)
                  : step.responsibleDepartmentName !== step.title
                    ? step.responsibleDepartmentName
                    : null}
                {(step.responsibleRole || (step.responsibleDepartmentName && step.responsibleDepartmentName !== step.title)) && " · "}
                {formatLabel(step.stepType)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {step.generatedTaskId && (
                <Link href={`/tasks/${step.generatedTaskId}`} className="text-primary hover:underline">
                  View task
                </Link>
              )}
              <Badge variant={stepBadgeVariant(step.status)}>{formatLabel(step.status)}</Badge>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
