import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/domain/profiles";

const RESULT_LIMIT_PER_TYPE = 5;

// Mirrors the private COMPANY_WIDE_VIEW_ROLES set in lib/domain/permissions.ts (and the
// module-local copies in lib/domain/tasks.ts / lib/domain/requests.ts) as of this writing.
// Verified against the live source of all three files before writing this module.
const COMPANY_WIDE_VIEW_ROLES = new Set(["operations_manager", "it", "hr", "admin"]);

export type SearchResultType = "task" | "request" | "asset" | "employee" | "operation";

export interface SearchResult {
  type: SearchResultType;
  id: string;
  label: string;
  href: string;
}

export async function search(profile: Profile, query: string): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const supabase = createSupabaseAdminClient();

  // Scoping copied verbatim from lib/domain/tasks.ts's listTasks (non-COMPANY_WIDE_VIEW_ROLES
  // branch) — see that function for the source of truth.
  let tasksQuery = supabase
    .from("tasks")
    .select("id, title")
    .eq("company_id", profile.companyId)
    .textSearch("search_vector", trimmed, { type: "websearch", config: "english" })
    .limit(RESULT_LIMIT_PER_TYPE);
  if (!COMPANY_WIDE_VIEW_ROLES.has(profile.role)) {
    tasksQuery =
      profile.role === "manager" && profile.departmentId
        ? tasksQuery.or(
            `assignee_id.eq.${profile.id},creator_id.eq.${profile.id},department_id.eq.${profile.departmentId}`
          )
        : tasksQuery.or(`assignee_id.eq.${profile.id},creator_id.eq.${profile.id}`);
  }

  // Scoping copied verbatim from lib/domain/requests.ts's listRequests (non-COMPANY_WIDE_VIEW_ROLES
  // branch, ignoring the `scope: "mine"` filter branch, which doesn't apply here) — see that
  // function for the source of truth.
  let requestsQuery = supabase
    .from("requests")
    .select("id, title")
    .eq("company_id", profile.companyId)
    .textSearch("search_vector", trimmed, { type: "websearch", config: "english" })
    .limit(RESULT_LIMIT_PER_TYPE);
  if (!COMPANY_WIDE_VIEW_ROLES.has(profile.role)) {
    requestsQuery =
      profile.role === "manager" && profile.departmentId
        ? requestsQuery.or(`created_by.eq.${profile.id},department_id.eq.${profile.departmentId}`)
        : requestsQuery.eq("created_by", profile.id);
  }

  const assetsQuery = supabase
    .from("assets")
    .select("id, name")
    .eq("company_id", profile.companyId)
    .textSearch("search_vector", trimmed, { type: "websearch", config: "english" })
    .limit(RESULT_LIMIT_PER_TYPE);

  const employeesQuery = supabase
    .from("profiles")
    .select("id, full_name")
    .eq("company_id", profile.companyId)
    .textSearch("search_vector", trimmed, { type: "websearch", config: "english" })
    .limit(RESULT_LIMIT_PER_TYPE);

  const operationsQuery = supabase
    .from("operations")
    .select("id, title")
    .eq("company_id", profile.companyId)
    .textSearch("search_vector", trimmed, { type: "websearch", config: "english" })
    .limit(RESULT_LIMIT_PER_TYPE);

  const [tasksResult, requestsResult, assetsResult, employeesResult, operationsResult] =
    await Promise.all([tasksQuery, requestsQuery, assetsQuery, employeesQuery, operationsQuery]);

  if (tasksResult.error) throw tasksResult.error;
  if (requestsResult.error) throw requestsResult.error;
  if (assetsResult.error) throw assetsResult.error;
  if (employeesResult.error) throw employeesResult.error;
  if (operationsResult.error) throw operationsResult.error;

  const results: SearchResult[] = [
    ...(tasksResult.data ?? []).map((row) => ({
      type: "task" as const,
      id: row.id,
      label: row.title,
      href: `/tasks/${row.id}`,
    })),
    ...(requestsResult.data ?? []).map((row) => ({
      type: "request" as const,
      id: row.id,
      label: row.title,
      href: `/requests/${row.id}`,
    })),
    ...(assetsResult.data ?? []).map((row) => ({
      type: "asset" as const,
      id: row.id,
      label: row.name,
      href: `/assets/${row.id}`,
    })),
    ...(employeesResult.data ?? []).map((row) => ({
      type: "employee" as const,
      id: row.id,
      label: row.full_name,
      href: `/employees/${row.id}`,
    })),
    ...(operationsResult.data ?? []).map((row) => ({
      type: "operation" as const,
      id: row.id,
      label: row.title,
      href: `/operations/${row.id}`,
    })),
  ];

  return results;
}
