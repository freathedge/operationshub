import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PersonalOverview } from "@/lib/domain/dashboard";

export function UpcomingCard({
  upcoming,
  profileId,
}: {
  upcoming: PersonalOverview["upcoming"];
  profileId: string;
}) {
  return (
    <Link href={`/tasks?assigneeId=${encodeURIComponent(profileId)}`}>
      <Card className="transition-shadow hover:shadow-md">
        <CardHeader>
          <CardTitle>Upcoming</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-1 text-sm">
            <li>{upcoming.overdue} tasks overdue</li>
            <li>{upcoming.dueToday} tasks due today</li>
            <li>{upcoming.dueThisWeek} tasks due this week</li>
          </ul>
        </CardContent>
      </Card>
    </Link>
  );
}
