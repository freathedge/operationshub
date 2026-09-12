import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { completeAssetAssignmentTask } from "@/lib/domain/assets";
import { createAssetSchema } from "@/lib/validation/assets";
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
  const parsed = createAssetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { task, asset } = await completeAssetAssignmentTask(profile, id, parsed.data);
    return NextResponse.json({ task, asset });
  } catch (error) {
    return toErrorResponse(error);
  }
}
