import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { canViewCompanyOverview } from "@/lib/domain/permissions";
import {
  avgRequestCompletionTime,
  requestsByDepartment,
  taskStatistics,
  workflowCompletionRate,
} from "@/lib/domain/reports";
import { BackLink } from "@/components/back-link";
import { RequestsByDepartmentChart } from "@/components/reports/requests-by-department-chart";
import { AvgCompletionTimeChart } from "@/components/reports/avg-completion-time-chart";
import { TaskStatisticsCard } from "@/components/reports/task-statistics-card";
import { WorkflowCompletionCard } from "@/components/reports/workflow-completion-card";

export default async function ReportsPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }
  if (!canViewCompanyOverview(profile)) {
    redirect("/dashboard");
  }

  const [
    requestsByDepartmentData,
    avgRequestCompletionTimeData,
    taskStatisticsData,
    workflowCompletionRateData,
  ] = await Promise.all([
    requestsByDepartment(profile),
    avgRequestCompletionTime(profile),
    taskStatistics(profile),
    workflowCompletionRate(profile),
  ]);

  return (
    <div>
      <BackLink href="/dashboard" />
      <h1 className="text-2xl font-semibold mb-4 mt-2">Reports</h1>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 @2xl/main:grid-cols-2">
          <RequestsByDepartmentChart data={requestsByDepartmentData} />
          <AvgCompletionTimeChart data={avgRequestCompletionTimeData} />
        </div>
        <div className="grid grid-cols-1 gap-4 @2xl/main:grid-cols-2">
          <TaskStatisticsCard data={taskStatisticsData} />
          <WorkflowCompletionCard data={workflowCompletionRateData} />
        </div>
      </div>
    </div>
  );
}
