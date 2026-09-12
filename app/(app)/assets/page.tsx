import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { canCreateAsset } from "@/lib/domain/permissions";
import { BackLink } from "@/components/back-link";
import { AssetListView } from "@/components/assets/asset-list-view";

export default async function AssetsPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  return (
    <div>
      <BackLink href="/dashboard" />
      <h1 className="text-2xl font-semibold mb-4 mt-2">Assets</h1>
      <AssetListView companyId={profile.companyId} canCreate={canCreateAsset(profile)} />
    </div>
  );
}
