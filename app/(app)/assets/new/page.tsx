import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { canCreateAsset } from "@/lib/domain/permissions";
import { listDepartments } from "@/lib/domain/departments";
import { listLocations } from "@/lib/domain/locations";
import { BackLink } from "@/components/back-link";
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
    <div>
      <BackLink href="/assets" />
      <h1 className="text-2xl font-semibold mb-4 mt-2">New asset</h1>
      <AssetForm departments={departments} locations={locations} />
    </div>
  );
}
