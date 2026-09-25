import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/session";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { RequestListView } from "@/components/requests/request-list-view";

export default async function RequestsPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/dashboard" />
      <PageHeader
        title="Requests"
        action={
          <Button render={<Link href="/requests/new" />} nativeButton={false}>
            New request
          </Button>
        }
      />
      <RequestListView companyId={profile.companyId} />
    </div>
  );
}
