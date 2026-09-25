import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/session";
import { canCreateOperation } from "@/lib/domain/permissions";
import { listDepartments } from "@/lib/domain/departments";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { OperationListView } from "@/components/operations/operation-list-view";

export default async function OperationsPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  const departments = await listDepartments(profile.companyId);
  const canCreate = canCreateOperation(profile);

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/dashboard" />
      <PageHeader
        title="Operations"
        action={
          canCreate ? (
            <Button render={<Link href="/operations/new" />} nativeButton={false}>
              New operation
            </Button>
          ) : undefined
        }
      />
      <OperationListView companyId={profile.companyId} departments={departments} />
    </div>
  );
}
