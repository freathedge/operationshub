import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { createOperation, listOperations } from "@/lib/domain/operations";
import { createOperationSchema, operationFiltersSchema } from "@/lib/validation/operations";
import { toErrorResponse } from "@/lib/api/error-response";

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = operationFiltersSchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    departmentId: url.searchParams.get("departmentId") ?? undefined,
    ownerId: url.searchParams.get("ownerId") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const operations = await listOperations(profile, parsed.data);
    return NextResponse.json({ operations });
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
  const parsed = createOperationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const operation = await createOperation(profile, parsed.data);
    return NextResponse.json({ operation }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
