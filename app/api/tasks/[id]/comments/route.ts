import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { getTask } from "@/lib/domain/tasks";
import { canComment } from "@/lib/domain/permissions";
import { addComment, listComments } from "@/lib/domain/comments";
import { logActivity } from "@/lib/domain/activity";
import { broadcastChange } from "@/lib/realtime/broadcast";
import { addCommentSchema } from "@/lib/validation/tasks";
import { toErrorResponse } from "@/lib/api/error-response";
import { ForbiddenError } from "@/lib/domain/errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;

  try {
    const task = await getTask(profile, id);
    if (!canComment(profile, task)) {
      throw new ForbiddenError("You cannot view comments on this task");
    }
    const comments = await listComments("task", task.id);
    return NextResponse.json({ comments });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = addCommentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const task = await getTask(profile, id);
    if (!canComment(profile, task)) {
      throw new ForbiddenError("You cannot comment on this task");
    }
    const comment = await addComment("task", task.id, profile.id, parsed.data.body);
    await logActivity("task", task.id, profile.id, `${profile.fullName} commented on this task`);
    try {
      await broadcastChange(profile.companyId, "tasks", { type: "task_updated" });
    } catch (error) {
      console.error("broadcastChange failed:", error);
    }
    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
