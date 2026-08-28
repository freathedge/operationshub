import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { listProfilesByRole } from "@/lib/domain/profiles";
import { roleSchema } from "@/lib/validation/auth";
import { toErrorResponse } from "@/lib/api/error-response";

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = roleSchema.safeParse(url.searchParams.get("role"));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const profiles = await listProfilesByRole(profile.companyId, parsed.data, profile.id);
    return NextResponse.json({ profiles });
  } catch (error) {
    return toErrorResponse(error);
  }
}
