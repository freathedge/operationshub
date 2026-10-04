"use client";

import { CartesianGrid, Line, LineChart, XAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { WeeklyTrend } from "@/lib/domain/reports";

const chartConfig = {
  completedTasks: { label: "Completed Tasks", color: "var(--chart-1)" },
  newRequests: { label: "New Requests", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function TaskRequestTrendChart({ data }: { data: WeeklyTrend[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tasks Completed &amp; Requests Received, by Week</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <LineChart data={data}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="weekStart" tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Line
              type="monotone"
              dataKey="completedTasks"
              stroke="var(--color-completedTasks)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="newRequests"
              stroke="var(--color-newRequests)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
