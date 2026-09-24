import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { BackLink } from "@/components/back-link";
import { ApprovalListView } from "@/components/approvals/approval-list-view";

export default async function ApprovalsPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  return (
    <div>
      <BackLink href="/dashboard" />
      <h1 className="text-2xl font-semibold mb-4 mt-2">Approvals</h1>
      <ApprovalListView companyId={profile.companyId} />
    </div>
  );
}
