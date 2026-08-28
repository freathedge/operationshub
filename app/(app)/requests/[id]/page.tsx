import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { getRequest } from "@/lib/domain/requests";
import { getApprovalForRequest } from "@/lib/domain/approvals";
import { getProfileById } from "@/lib/domain/profiles";
import { listComments } from "@/lib/domain/comments";
import { listActivity } from "@/lib/domain/activity";
import { createSignedDownloadUrl, listAttachments } from "@/lib/domain/attachments";
import { canDecideApproval } from "@/lib/domain/permissions";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";
import { BackLink } from "@/components/back-link";
import { RequestRealtimeRefresh } from "@/components/requests/request-realtime-refresh";
import { RequestStatusTimeline } from "@/components/requests/request-status-timeline";
import { RequestApprovalControl } from "@/components/requests/request-approval-control";
import { RequestReassignControl } from "@/components/requests/request-reassign-control";
import { RequestComments } from "@/components/requests/request-comments";
import { RequestAttachments } from "@/components/requests/request-attachments";

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  const { id } = await params;

  let request;
  try {
    request = await getRequest(profile, id);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) {
      notFound();
    }
    throw error;
  }

  const [comments, activity, attachments, approval] = await Promise.all([
    listComments("request", request.id),
    listActivity("request", request.id),
    listAttachments("request", request.id),
    getApprovalForRequest(request.id),
  ]);

  const attachmentsWithUrls = await Promise.all(
    attachments.map(async (attachment) => ({
      ...attachment,
      downloadUrl: await createSignedDownloadUrl(attachment.storagePath),
    }))
  );

  const canDecide =
    approval !== null && approval.status === "pending" && canDecideApproval(profile, approval);

  const approverProfile =
    canDecide && approval?.approverId ? await getProfileById(approval.approverId) : null;

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <RequestRealtimeRefresh companyId={profile.companyId} />

      <BackLink href="/requests" />

      <div>
        <h1 className="text-2xl font-semibold">{request.title}</h1>
        {request.description && (
          <p className="mt-2 text-muted-foreground">{request.description}</p>
        )}
      </div>

      <RequestStatusTimeline status={request.status} />

      {canDecide && approval && <RequestApprovalControl approvalId={approval.id} />}

      {canDecide && approval && approverProfile && (
        <RequestReassignControl
          approvalId={approval.id}
          currentApproverRole={approverProfile.role}
        />
      )}

      <section>
        <h2 className="text-lg font-medium mb-2">Activity</h2>
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
          {activity.map((entry) => (
            <li key={entry.id}>{entry.message}</li>
          ))}
          {activity.length === 0 && <li>No activity yet.</li>}
        </ul>
      </section>

      <RequestComments requestId={request.id} initialComments={comments} />

      <RequestAttachments requestId={request.id} initialAttachments={attachmentsWithUrls} />
    </div>
  );
}
