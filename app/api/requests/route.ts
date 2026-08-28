import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { createRequest, deleteRequest, listRequests, submitRequest } from "@/lib/domain/requests";
import { createRequestSchema, requestFiltersSchema } from "@/lib/validation/requests";
import { toErrorResponse } from "@/lib/api/error-response";

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = requestFiltersSchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    departmentId: url.searchParams.get("departmentId") ?? undefined,
    scope: url.searchParams.get("scope") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const requests = await listRequests(profile, parsed.data);
    return NextResponse.json({ requests });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = createRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let created: Awaited<ReturnType<typeof createRequest>> | undefined;
  try {
    created = await createRequest(profile, parsed.data);
    const submitted = await submitRequest(profile, created.id);
    return NextResponse.json({ request: submitted }, { status: 201 });
  } catch (error) {
    if (created) {
      try {
        await deleteRequest(created.id);
      } catch (cleanupError) {
        console.error("Failed to clean up orphaned draft request:", cleanupError);
      }
    }
    return toErrorResponse(error);
  }
}
