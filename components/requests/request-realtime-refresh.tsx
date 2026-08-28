"use client";

import { useRouter } from "next/navigation";
import { useBroadcastListener } from "@/lib/realtime/use-broadcast-listener";

export function RequestRealtimeRefresh({ companyId }: { companyId: string }) {
  const router = useRouter();
  useBroadcastListener(`company:${companyId}:requests`, () => {
    router.refresh();
  });
  return null;
}
