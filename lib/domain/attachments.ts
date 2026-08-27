import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const ATTACHMENTS_BUCKET = "attachments";

export interface Attachment {
  id: string;
  entityType: string;
  entityId: string;
  storagePath: string;
  uploadedBy: string | null;
  createdAt: string;
}

interface AttachmentRow {
  id: string;
  entity_type: string;
  entity_id: string;
  storage_path: string;
  uploaded_by: string | null;
  created_at: string;
}

function toAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    storagePath: row.storage_path,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  };
}

const ATTACHMENT_COLUMNS = "id, entity_type, entity_id, storage_path, uploaded_by, created_at";

export async function createSignedUploadUrl(
  entityType: string,
  entityId: string,
  uploadedBy: string,
  filename: string
): Promise<{ attachment: Attachment; signedUrl: string; token: string }> {
  const supabase = createSupabaseAdminClient();
  const storagePath = `${entityType}/${entityId}/${crypto.randomUUID()}-${filename}`;

  const { data: signed, error: signedError } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUploadUrl(storagePath);
  if (signedError) throw signedError;

  const { data, error } = await supabase
    .from("attachments")
    .insert({
      entity_type: entityType,
      entity_id: entityId,
      storage_path: storagePath,
      uploaded_by: uploadedBy,
    })
    .select(ATTACHMENT_COLUMNS)
    .single();
  if (error) throw error;

  return { attachment: toAttachment(data), signedUrl: signed.signedUrl, token: signed.token };
}

export async function createSignedDownloadUrl(storagePath: string): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function listAttachments(
  entityType: string,
  entityId: string
): Promise<Attachment[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("attachments")
    .select(ATTACHMENT_COLUMNS)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toAttachment);
}
