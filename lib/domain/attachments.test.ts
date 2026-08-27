import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  createSignedDownloadUrl,
  createSignedUploadUrl,
  listAttachments,
} from "@/lib/domain/attachments";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)(
  "createSignedUploadUrl / createSignedDownloadUrl / listAttachments",
  () => {
    const supabase = createSupabaseAdminClient();
    let companyId: string;
    let uploaderAuthUserId: string;
    let uploaderProfileId: string;
    const entityId = crypto.randomUUID();
    const createdPaths: string[] = [];

    beforeAll(async () => {
      const { data: company, error: companyError } = await supabase
        .from("companies")
        .upsert(
          { name: "Test Co (attachments)", slug: "test-co-attachments" },
          { onConflict: "slug" }
        )
        .select("id")
        .single();
      if (companyError) throw companyError;
      companyId = company.id;

      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email: `attachments-test-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
      if (authError || !authUser.user) throw authError;
      uploaderAuthUserId = authUser.user.id;

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .insert({
          auth_user_id: uploaderAuthUserId,
          company_id: companyId,
          full_name: "Attachments Test User",
          role: "employee",
        })
        .select("id")
        .single();
      if (profileError) throw profileError;
      uploaderProfileId = profile.id;
    });

    afterAll(async () => {
      if (createdPaths.length > 0) {
        await supabase.storage.from("attachments").remove(createdPaths);
      }
      await supabase.from("attachments").delete().eq("entity_id", entityId);
      await supabase.from("profiles").delete().eq("id", uploaderProfileId);
      await supabase.auth.admin.deleteUser(uploaderAuthUserId);
      await supabase.from("companies").delete().eq("slug", "test-co-attachments");
    });

    it("creates a signed upload URL, records the attachment, and lists it back", async () => {
      const result = await createSignedUploadUrl(
        "task",
        entityId,
        uploaderProfileId,
        "invoice.pdf"
      );
      createdPaths.push(result.attachment.storagePath);

      expect(result.signedUrl).toBeTruthy();
      expect(result.token).toBeTruthy();
      expect(result.attachment.uploadedBy).toBe(uploaderProfileId);

      const attachments = await listAttachments("task", entityId);
      expect(attachments.map((a) => a.id)).toContain(result.attachment.id);
    });

    it("creates a signed download URL for a stored path", async () => {
      const result = await createSignedUploadUrl(
        "task",
        entityId,
        uploaderProfileId,
        "photo.png"
      );
      createdPaths.push(result.attachment.storagePath);

      // A signed upload URL only reserves the path; the object must actually
      // be uploaded before Storage will issue a signed download URL for it.
      const { error: uploadError } = await supabase.storage
        .from("attachments")
        .uploadToSignedUrl(result.attachment.storagePath, result.token, Buffer.from("test"));
      if (uploadError) throw uploadError;

      const downloadUrl = await createSignedDownloadUrl(result.attachment.storagePath);
      expect(downloadUrl).toBeTruthy();
    });

    it("returns null for a path that was never uploaded to", async () => {
      const orphanedPath = `task/${entityId}/${crypto.randomUUID()}-orphaned.pdf`;

      const downloadUrl = await createSignedDownloadUrl(orphanedPath);
      expect(downloadUrl).toBeNull();
    });
  }
);
