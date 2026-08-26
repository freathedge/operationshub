import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { completeSignupSchema } from "@/lib/validation/auth";
import { createProfile, getProfileByAuthUserId } from "@/lib/domain/profiles";
import { getDefaultCompany } from "@/lib/domain/companies";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const existing = await getProfileByAuthUserId(user.id);
  if (existing) {
    return NextResponse.json({ error: "Profile already exists" }, { status: 409 });
  }

  const body = await request.json();
  const parsed = completeSignupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const company = await getDefaultCompany();
  const profile = await createProfile({
    authUserId: user.id,
    companyId: company.id,
    fullName: parsed.data.fullName,
    role: parsed.data.role,
  });

  return NextResponse.json({ profile }, { status: 201 });
}
