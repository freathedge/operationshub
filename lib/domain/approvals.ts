import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getProfileById, type Profile } from "@/lib/domain/profiles";
import { logActivity } from "@/lib/domain/activity";
import { broadcastChange } from "@/lib/realtime/broadcast";
import { createNotification } from "@/lib/domain/notifications";
import { canDecideApproval, canReassignApproval } from "@/lib/domain/permissions";
import { loadRequestOrThrow } from "@/lib/domain/requests";
import {
  ForbiddenError,
  InvalidTransitionError,
  NotFoundError,
  UnprocessableRequestError,
} from "@/lib/domain/errors";

export interface Approval {
  id: string;
  requestId: string;
  approverId: string | null;
  status: "pending" | "approved" | "rejected";
  decidedAt: string | null;
  comment: string | null;
  createdAt: string;
}

interface ApprovalRow {
  id: string;
  request_id: string;
  approver_id: string | null;
  status: "pending" | "approved" | "rejected";
  decided_at: string | null;
  comment: string | null;
  created_at: string;
}

function toApproval(row: ApprovalRow): Approval {
  return {
    id: row.id,
    requestId: row.request_id,
    approverId: row.approver_id,
    status: row.status,
    decidedAt: row.decided_at,
    comment: row.comment,
    createdAt: row.created_at,
  };
}

const APPROVAL_COLUMNS = "id, request_id, approver_id, status, decided_at, comment, created_at";

export async function getApprovalForRequest(requestId: string): Promise<Approval | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("approvals")
    .select(APPROVAL_COLUMNS)
    .eq("request_id", requestId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return toApproval(data);
}

export async function decideApproval(
  profile: Profile,
  approvalId: string,
  decision: "approved" | "rejected",
  comment?: string
): Promise<Approval> {
  const supabase = createSupabaseAdminClient();
  const { data: approvalRow, error: loadError } = await supabase
    .from("approvals")
    .select(APPROVAL_COLUMNS)
    .eq("id", approvalId)
    .maybeSingle();
  if (loadError) throw loadError;
  if (!approvalRow) throw new NotFoundError("Approval not found");

  const approval = toApproval(approvalRow);
  if (approval.status !== "pending") {
    throw new InvalidTransitionError(`Cannot decide an approval with status "${approval.status}"`);
  }

  if (!canDecideApproval(profile, approval)) {
    throw new ForbiddenError("You cannot decide this approval");
  }

  const request = await loadRequestOrThrow(approval.requestId);
  if (request.companyId !== profile.companyId) {
    throw new ForbiddenError("You cannot decide this approval");
  }

  const { data: updatedRow, error: updateError } = await supabase
    .from("approvals")
    .update({
      status: decision,
      decided_at: new Date().toISOString(),
      comment: comment ?? null,
    })
    .eq("id", approvalId)
    .select(APPROVAL_COLUMNS)
    .single();
  if (updateError) throw updateError;
  const updatedApproval = toApproval(updatedRow);

  const newRequestStatus = decision === "approved" ? "approved" : "rejected";
  const { error: requestUpdateError } = await supabase
    .from("requests")
    .update({ status: newRequestStatus })
    .eq("id", approval.requestId);
  if (requestUpdateError) throw requestUpdateError;

  await logActivity(
    "request",
    approval.requestId,
    profile.id,
    `${profile.fullName} ${decision} this request`
  );

  if (request.createdBy) {
    await createNotification(
      request.createdBy,
      "request",
      request.id,
      "request_status_changed",
      `Your request "${request.title}" was ${decision}`
    );
  }

  try {
    await broadcastChange(request.companyId, "requests", { type: "request_updated" });
  } catch (broadcastError) {
    console.error("broadcastChange failed:", broadcastError);
  }

  return updatedApproval;
}

export async function reassignApproval(
  profile: Profile,
  approvalId: string,
  newApproverId: string,
  comment?: string
): Promise<Approval> {
  const supabase = createSupabaseAdminClient();
  const { data: approvalRow, error: loadError } = await supabase
    .from("approvals")
    .select(APPROVAL_COLUMNS)
    .eq("id", approvalId)
    .maybeSingle();
  if (loadError) throw loadError;
  if (!approvalRow) throw new NotFoundError("Approval not found");

  const approval = toApproval(approvalRow);
  if (approval.status !== "pending") {
    throw new InvalidTransitionError(
      `Cannot reassign an approval with status "${approval.status}"`
    );
  }

  if (!canReassignApproval(profile, approval)) {
    throw new ForbiddenError("You cannot reassign this approval");
  }

  const request = await loadRequestOrThrow(approval.requestId);
  if (request.companyId !== profile.companyId) {
    throw new ForbiddenError("You cannot reassign this approval");
  }

  if (!approval.approverId) {
    throw new UnprocessableRequestError("This approval has no current approver to reassign from");
  }
  const currentApprover = await getProfileById(approval.approverId);
  if (!currentApprover) {
    throw new UnprocessableRequestError("The current approver no longer exists");
  }

  if (newApproverId === approval.approverId) {
    throw new UnprocessableRequestError("The approval is already assigned to this person");
  }

  const newApprover = await getProfileById(newApproverId);
  if (!newApprover || newApprover.companyId !== profile.companyId) {
    throw new NotFoundError("New approver not found");
  }
  if (newApprover.role !== currentApprover.role) {
    throw new UnprocessableRequestError(
      "The new approver must have the same role as the current approver"
    );
  }

  const { data: updatedRow, error: updateError } = await supabase
    .from("approvals")
    .update({ approver_id: newApproverId })
    .eq("id", approvalId)
    .select(APPROVAL_COLUMNS)
    .single();
  if (updateError) throw updateError;
  const updatedApproval = toApproval(updatedRow);

  await logActivity(
    "request",
    approval.requestId,
    profile.id,
    `${profile.fullName} reassigned this approval from ${currentApprover.fullName} to ${newApprover.fullName}${comment ? `: ${comment}` : ""}`
  );

  await createNotification(
    newApprover.id,
    "request",
    request.id,
    "approval_required",
    `${profile.fullName} reassigned "${request.title}" to you for approval`
  );

  try {
    await broadcastChange(request.companyId, "requests", { type: "request_updated" });
  } catch (broadcastError) {
    console.error("broadcastChange failed:", broadcastError);
  }

  return updatedApproval;
}
