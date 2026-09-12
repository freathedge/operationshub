import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile, type Profile } from "@/lib/domain/profiles";
import {
  assignAsset,
  changeAssetStatus,
  createAsset,
  getAsset,
  listAssets,
} from "@/lib/domain/assets";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("assets", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  const createdAuthUserIds: string[] = [];
  let itProfile: Profile;
  let employeeProfile: Profile;

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert({ name: "Test Co (assets)", slug: "test-co-assets" }, { onConflict: "slug" })
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { data: itAuthUser, error: itAuthError } = await supabase.auth.admin.createUser({
      email: `assets-test-it-${crypto.randomUUID()}@example.com`,
      password: "password123",
      email_confirm: true,
    });
    if (itAuthError || !itAuthUser.user) throw itAuthError;
    createdAuthUserIds.push(itAuthUser.user.id);
    itProfile = await createProfile({ authUserId: itAuthUser.user.id, companyId, fullName: "IT Person", role: "it" });

    const { data: employeeAuthUser, error: employeeAuthError } = await supabase.auth.admin.createUser({
      email: `assets-test-employee-${crypto.randomUUID()}@example.com`,
      password: "password123",
      email_confirm: true,
    });
    if (employeeAuthError || !employeeAuthUser.user) throw employeeAuthError;
    createdAuthUserIds.push(employeeAuthUser.user.id);
    employeeProfile = await createProfile({
      authUserId: employeeAuthUser.user.id,
      companyId,
      fullName: "Regular Employee",
      role: "employee",
    });
  });

  afterAll(async () => {
    await supabase.from("assets").delete().eq("company_id", companyId);
    await supabase.from("profiles").delete().in("auth_user_id", createdAuthUserIds);
    for (const id of createdAuthUserIds) {
      await supabase.auth.admin.deleteUser(id);
    }
    await supabase.from("companies").delete().eq("slug", "test-co-assets");
  });

  it("rejects asset creation from a non-asset-manager role", async () => {
    await expect(
      createAsset(employeeProfile, { name: "Rejected Laptop", category: "laptop" })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("creates an asset with a sequential asset code", async () => {
    const first = await createAsset(itProfile, { name: "Laptop One", category: "laptop" });
    const second = await createAsset(itProfile, { name: "Laptop Two", category: "laptop" });

    expect(first.assetCode).toMatch(/^AST-\d{5}$/);
    expect(second.assetCode).not.toBe(first.assetCode);
    expect(first.status).toBe("available");
  });

  it("gets and lists assets, filtered by category", async () => {
    await createAsset(itProfile, { name: "Standing Desk", category: "furniture" });

    const fetched = await getAsset(itProfile, (await listAssets(itProfile, { category: "furniture" }))[0].id);
    expect(fetched.category).toBe("furniture");

    const laptops = await listAssets(itProfile, { category: "laptop" });
    expect(laptops.every((a) => a.category === "laptop")).toBe(true);
    expect(laptops.length).toBeGreaterThanOrEqual(2);
  });

  it("throws NotFoundError for an unknown asset id", async () => {
    await expect(getAsset(itProfile, crypto.randomUUID())).rejects.toBeInstanceOf(NotFoundError);
  });

  it("assigns an asset to an employee, setting status to assigned", async () => {
    const asset = await createAsset(itProfile, { name: "Assignable Laptop", category: "laptop" });
    const assigned = await assignAsset(itProfile, asset.id, employeeProfile.id);
    expect(assigned.assignedTo).toBe(employeeProfile.id);
    expect(assigned.status).toBe("assigned");
  });

  it("changes an asset's status", async () => {
    const asset = await createAsset(itProfile, { name: "Broken Laptop", category: "laptop" });
    const updated = await changeAssetStatus(itProfile, asset.id, "maintenance");
    expect(updated.status).toBe("maintenance");
  });
});
