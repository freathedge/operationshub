import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { getWorkflowProgress } from "@/lib/domain/workflows";
import { toErrorResponse } from "@/lib/api/error-response";

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
    const progress = await getWorkflowProgress(profile, id);
    return NextResponse.json(progress);
  } catch (error) {
    return toErrorResponse(error);
  }
}
