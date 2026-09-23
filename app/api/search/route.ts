import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { search } from "@/lib/domain/search";
import { toErrorResponse } from "@/lib/api/error-response";

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";

  try {
    const results = await search(profile, query);
    return NextResponse.json({ results });
  } catch (error) {
    return toErrorResponse(error);
  }
}
