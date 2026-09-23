import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { getCompanyOverview } from "@/lib/domain/dashboard";
import { toErrorResponse } from "@/lib/api/error-response";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const overview = await getCompanyOverview(profile);
    return NextResponse.json({ overview });
  } catch (error) {
    return toErrorResponse(error);
  }
}
