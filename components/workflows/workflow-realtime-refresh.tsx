"use client";

import { useRouter } from "next/navigation";
import { useBroadcastListener } from "@/lib/realtime/use-broadcast-listener";

export function WorkflowRealtimeRefresh({ companyId }: { companyId: string }) {
  const router = useRouter();
  useBroadcastListener(`company:${companyId}:workflows`, () => {
    router.refresh();
  });
  return null;
}
