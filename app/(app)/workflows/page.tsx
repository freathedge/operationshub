import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { BackLink } from "@/components/back-link";
import { WorkflowInstanceListView } from "@/components/workflows/workflow-instance-list-view";

export default async function WorkflowsPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  return (
    <div>
      <BackLink href="/dashboard" />
      <h1 className="text-2xl font-semibold mb-4 mt-2">Workflows</h1>
      <WorkflowInstanceListView companyId={profile.companyId} />
    </div>
  );
}
