import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { resendEmployeeInvite } from "@/lib/domain/employees";
import { toErrorResponse } from "@/lib/api/error-response";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;

  try {
    await resendEmployeeInvite(profile, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
