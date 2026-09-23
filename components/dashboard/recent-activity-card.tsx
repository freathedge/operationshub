import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActivityEntry } from "@/lib/domain/activity";

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
          {activity.map((entry) => (
            <li key={entry.id} className="text-sm text-muted-foreground">
              {entry.message}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
