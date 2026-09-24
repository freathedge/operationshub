import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { getWorkflowProgress } from "@/lib/domain/workflows";
import { listActivity } from "@/lib/domain/activity";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";
import { BackLink } from "@/components/back-link";
import { WorkflowRealtimeRefresh } from "@/components/workflows/workflow-realtime-refresh";
import { WorkflowStepper } from "@/components/workflows/workflow-stepper";

export default async function WorkflowInstancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  const { id } = await params;

  let progress;
  try {
    progress = await getWorkflowProgress(profile, id);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) {
      notFound();
    }
    throw error;
  }

  const backHref = progress.instance.relatedRequestId
    ? `/requests/${progress.instance.relatedRequestId}`
    : "/dashboard";

  const activity = await listActivity("workflow", progress.instance.id);

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <WorkflowRealtimeRefresh companyId={profile.companyId} />
      <BackLink href={backHref} />
      <WorkflowStepper progress={progress} />

      <section>
        <h2 className="text-lg font-medium mb-2">Activity</h2>
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
          {activity.map((entry) => (
            <li key={entry.id}>{entry.message}</li>
          ))}
          {activity.length === 0 && <li>No activity yet.</li>}
        </ul>
      </section>
    </div>
  );
}
