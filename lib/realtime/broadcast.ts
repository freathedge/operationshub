import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function broadcastChange(
  companyId: string,
  channel: string,
  event: { type: string }
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const realtimeChannel = supabase.channel(`company:${companyId}:${channel}`);

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
