import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { canCreateEmployee } from "@/lib/domain/permissions";
import { BackLink } from "@/components/back-link";
import { EmployeeListView } from "@/components/employees/employee-list-view";

export default async function EmployeesPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  return (
    <div>
      <BackLink href="/dashboard" />
      <h1 className="text-2xl font-semibold mb-4 mt-2">Employees</h1>
      <EmployeeListView companyId={profile.companyId} canCreate={canCreateEmployee(profile)} />
    </div>
  );
}
