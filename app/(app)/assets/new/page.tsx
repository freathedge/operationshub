import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { canCreateAsset } from "@/lib/domain/permissions";
import { listDepartments } from "@/lib/domain/departments";
import { listLocations } from "@/lib/domain/locations";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { AssetForm } from "@/components/assets/asset-form";

export default async function NewAssetPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }
  if (!canCreateAsset(profile)) {
    notFound();
  }

  const [departments, locations] = await Promise.all([
    listDepartments(profile.companyId),
    listLocations(profile.companyId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/assets" />
      <PageHeader title="New asset" />
      <Card>
        <CardContent>
          <AssetForm departments={departments} locations={locations} />
        </CardContent>
      </Card>
    </div>
  );
}
