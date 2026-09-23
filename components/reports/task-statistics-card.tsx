import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TaskStatistics } from "@/lib/domain/reports";

export function TaskStatisticsCard({ data }: { data: TaskStatistics }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Task Statistics</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1 text-sm">
          <li>{data.open} open tasks</li>
          <li>{data.completed} completed tasks</li>
          <li>{data.overdue} overdue tasks</li>
        </ul>
      </CardContent>
    </Card>
  );
}
