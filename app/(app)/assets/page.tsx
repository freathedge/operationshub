import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/session";
import { canCreateAsset } from "@/lib/domain/permissions";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { AssetListView } from "@/components/assets/asset-list-view";

export default async function AssetsPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  const canCreate = canCreateAsset(profile);

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/dashboard" />
      <PageHeader
        title="Assets"
        action={
          canCreate ? (
            <Button render={<Link href="/assets/new" />} nativeButton={false}>
              New asset
            </Button>
          ) : undefined
        }
      />
      <AssetListView companyId={profile.companyId} />
    </div>
  );
}
