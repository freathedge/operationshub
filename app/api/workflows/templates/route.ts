import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { listWorkflowTemplates } from "@/lib/domain/workflows";
import { toErrorResponse } from "@/lib/api/error-response";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const templates = await listWorkflowTemplates(profile.companyId);
    return NextResponse.json({ templates });
  } catch (error) {
    return toErrorResponse(error);
  }
}
