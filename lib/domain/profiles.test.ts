import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  createProfile,
  findEarliestProfileByRole,
  getProfileByAuthUserId,
  getProfileById,
  listProfilesByRole,
} from "@/lib/domain/profiles";

// Integration test — hits the live Supabase project via the service-role key. Skipped
// (not failed) when the key isn't available so `pnpm test:unit`/CI-without-secrets stays green.
describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)(
  "createProfile / getProfileByAuthUserId / getProfileById",
  () => {
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

    afterAll(async () => {
      await supabase.from("companies").delete().eq("slug", "test-co-profiles");
    });

    afterEach(async () => {
      if (createdAuthUserIds.length === 0) return;
      await supabase.from("profiles").delete().in("auth_user_id", createdAuthUserIds);
      for (const id of createdAuthUserIds) {
        await supabase.auth.admin.deleteUser(id);
      }
      createdAuthUserIds.length = 0;
    });

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

    it("creates a profile with a department and manager, and retrieves it by id", async () => {
      const { data: managerAuthUser, error: managerAuthError } =
        await supabase.auth.admin.createUser({
          email: `profile-test-manager-${crypto.randomUUID()}@example.com`,
          password: "password123",
          email_confirm: true,
        });
      if (managerAuthError || !managerAuthUser.user) throw managerAuthError;
      createdAuthUserIds.push(managerAuthUser.user.id);
      const manager = await createProfile({
        authUserId: managerAuthUser.user.id,
        companyId,
        fullName: "Test Manager",
        role: "manager",
      });

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
        fullName: "Test Employee",
        role: "employee",
        managerId: manager.id,
      });
      expect(created.managerId).toBe(manager.id);

      const fetched = await getProfileById(created.id);
      expect(fetched?.id).toBe(created.id);
      expect(fetched?.managerId).toBe(manager.id);
    });

    it("returns null from getProfileById when no profile exists for the id", async () => {
      const result = await getProfileById(crypto.randomUUID());
      expect(result).toBeNull();
    });

    it("lists profiles by role within a company, excluding the given profile", async () => {
      const { data: authUserA, error: authErrorA } = await supabase.auth.admin.createUser({
        email: `profile-test-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
      if (authErrorA || !authUserA.user) throw authErrorA;
      createdAuthUserIds.push(authUserA.user.id);
      const managerA = await createProfile({
        authUserId: authUserA.user.id,
        companyId,
        fullName: "Beta Manager",
        role: "manager",
      });

      const { data: authUserB, error: authErrorB } = await supabase.auth.admin.createUser({
        email: `profile-test-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
      if (authErrorB || !authUserB.user) throw authErrorB;
      createdAuthUserIds.push(authUserB.user.id);
      const managerB = await createProfile({
        authUserId: authUserB.user.id,
        companyId,
        fullName: "Alpha Manager",
        role: "manager",
      });

      const { data: authUserC, error: authErrorC } = await supabase.auth.admin.createUser({
        email: `profile-test-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
      if (authErrorC || !authUserC.user) throw authErrorC;
      createdAuthUserIds.push(authUserC.user.id);
      await createProfile({
        authUserId: authUserC.user.id,
        companyId,
        fullName: "An Employee",
        role: "employee",
      });

      const managers = await listProfilesByRole(companyId, "manager", managerA.id);
      expect(managers.map((p) => p.id)).toEqual([managerB.id]);
      expect(managers[0].fullName).toBe("Alpha Manager");
    });

    it("finds the earliest-created profile with a given role, or null if none exists", async () => {
      const { data: authUserA, error: authErrorA } = await supabase.auth.admin.createUser({
        email: `profile-test-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
      if (authErrorA || !authUserA.user) throw authErrorA;
      createdAuthUserIds.push(authUserA.user.id);
      const first = await createProfile({
        authUserId: authUserA.user.id,
        companyId,
        fullName: "First IT",
        role: "it",
      });

      const { data: authUserB, error: authErrorB } = await supabase.auth.admin.createUser({
        email: `profile-test-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
      if (authErrorB || !authUserB.user) throw authErrorB;
      createdAuthUserIds.push(authUserB.user.id);
      await createProfile({
        authUserId: authUserB.user.id,
        companyId,
        fullName: "Second IT",
        role: "it",
      });

      const earliest = await findEarliestProfileByRole(companyId, "it");
      expect(earliest?.id).toBe(first.id);

      const none = await findEarliestProfileByRole(companyId, "hr");
      expect(none).toBeNull();
    });
  }
);
