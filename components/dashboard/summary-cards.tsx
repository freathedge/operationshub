import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PersonalOverview } from "@/lib/domain/dashboard";

export function SummaryCards({
  counts,
  profileId,
}: {
  counts: PersonalOverview["counts"];
  profileId: string;
}) {
  const cards = [
    {
      label: "My Tasks",
      value: counts.myOpenTasks,
      href: `/tasks?assigneeId=${encodeURIComponent(profileId)}`,
    },
    { label: "Pending Approvals", value: counts.pendingApprovals, href: "/approvals" },
    { label: "Open Requests", value: counts.myOpenRequests, href: "/requests" },
    { label: "Active Workflows", value: counts.activeWorkflows, href: "/workflows" },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {cards.map((card) => {
        const content = (
          <Card
            className={
              card.href
                ? "@container/card transition-shadow hover:shadow-md"
                : "@container/card"
            }
          >
            <CardHeader>
              <CardDescription>{card.label}</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                {card.value}
              </CardTitle>
            </CardHeader>
          </Card>
        );
        return card.href ? (
          <Link key={card.label} href={card.href}>
            {content}
          </Link>
        ) : (
          <div key={card.label}>{content}</div>
        );
      })}
    </div>
  );
}
