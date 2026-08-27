import { TaskForm } from "@/components/tasks/task-form";

export default function NewTaskPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">New task</h1>
      <TaskForm />
    </div>
  );
}
