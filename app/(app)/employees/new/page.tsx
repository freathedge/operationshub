import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { canCreateEmployee } from "@/lib/domain/permissions";
import { listDepartments } from "@/lib/domain/departments";
import { listLocations } from "@/lib/domain/locations";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
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
    <div className="flex flex-col gap-6">
      <BackLink href="/employees" />
      <PageHeader title="New employee" />
      <Card>
        <CardContent>
          <EmployeeForm departments={departments} locations={locations} />
        </CardContent>
      </Card>
    </div>
  );
}
