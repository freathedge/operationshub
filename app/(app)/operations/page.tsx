import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { canCreateOperation } from "@/lib/domain/permissions";
import { listDepartments } from "@/lib/domain/departments";
import { BackLink } from "@/components/back-link";
import { OperationListView } from "@/components/operations/operation-list-view";

export default async function OperationsPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  const departments = await listDepartments(profile.companyId);

  return (
    <div>
      <BackLink href="/dashboard" />
      <h1 className="text-2xl font-semibold mb-4 mt-2">Operations</h1>
      <OperationListView
        companyId={profile.companyId}
        canCreate={canCreateOperation(profile)}
        departments={departments}
      />
    </div>
  );
}
