import { BackLink } from "@/components/back-link";
import { TaskForm } from "@/components/tasks/task-form";

export default function NewTaskPage() {
  return (
    <div>
      <BackLink href="/tasks" />
      <h1 className="text-2xl font-semibold mb-4 mt-2">New task</h1>
      <TaskForm />
    </div>
  );
}
