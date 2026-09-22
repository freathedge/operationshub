import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PersonalOverview } from "@/lib/domain/dashboard";

export function UpcomingCard({ upcoming }: { upcoming: PersonalOverview["upcoming"] }) {
  return (
    <Card>
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
  );
}
