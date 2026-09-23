import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActiveOperationsCard } from "@/components/dashboard/active-operations-card";
import type { CompanyOverview } from "@/lib/domain/dashboard";

export function CompanySection({ overview }: { overview: CompanyOverview }) {
  const totalCards = [
    { label: "Employees", value: overview.totals.employees },
    { label: "Assets", value: overview.totals.assets },
    { label: "Open Requests", value: overview.totals.openRequests },
    { label: "Active Tasks", value: overview.totals.activeTasks },
  ];

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Company Overview</h2>
      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        {totalCards.map((card) => (
          <Card key={card.label} className="@container/card">
            <CardHeader>
              <CardDescription>{card.label}</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                {card.value}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Attention Required</CardTitle>
        </CardHeader>
        <div className="px-6 pb-6 text-sm">
          <ul className="flex flex-col gap-1">
            <li>{overview.attention.criticalTasks} critical tasks</li>
            <li>{overview.attention.pendingApprovals} pending approvals</li>
            <li>{overview.attention.overdueRequests} overdue requests</li>
          </ul>
        </div>
      </Card>

      <ActiveOperationsCard operations={overview.activeOperations} />

      <Card>
        <CardHeader>
          <CardTitle>Department Activity</CardTitle>
        </CardHeader>
        <div className="px-6 pb-6">
          {overview.departmentActivity.length === 0 && (
            <p className="text-sm text-muted-foreground">No department data.</p>
          )}
          <ul className="flex flex-col gap-2 text-sm">
            {overview.departmentActivity.map((department) => (
              <li key={department.departmentId} className="flex items-center justify-between">
                <span>{department.name}</span>
                <span className="text-muted-foreground">
                  {department.openTasks} open tasks · {department.openRequests} open requests
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </div>
  );
}
