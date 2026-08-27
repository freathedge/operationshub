import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface ActivityEntry {
  id: string;
  entityType: string;
  entityId: string;
  actorId: string | null;
  message: string;
  createdAt: string;
}

interface ActivityRow {
  id: string;
  entity_type: string;
  entity_id: string;
  actor_id: string | null;
  message: string;
  created_at: string;
}

function toActivityEntry(row: ActivityRow): ActivityEntry {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    actorId: row.actor_id,
    message: row.message,
    createdAt: row.created_at,
  };
}

const ACTIVITY_COLUMNS = "id, entity_type, entity_id, actor_id, message, created_at";

export async function logActivity(
  entityType: string,
  entityId: string,
  actorId: string | null,
  message: string
): Promise<ActivityEntry> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("activity_log")
    .insert({ entity_type: entityType, entity_id: entityId, actor_id: actorId, message })
    .select(ACTIVITY_COLUMNS)
    .single();
  if (error) throw error;
  return toActivityEntry(data);
}

export async function listActivity(
  entityType: string,
  entityId: string
): Promise<ActivityEntry[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("activity_log")
    .select(ACTIVITY_COLUMNS)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toActivityEntry);
}
