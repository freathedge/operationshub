import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OperationProgress } from "@/lib/domain/dashboard";

export function ActiveOperationsCard({ operations }: { operations: OperationProgress[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Active Operations</CardTitle>
      </CardHeader>
      <CardContent>
        {operations.length === 0 && (
          <p className="text-sm text-muted-foreground">No active operations.</p>
        )}
        <ul className="flex flex-col gap-3">
          {operations.map((operation) => {
            const percent =
              operation.totalTasks === 0
                ? 0
                : Math.round((operation.completedTasks / operation.totalTasks) * 100);
            return (
              <li key={operation.id} className="flex flex-col gap-1 text-sm">
                <div className="flex items-center justify-between">
                  <Link href={`/operations/${operation.id}`} className="hover:underline">
                    {operation.title}
                  </Link>
                  <span className="text-muted-foreground">{percent}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
