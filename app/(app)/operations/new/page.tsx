import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { canCreateOperation } from "@/lib/domain/permissions";
import { listDepartments } from "@/lib/domain/departments";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { OperationForm } from "@/components/operations/operation-form";

export default async function NewOperationPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }
  if (!canCreateOperation(profile)) {
    notFound();
  }

  const departments = await listDepartments(profile.companyId);

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/operations" />
      <PageHeader title="New operation" />
      <Card>
        <CardContent>
          <OperationForm departments={departments} />
        </CardContent>
      </Card>
    </div>
  );
}
