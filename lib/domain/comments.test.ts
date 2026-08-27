import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { addComment, listComments } from "@/lib/domain/comments";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("addComment / listComments", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  let authorAuthUserId: string;
  let authorProfileId: string;
  const entityId = crypto.randomUUID();

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert({ name: "Test Co (comments)", slug: "test-co-comments" }, { onConflict: "slug" })
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: `comments-test-${crypto.randomUUID()}@example.com`,
      password: "password123",
      email_confirm: true,
    });
    if (authError || !authUser.user) throw authError;
    authorAuthUserId = authUser.user.id;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .insert({
        auth_user_id: authorAuthUserId,
        company_id: companyId,
        full_name: "Comments Test User",
        role: "employee",
      })
      .select("id")
      .single();
    if (profileError) throw profileError;
    authorProfileId = profile.id;
  });

  afterAll(async () => {
    await supabase.from("comments").delete().eq("entity_id", entityId);
    await supabase.from("profiles").delete().eq("id", authorProfileId);
    await supabase.auth.admin.deleteUser(authorAuthUserId);
    await supabase.from("companies").delete().eq("slug", "test-co-comments");
  });

  it("adds a comment and lists it back", async () => {
    const comment = await addComment("task", entityId, authorProfileId, "Looks good");
    expect(comment.body).toBe("Looks good");
    expect(comment.authorId).toBe(authorProfileId);

    const comments = await listComments("task", entityId);
    expect(comments.map((c) => c.id)).toContain(comment.id);
  });

  it("only returns comments for the requested entity", async () => {
    const otherEntityId = crypto.randomUUID();
    await addComment("task", otherEntityId, authorProfileId, "Different task");

    const comments = await listComments("task", entityId);
    expect(comments.every((c) => c.entityId === entityId)).toBe(true);

    await supabase.from("comments").delete().eq("entity_id", otherEntityId);
  });
});
