import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { canViewCompanyOverview } from "@/lib/domain/permissions";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  return (
    <DashboardView
      companyId={profile.companyId}
      profileId={profile.id}
      profileFullName={profile.fullName}
      canViewCompany={canViewCompanyOverview(profile)}
    />
  );
}
