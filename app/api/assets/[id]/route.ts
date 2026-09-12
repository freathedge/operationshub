import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { assignAsset, changeAssetStatus, getAsset } from "@/lib/domain/assets";
import { patchAssetSchema } from "@/lib/validation/assets";
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
    const asset = await getAsset(profile, id);
    return NextResponse.json({ asset });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(
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
  const parsed = patchAssetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const asset =
      parsed.data.action === "assign"
        ? await assignAsset(profile, id, parsed.data.targetEmployeeId)
        : await changeAssetStatus(profile, id, parsed.data.status);
    return NextResponse.json({ asset });
  } catch (error) {
    return toErrorResponse(error);
  }
}
