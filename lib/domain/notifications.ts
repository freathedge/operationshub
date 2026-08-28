import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { broadcastToProfile } from "@/lib/realtime/broadcast";

export interface Notification {
  id: string;
  profileId: string;
  entityType: string;
  entityId: string;
  type: string;
  message: string;
  readAt: string | null;
  createdAt: string;
}

interface NotificationRow {
  id: string;
  profile_id: string;
  entity_type: string;
  entity_id: string;
  type: string;
  message: string;
  read_at: string | null;
  created_at: string;
}

function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    profileId: row.profile_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    type: row.type,
    message: row.message,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

const NOTIFICATION_COLUMNS =
  "id, profile_id, entity_type, entity_id, type, message, read_at, created_at";

export async function createNotification(
  profileId: string,
  entityType: string,
  entityId: string,
  type: string,
  message: string
): Promise<Notification> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("notifications")
    .insert({
      profile_id: profileId,
      entity_type: entityType,
      entity_id: entityId,
      type,
      message,
    })
    .select(NOTIFICATION_COLUMNS)
    .single();
  if (error) throw error;

  const notification = toNotification(data);
  try {
    await broadcastToProfile(profileId, "notifications", { type });
  } catch (broadcastError) {
    console.error("broadcastToProfile failed:", broadcastError);
  }
  return notification;
}

export async function listNotifications(profileId: string): Promise<Notification[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("notifications")
    .select(NOTIFICATION_COLUMNS)
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toNotification);
}
