import { createSupabaseAdminClient } from "@/lib/supabase/admin";

async function sendBroadcast(channelName: string, event: { type: string }): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const realtimeChannel = supabase.channel(channelName);

  await new Promise<void>((resolve, reject) => {
    realtimeChannel.subscribe((status: string) => {
      if (status === "SUBSCRIBED") {
        realtimeChannel
          .send({ type: "broadcast", event: event.type, payload: {} })
          .then(() => resolve())
          .catch(reject);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        reject(new Error(`Failed to subscribe to realtime channel: ${status}`));
      }
    });
  });

  await supabase.removeChannel(realtimeChannel);
}

export async function broadcastChange(
  companyId: string,
  channel: string,
  event: { type: string }
): Promise<void> {
  await sendBroadcast(`company:${companyId}:${channel}`, event);
}

export async function broadcastToProfile(
  profileId: string,
  channel: string,
  event: { type: string }
): Promise<void> {
  await sendBroadcast(`profile:${profileId}:${channel}`, event);
}
