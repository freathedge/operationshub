import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { RequestListView } from "@/components/requests/request-list-view";

export default async function RequestsPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Requests</h1>
      <RequestListView companyId={profile.companyId} />
    </div>
  );
}
