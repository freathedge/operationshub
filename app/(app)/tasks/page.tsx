import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { BackLink } from "@/components/back-link";
import { TaskListView } from "@/components/tasks/task-list-view";

export default async function TasksPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  return (
    <div>
      <BackLink href="/dashboard" />
      <h1 className="text-2xl font-semibold mb-4 mt-2">Tasks</h1>
      <TaskListView companyId={profile.companyId} />
    </div>
  );
}
