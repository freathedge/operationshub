import type { RequestStatus } from "@/lib/domain/request-status";

const STEPS: RequestStatus[] = ["draft", "under_review", "approved", "in_progress", "completed"];

function formatStepLabel(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function RequestStatusTimeline({ status }: { status: RequestStatus }) {
  if (status === "rejected") {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="rounded-full bg-red-100 px-3 py-1 font-medium text-red-700">
          Rejected
        </span>
      </div>
    );
  }

  const currentIndex = STEPS.indexOf(status === "submitted" ? "under_review" : status);

  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm">
      {STEPS.map((step, index) => {
        const isComplete = index < currentIndex;
        const isCurrent = index === currentIndex;
        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className={
                isCurrent
                  ? "rounded-full bg-primary px-3 py-1 font-medium text-primary-foreground"
                  : isComplete
                    ? "rounded-full bg-muted px-3 py-1 text-muted-foreground line-through"
                    : "rounded-full border px-3 py-1 text-muted-foreground"
              }
            >
              {formatStepLabel(step)}
            </span>
            {index < STEPS.length - 1 && <span className="text-muted-foreground">→</span>}
          </li>
        );
      })}
    </ol>
  );
}
