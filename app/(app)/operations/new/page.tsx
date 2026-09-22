import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { canCreateOperation } from "@/lib/domain/permissions";
import { listDepartments } from "@/lib/domain/departments";
import { BackLink } from "@/components/back-link";
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
    <div>
      <BackLink href="/operations" />
      <h1 className="text-2xl font-semibold mb-4 mt-2">New operation</h1>
      <OperationForm departments={departments} />
    </div>
  );
}
