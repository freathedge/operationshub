import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TemplateCompletionRate } from "@/lib/domain/reports";

export function WorkflowCompletionCard({ data }: { data: TemplateCompletionRate[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Workflow Completion Rate</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No workflow activity yet.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {data.map((row) => (
              <li key={row.templateId} className="flex items-center justify-between">
                <span>{row.templateName}</span>
                <span className="text-muted-foreground">
                  {Math.round(row.completionRate * 100)}% ({row.totalInstances} instances)
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
