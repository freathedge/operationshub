import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile, getProfileByAuthUserId } from "@/lib/domain/profiles";

const supabase = createSupabaseAdminClient();
let companyId: string;
const createdAuthUserIds: string[] = [];

beforeAll(async () => {
  const { data, error } = await supabase
    .from("companies")
    .upsert(
      { name: "Test Co (profiles)", slug: "test-co-profiles" },
      { onConflict: "slug" }
    )
    .select("id")
    .single();
  if (error) throw error;
  companyId = data.id;
});

afterEach(async () => {
  if (createdAuthUserIds.length === 0) return;
  await supabase.from("profiles").delete().in("auth_user_id", createdAuthUserIds);
  for (const id of createdAuthUserIds) {
    await supabase.auth.admin.deleteUser(id);
  }
  createdAuthUserIds.length = 0;
});

describe("createProfile / getProfileByAuthUserId", () => {
  it("creates a profile and retrieves it by auth user id", async () => {
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: `profile-test-${crypto.randomUUID()}@example.com`,
      password: "password123",
      email_confirm: true,
    });
    if (authError || !authUser.user) throw authError;
    createdAuthUserIds.push(authUser.user.id);

    const created = await createProfile({
      authUserId: authUser.user.id,
      companyId,
      fullName: "Test User",
      role: "employee",
    });

    expect(created.fullName).toBe("Test User");
    expect(created.role).toBe("employee");
    expect(created.departmentId).toBeNull();

    const fetched = await getProfileByAuthUserId(authUser.user.id);
    expect(fetched?.id).toBe(created.id);
  });

  it("returns null when no profile exists for the auth user id", async () => {
    const result = await getProfileByAuthUserId(crypto.randomUUID());
    expect(result).toBeNull();
  });
});
