import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { linkEntity, unlinkEntity } from "@/lib/domain/operations";
import { linkActionSchema } from "@/lib/validation/operations";
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
  const parsed = linkActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    if (parsed.data.action === "link") {
      await linkEntity(profile, id, parsed.data.entityType, parsed.data.entityId);
    } else {
      await unlinkEntity(profile, id, parsed.data.entityType, parsed.data.entityId);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
