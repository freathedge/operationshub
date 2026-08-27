import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { getTask } from "@/lib/domain/tasks";
import { listComments } from "@/lib/domain/comments";
import { listActivity } from "@/lib/domain/activity";
import { createSignedDownloadUrl, listAttachments } from "@/lib/domain/attachments";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";
import { TaskRealtimeRefresh } from "@/components/tasks/task-realtime-refresh";
import { TaskStatusControl } from "@/components/tasks/task-status-control";
import { TaskComments } from "@/components/tasks/task-comments";
import { TaskAttachments } from "@/components/tasks/task-attachments";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  const { id } = await params;

  let task;
  try {
    task = await getTask(profile, id);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) {
      notFound();
    }
    throw error;
  }

  const [comments, activity, attachments] = await Promise.all([
    listComments("task", task.id),
    listActivity("task", task.id),
    listAttachments("task", task.id),
  ]);

  const attachmentsWithUrls = await Promise.all(
    attachments.map(async (attachment) => ({
      ...attachment,
      downloadUrl: await createSignedDownloadUrl(attachment.storagePath),
    }))
  );

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <TaskRealtimeRefresh companyId={profile.companyId} />

      <div>
        <h1 className="text-2xl font-semibold">{task.title}</h1>
        {task.description && (
          <p className="mt-2 text-muted-foreground">{task.description}</p>
        )}
      </div>

      <TaskStatusControl taskId={task.id} currentStatus={task.status} />

      <section>
        <h2 className="text-lg font-medium mb-2">Activity</h2>
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
          {activity.map((entry) => (
            <li key={entry.id}>{entry.message}</li>
          ))}
          {activity.length === 0 && <li>No activity yet.</li>}
        </ul>
      </section>

      <TaskComments taskId={task.id} initialComments={comments} />

      <TaskAttachments taskId={task.id} initialAttachments={attachmentsWithUrls} />
    </div>
  );
}
