import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface Comment {
  id: string;
  entityType: string;
  entityId: string;
  authorId: string | null;
  body: string;
  createdAt: string;
}

interface CommentRow {
  id: string;
  entity_type: string;
  entity_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

function toComment(row: CommentRow): Comment {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    authorId: row.author_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

const COMMENT_COLUMNS = "id, entity_type, entity_id, author_id, body, created_at";

export async function addComment(
  entityType: string,
  entityId: string,
  authorId: string,
  body: string
): Promise<Comment> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("comments")
    .insert({ entity_type: entityType, entity_id: entityId, author_id: authorId, body })
    .select(COMMENT_COLUMNS)
    .single();
  if (error) throw error;
  return toComment(data);
}

export async function listComments(entityType: string, entityId: string): Promise<Comment[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("comments")
    .select(COMMENT_COLUMNS)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toComment);
}
