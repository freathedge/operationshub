import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { getEmployeeProfile } from "@/lib/domain/employees";
import { canLinkEntityToOperation } from "@/lib/domain/permissions";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmployeeOperationControl } from "@/components/employees/employee-operation-control";
import { EmployeeRealtimeRefresh } from "@/components/employees/employee-realtime-refresh";

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  const { id } = await params;

  let result;
  try {
    result = await getEmployeeProfile(profile, id);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) {
      notFound();
    }
    throw error;
  }

  const { profile: employee, counts, activity } = result;

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <EmployeeRealtimeRefresh companyId={profile.companyId} />
      <BackLink href="/employees" />

      <PageHeader
        title={employee.fullName}
        subtitle={`${employee.positionTitle ?? "No position set"} · ${employee.status}`}
      />

      <Card>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-md border p-4">
              <p className="text-sm text-muted-foreground">Open tasks</p>
              <p className="text-2xl font-semibold">{counts.openTasks}</p>
            </div>
            <div className="rounded-md border p-4">
              <p className="text-sm text-muted-foreground">Requests</p>
              <p className="text-2xl font-semibold">{counts.requests}</p>
            </div>
            <div className="rounded-md border p-4">
              <p className="text-sm text-muted-foreground">Active workflows</p>
              <p className="text-2xl font-semibold">{counts.activeWorkflows}</p>
            </div>
            <div className="rounded-md border p-4">
              <p className="text-sm text-muted-foreground">Assets</p>
              <p className="text-2xl font-semibold">{counts.assets}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <EmployeeOperationControl
        employeeId={employee.id}
        relatedOperationId={employee.relatedOperationId}
        canManage={canLinkEntityToOperation(profile)}
      />

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {activity.map((entry) => (
              <li key={entry.id}>{entry.message}</li>
            ))}
            {activity.length === 0 && <li>No activity yet.</li>}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
