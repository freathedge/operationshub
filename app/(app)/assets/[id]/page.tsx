import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { getAsset } from "@/lib/domain/assets";
import { listActivity } from "@/lib/domain/activity";
import { canAssignAsset, canChangeAssetStatus } from "@/lib/domain/permissions";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";
import { BackLink } from "@/components/back-link";
import { AssetAssignControl } from "@/components/assets/asset-assign-control";
import { AssetStatusControl } from "@/components/assets/asset-status-control";
import { AssetReportIssueForm } from "@/components/assets/asset-report-issue-form";

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  const { id } = await params;

  let asset;
  try {
    asset = await getAsset(profile, id);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) {
      notFound();
    }
    throw error;
  }

  const activity = await listActivity("asset", asset.id);

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <BackLink href="/assets" />

      <div>
        <h1 className="text-2xl font-semibold">{asset.name}</h1>
        <p className="text-muted-foreground">
          {asset.assetCode} · {asset.category}
        </p>
      </div>

      {canAssignAsset(profile) && <AssetAssignControl assetId={asset.id} />}
      {canChangeAssetStatus(profile) && (
        <AssetStatusControl assetId={asset.id} currentStatus={asset.status} />
      )}
      <AssetReportIssueForm assetId={asset.id} />

      <section>
        <h2 className="text-lg font-medium mb-2">Activity</h2>
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
          {activity.map((entry) => (
            <li key={entry.id}>{entry.message}</li>
          ))}
          {activity.length === 0 && <li>No activity yet.</li>}
        </ul>
      </section>
    </div>
  );
}
