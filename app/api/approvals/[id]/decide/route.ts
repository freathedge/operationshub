import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { decideApproval } from "@/lib/domain/approvals";
import { decideApprovalSchema } from "@/lib/validation/requests";
import { toErrorResponse } from "@/lib/api/error-response";

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
  const parsed = decideApprovalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const approval = await decideApproval(profile, id, parsed.data.decision, parsed.data.comment);
    return NextResponse.json({ approval });
  } catch (error) {
    return toErrorResponse(error);
  }
}
