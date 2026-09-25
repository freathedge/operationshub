import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { getAsset } from "@/lib/domain/assets";
import { listActivity } from "@/lib/domain/activity";
import {
  canAssignAsset,
  canChangeAssetStatus,
  canLinkEntityToOperation,
} from "@/lib/domain/permissions";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AssetAssignControl } from "@/components/assets/asset-assign-control";
import { AssetStatusControl } from "@/components/assets/asset-status-control";
import { AssetReportIssueForm } from "@/components/assets/asset-report-issue-form";
import { AssetOperationControl } from "@/components/assets/asset-operation-control";
import { AssetRealtimeRefresh } from "@/components/assets/asset-realtime-refresh";

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
      <AssetRealtimeRefresh companyId={profile.companyId} />
      <BackLink href="/assets" />

      <PageHeader title={asset.name} subtitle={`${asset.assetCode} · ${asset.category}`} />

      {canAssignAsset(profile, asset) && <AssetAssignControl assetId={asset.id} />}
      {canChangeAssetStatus(profile, asset) && (
        <AssetStatusControl assetId={asset.id} currentStatus={asset.status} />
      )}
      <AssetReportIssueForm assetId={asset.id} />
      <AssetOperationControl
        assetId={asset.id}
        relatedOperationId={asset.relatedOperationId}
        canManage={canLinkEntityToOperation(profile)}
      />

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {activity.map((entry) => (
              <li key={entry.id}>{entry.message}</li>
            ))}
            {activity.length === 0 && <li>No activity yet.</li>}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
