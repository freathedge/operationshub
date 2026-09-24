import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { listApprovals } from "@/lib/domain/approvals";
import { approvalFiltersSchema } from "@/lib/validation/requests";
import { toErrorResponse } from "@/lib/api/error-response";

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = approvalFiltersSchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    scope: url.searchParams.get("scope") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const approvals = await listApprovals(profile, parsed.data);
    return NextResponse.json({ approvals });
  } catch (error) {
    return toErrorResponse(error);
  }
}
