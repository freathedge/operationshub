import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { canViewCompanyOverview } from "@/lib/domain/permissions";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { ApprovalListView } from "@/components/approvals/approval-list-view";

export default async function ApprovalsPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/dashboard" />
      <PageHeader title="Approvals" />
      <ApprovalListView
        companyId={profile.companyId}
        canViewAll={canViewCompanyOverview(profile)}
      />
    </div>
  );
}
