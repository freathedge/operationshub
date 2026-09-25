import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/session";
import { canCreateEmployee } from "@/lib/domain/permissions";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { EmployeeListView } from "@/components/employees/employee-list-view";

export default async function EmployeesPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  const canCreate = canCreateEmployee(profile);

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/dashboard" />
      <PageHeader
        title="Employees"
        action={
          canCreate ? (
            <Button render={<Link href="/employees/new" />} nativeButton={false}>
              New employee
            </Button>
          ) : undefined
        }
      />
      <EmployeeListView companyId={profile.companyId} />
    </div>
  );
}
