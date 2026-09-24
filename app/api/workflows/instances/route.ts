import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { listWorkflowInstances } from "@/lib/domain/workflows";
import { workflowInstanceFiltersSchema } from "@/lib/validation/workflows";
import { toErrorResponse } from "@/lib/api/error-response";

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = workflowInstanceFiltersSchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    scope: url.searchParams.get("scope") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const instances = await listWorkflowInstances(profile, parsed.data);
    return NextResponse.json({ instances });
  } catch (error) {
    return toErrorResponse(error);
  }
}
