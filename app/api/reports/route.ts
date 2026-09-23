import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import {
  avgRequestCompletionTime,
  requestsByDepartment,
  taskStatistics,
  workflowCompletionRate,
} from "@/lib/domain/reports";
import { toErrorResponse } from "@/lib/api/error-response";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const [
      requestsByDepartmentResult,
      avgRequestCompletionTimeResult,
      taskStatisticsResult,
      workflowCompletionRateResult,
    ] = await Promise.all([
      requestsByDepartment(profile),
      avgRequestCompletionTime(profile),
      taskStatistics(profile),
      workflowCompletionRate(profile),
    ]);

    return NextResponse.json({
      requestsByDepartment: requestsByDepartmentResult,
      avgRequestCompletionTime: avgRequestCompletionTimeResult,
      taskStatistics: taskStatisticsResult,
      workflowCompletionRate: workflowCompletionRateResult,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
