import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { TaskForm } from "@/components/tasks/task-form";

export default function NewTaskPage() {
  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/tasks" />
      <PageHeader title="New task" />
      <Card>
        <CardContent>
          <TaskForm />
        </CardContent>
      </Card>
    </div>
  );
}
