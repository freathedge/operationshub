import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/session";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { TaskListView } from "@/components/tasks/task-list-view";

export default async function TasksPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/dashboard" />
      <PageHeader
        title="Tasks"
        action={
          <Button render={<Link href="/tasks/new" />} nativeButton={false}>
            New task
          </Button>
        }
      />
      <TaskListView companyId={profile.companyId} />
    </div>
  );
}
