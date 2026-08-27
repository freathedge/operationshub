import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { TaskListView } from "@/components/tasks/task-list-view";

export default async function TasksPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Tasks</h1>
      <TaskListView companyId={profile.companyId} />
    </div>
  );
}
