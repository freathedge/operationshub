import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { createAsset, listAssets } from "@/lib/domain/assets";
import { createAssetSchema, assetFiltersSchema } from "@/lib/validation/assets";
import { toErrorResponse } from "@/lib/api/error-response";

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = assetFiltersSchema.safeParse({
    category: url.searchParams.get("category") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    departmentId: url.searchParams.get("departmentId") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const assets = await listAssets(profile, parsed.data);
    return NextResponse.json({ assets });
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
  const parsed = createAssetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const asset = await createAsset(profile, parsed.data);
    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
