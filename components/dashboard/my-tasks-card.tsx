import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardTask } from "@/lib/domain/dashboard";

const PRIORITY_VARIANT: Record<DashboardTask["priority"], "default" | "outline" | "destructive"> = {
  low: "outline",
  medium: "outline",
  high: "default",
  critical: "destructive",
};

export function MyTasksCard({ tasks }: { tasks: DashboardTask[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>My Tasks</CardTitle>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 && (
          <p className="text-sm text-muted-foreground">No open tasks assigned to you.</p>
        )}
        <ul className="flex flex-col gap-2">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center justify-between gap-2 text-sm">
              <Link href={`/tasks/${task.id}`} className="hover:underline">
                {task.title}
              </Link>
              <div className="flex items-center gap-2">
                <Badge variant={PRIORITY_VARIANT[task.priority]}>{task.priority}</Badge>
                {task.dueDate && (
                  <span className="text-muted-foreground">
                    {new Date(task.dueDate).toLocaleDateString()}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
