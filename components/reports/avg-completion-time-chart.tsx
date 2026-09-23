"use client";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { CategoryCompletionTime } from "@/lib/domain/reports";

const chartConfig = {
  avgDays: { label: "Avg. Days to Complete", color: "var(--primary)" },
} satisfies ChartConfig;

export function AvgCompletionTimeChart({ data }: { data: CategoryCompletionTime[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Average Request Completion Time</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No completed requests yet.</p>
        ) : (
          <>
            <ChartContainer config={chartConfig}>
              <BarChart data={data}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="category" tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="avgDays" fill="var(--color-avgDays)" radius={4} />
              </BarChart>
            </ChartContainer>
            <ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
              {data.map((row) => (
                <li key={row.category}>
                  {row.category}: based on {row.sampleSize} request{row.sampleSize === 1 ? "" : "s"}
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
