import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { completeSignupSchema } from "@/lib/validation/auth";
import { createProfile, getProfileByAuthUserId } from "@/lib/domain/profiles";
import { getDefaultCompany } from "@/lib/domain/companies";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const existing = await getProfileByAuthUserId(userId);
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
      authUserId: userId,
      companyId: company.id,
      fullName: parsed.data.fullName,
      role: parsed.data.role,
    });

    return NextResponse.json({ profile }, { status: 201 });
  } catch (error) {
    console.error("complete-signup failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
