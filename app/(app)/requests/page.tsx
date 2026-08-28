import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { BackLink } from "@/components/back-link";
import { RequestListView } from "@/components/requests/request-list-view";

export default async function RequestsPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  return (
    <div>
      <BackLink href="/dashboard" />
      <h1 className="text-2xl font-semibold mb-4 mt-2">Requests</h1>
      <RequestListView companyId={profile.companyId} />
    </div>
  );
}
