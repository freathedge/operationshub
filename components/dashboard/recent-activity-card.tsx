import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActivityEntry } from "@/lib/domain/activity";

// activity_log's entity_type values in use today (see every logActivity(...) call site
// across lib/domain/*.ts) and the list-view route each one's detail page lives at.
const ENTITY_ROUTE: Record<string, string> = {
  task: "/tasks",
  request: "/requests",
  asset: "/assets",
  profile: "/employees",
  operation: "/operations",
};

function entityHref(entry: ActivityEntry): string | null {
  const base = ENTITY_ROUTE[entry.entityType];
  return base ? `${base}/${entry.entityId}` : null;
}

export function RecentActivityCard({ activity }: { activity: ActivityEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {activity.length === 0 && (
          <p className="text-sm text-muted-foreground">No recent activity.</p>
        )}
        <ul className="flex flex-col gap-2">
          {activity.map((entry) => {
            const href = entityHref(entry);
            return (
              <li key={entry.id} className="text-sm text-muted-foreground">
                {href ? (
                  <Link href={href} className="hover:underline">
                    {entry.message}
                  </Link>
                ) : (
                  entry.message
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
