import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PersonalOverview } from "@/lib/domain/dashboard";

export function SummaryCards({ counts }: { counts: PersonalOverview["counts"] }) {
  const cards = [
    { label: "My Tasks", value: counts.myOpenTasks },
    { label: "Pending Approvals", value: counts.pendingApprovals },
    { label: "Open Requests", value: counts.myOpenRequests },
    { label: "Active Workflows", value: counts.activeWorkflows },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} className="@container/card">
          <CardHeader>
            <CardDescription>{card.label}</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {card.value}
            </CardTitle>
            <CardAction />
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
