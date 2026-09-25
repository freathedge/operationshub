import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { canViewAllWorkflowInstances } from "@/lib/domain/permissions";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { WorkflowInstanceListView } from "@/components/workflows/workflow-instance-list-view";

export default async function WorkflowsPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/dashboard" />
      <PageHeader title="Workflows" />
      <WorkflowInstanceListView
        companyId={profile.companyId}
        canViewAll={canViewAllWorkflowInstances(profile)}
      />
    </div>
  );
}
