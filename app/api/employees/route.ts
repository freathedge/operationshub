import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { createEmployee, listEmployees } from "@/lib/domain/employees";
import { createEmployeeSchema, employeeFiltersSchema } from "@/lib/validation/employees";
import { toErrorResponse } from "@/lib/api/error-response";

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = employeeFiltersSchema.safeParse({
    departmentId: url.searchParams.get("departmentId") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const employees = await listEmployees(profile, parsed.data);
    return NextResponse.json({ employees });
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
  const parsed = createEmployeeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const employee = await createEmployee(profile, parsed.data);
    return NextResponse.json({ employee }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
