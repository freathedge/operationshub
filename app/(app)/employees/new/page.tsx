import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { canCreateEmployee } from "@/lib/domain/permissions";
import { listDepartments } from "@/lib/domain/departments";
import { listLocations } from "@/lib/domain/locations";
import { BackLink } from "@/components/back-link";
import { EmployeeForm } from "@/components/employees/employee-form";

export default async function NewEmployeePage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }
  if (!canCreateEmployee(profile)) {
    notFound();
  }

  const [departments, locations] = await Promise.all([
    listDepartments(profile.companyId),
    listLocations(profile.companyId),
  ]);

  return (
    <div>
      <BackLink href="/employees" />
      <h1 className="text-2xl font-semibold mb-4 mt-2">New employee</h1>
      <EmployeeForm departments={departments} locations={locations} />
    </div>
  );
}
