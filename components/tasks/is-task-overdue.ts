export function isTaskOverdue(task: { dueDate: string | null; status: string }): boolean {
  if (!task.dueDate) return false;
  if (task.status === "completed" || task.status === "cancelled") return false;
  return new Date(task.dueDate).getTime() < Date.now();
}
