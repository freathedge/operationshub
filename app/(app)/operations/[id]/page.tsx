import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { getOperation } from "@/lib/domain/operations";
import { listComments } from "@/lib/domain/comments";
import { listActivity } from "@/lib/domain/activity";
import { canManageOperation } from "@/lib/domain/permissions";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  OperationLinkPicker,
  OperationUnlinkButton,
} from "@/components/operations/operation-link-picker";
import { OperationEditControl } from "@/components/operations/operation-edit-control";
import { OperationComments } from "@/components/operations/operation-comments";
import { OperationRealtimeRefresh } from "@/components/operations/operation-realtime-refresh";

export default async function OperationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  const { id } = await params;

  let detail;
  try {
    detail = await getOperation(profile, id);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) {
      notFound();
    }
    throw error;
  }

  const { operation, progress, tasks, requests, assets, employees } = detail;
  const canManage = canManageOperation(profile, operation);

  const [comments, activity] = await Promise.all([
    listComments("operation", operation.id),
    listActivity("operation", operation.id),
  ]);

  const progressPercent =
    progress.totalTasks === 0
      ? 0
      : Math.round((progress.completedTasks / progress.totalTasks) * 100);

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <OperationRealtimeRefresh companyId={profile.companyId} />
      <BackLink href="/operations" />

      <PageHeader
        title={operation.title}
        subtitle={
          operation.description
            ? `${operation.status.replace("_", " ")} · ${operation.priority} — ${operation.description}`
            : `${operation.status.replace("_", " ")} · ${operation.priority}`
        }
      />

      {canManage && (
        <OperationEditControl
          operationId={operation.id}
          title={operation.title}
          status={operation.status}
          priority={operation.priority}
        />
      )}

      <Card>
        <CardContent>
          <p className="text-sm text-muted-foreground">Progress</p>
          <p className="text-2xl font-semibold">
            {progressPercent}% ({progress.completedTasks}/{progress.totalTasks} tasks)
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tasks ({tasks.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <ul className="flex flex-col gap-1 text-sm">
            {tasks.map((task) => (
              <li key={task.id} className="flex items-center justify-between">
                <Link href={`/tasks/${task.id}`} className="hover:underline">
                  {task.title}
                </Link>
                {canManage && (
                  <OperationUnlinkButton operationId={operation.id} entityType="task" entityId={task.id} />
                )}
              </li>
            ))}
            {tasks.length === 0 && <li className="text-muted-foreground">No tasks linked yet.</li>}
          </ul>
          {canManage && <OperationLinkPicker operationId={operation.id} entityType="task" />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Requests ({requests.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <ul className="flex flex-col gap-1 text-sm">
            {requests.map((request) => (
              <li key={request.id} className="flex items-center justify-between">
                <Link href={`/requests/${request.id}`} className="hover:underline">
                  {request.title}
                </Link>
                {canManage && (
                  <OperationUnlinkButton operationId={operation.id} entityType="request" entityId={request.id} />
                )}
              </li>
            ))}
            {requests.length === 0 && (
              <li className="text-muted-foreground">No requests linked yet.</li>
            )}
          </ul>
          {canManage && <OperationLinkPicker operationId={operation.id} entityType="request" />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assets ({assets.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <ul className="flex flex-col gap-1 text-sm">
            {assets.map((asset) => (
              <li key={asset.id} className="flex items-center justify-between">
                <Link href={`/assets/${asset.id}`} className="hover:underline">
                  {asset.name}
                </Link>
                {canManage && (
                  <OperationUnlinkButton operationId={operation.id} entityType="asset" entityId={asset.id} />
                )}
              </li>
            ))}
            {assets.length === 0 && <li className="text-muted-foreground">No assets linked yet.</li>}
          </ul>
          {canManage && <OperationLinkPicker operationId={operation.id} entityType="asset" />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Employees ({employees.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <ul className="flex flex-col gap-1 text-sm">
            {employees.map((employee) => (
              <li key={employee.id} className="flex items-center justify-between">
                <Link href={`/employees/${employee.id}`} className="hover:underline">
                  {employee.fullName}
                </Link>
                {canManage && (
                  <OperationUnlinkButton operationId={operation.id} entityType="employee" entityId={employee.id} />
                )}
              </li>
            ))}
            {employees.length === 0 && (
              <li className="text-muted-foreground">No employees linked yet.</li>
            )}
          </ul>
          {canManage && <OperationLinkPicker operationId={operation.id} entityType="employee" />}
        </CardContent>
      </Card>

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

      <OperationComments operationId={operation.id} initialComments={comments} />
    </div>
  );
}
