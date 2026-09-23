"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBroadcastListener } from "@/lib/realtime/use-broadcast-listener";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { MyTasksCard } from "@/components/dashboard/my-tasks-card";
import { RecentActivityCard } from "@/components/dashboard/recent-activity-card";
import { UpcomingCard } from "@/components/dashboard/upcoming-card";
import { CompanySection } from "@/components/dashboard/company-section";
import type { CompanyOverview, PersonalOverview } from "@/lib/domain/dashboard";

async function fetchOverview<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}`);
  const body = await response.json();
  return body.overview as T;
}

export function DashboardView({
  companyId,
  profileFullName,
  canViewCompany,
}: {
  companyId: string;
  profileFullName: string;
  canViewCompany: boolean;
}) {
  const queryClient = useQueryClient();

  const personalQuery = useQuery({
    queryKey: ["dashboard", "personal"],
    queryFn: () => fetchOverview<PersonalOverview>("/api/dashboard/personal"),
  });

  const companyQuery = useQuery({
    queryKey: ["dashboard", "company"],
    queryFn: () => fetchOverview<CompanyOverview>("/api/dashboard/company"),
    enabled: canViewCompany,
  });

  function invalidateDashboard() {
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  useBroadcastListener(`company:${companyId}:tasks`, invalidateDashboard);
  useBroadcastListener(`company:${companyId}:requests`, invalidateDashboard);
  useBroadcastListener(`company:${companyId}:operations`, invalidateDashboard);
  useBroadcastListener(`company:${companyId}:workflows`, invalidateDashboard);

  return (
    <div className="@container/main flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Good morning, {profileFullName}.</h1>
        <p className="text-muted-foreground">Here&apos;s what needs your attention.</p>
      </div>

      {personalQuery.isLoading && <p className="text-muted-foreground">Loading dashboard...</p>}
      {personalQuery.error && <p className="text-red-600">Failed to load your dashboard.</p>}

      {personalQuery.data && (
        <>
          <SummaryCards counts={personalQuery.data.counts} />
          <div className="grid grid-cols-1 gap-4 @2xl/main:grid-cols-2">
            <MyTasksCard tasks={personalQuery.data.myTasks} />
            <RecentActivityCard activity={personalQuery.data.recentActivity} />
          </div>
          <UpcomingCard upcoming={personalQuery.data.upcoming} />
        </>
      )}

      {canViewCompany && companyQuery.isLoading && (
        <p className="text-muted-foreground">Loading company overview...</p>
      )}
      {canViewCompany && companyQuery.error && (
        <p className="text-red-600">Failed to load the company overview.</p>
      )}
      {canViewCompany && companyQuery.data && <CompanySection overview={companyQuery.data} />}
    </div>
  );
}
