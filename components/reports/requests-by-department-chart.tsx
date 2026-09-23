"use client";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { DepartmentRequestCount } from "@/lib/domain/reports";

const chartConfig = {
  count: { label: "Open Requests", color: "var(--primary)" },
} satisfies ChartConfig;

export function RequestsByDepartmentChart({ data }: { data: DepartmentRequestCount[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Requests by Department</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open requests.</p>
        ) : (
          <ChartContainer config={chartConfig}>
            <BarChart data={data}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="departmentName" tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={4} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
