import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/domain/profiles";
import { logActivity } from "@/lib/domain/activity";
import { canCreateRequest, canViewRequest } from "@/lib/domain/permissions";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";
import type { CreateRequestInput, RequestFilters } from "@/lib/validation/requests";
import type { RequestCategory, RequestStatus } from "@/lib/domain/request-status";

export interface Request {
  id: string;
  companyId: string;
  title: string;
  description: string | null;
  category: RequestCategory;
  status: RequestStatus;
  createdBy: string | null;
  departmentId: string | null;
  createdAt: string;
}

interface RequestRow {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  category: RequestCategory;
  status: RequestStatus;
  created_by: string | null;
  department_id: string | null;
  created_at: string;
}

function toRequest(row: RequestRow): Request {
  return {
    id: row.id,
    companyId: row.company_id,
    title: row.title,
    description: row.description,
    category: row.category,
    status: row.status,
    createdBy: row.created_by,
    departmentId: row.department_id,
    createdAt: row.created_at,
  };
}

const REQUEST_COLUMNS =
  "id, company_id, title, description, category, status, created_by, department_id, created_at";

const COMPANY_WIDE_VIEW_ROLES = new Set(["operations_manager", "it", "hr", "admin"]);

export async function createRequest(profile: Profile, input: CreateRequestInput): Promise<Request> {
  if (!canCreateRequest(profile)) {
    throw new ForbiddenError("You cannot create requests");
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("requests")
    .insert({
      company_id: profile.companyId,
      title: input.title,
      description: input.description ?? null,
      category: input.category,
      created_by: profile.id,
      department_id: input.departmentId ?? null,
    })
    .select(REQUEST_COLUMNS)
    .single();
  if (error) throw error;

  const request = toRequest(data);
  await logActivity(
    "request",
    request.id,
    profile.id,
    `${profile.fullName} created this request`
  );
  return request;
}

export async function loadRequestOrThrow(requestId: string): Promise<Request> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("requests")
    .select(REQUEST_COLUMNS)
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFoundError("Request not found");
  return toRequest(data);
}

async function loadApproverIdForRequest(requestId: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("approvals")
    .select("approver_id")
    .eq("request_id", requestId)
    .maybeSingle();
  if (error) throw error;
  return data?.approver_id ?? null;
}

export async function getRequest(profile: Profile, requestId: string): Promise<Request> {
  const request = await loadRequestOrThrow(requestId);
  const approverId = await loadApproverIdForRequest(requestId);
  if (!canViewRequest(profile, request, approverId)) {
    throw new ForbiddenError("You cannot view this request");
  }
  return request;
}

export async function listRequests(profile: Profile, filters: RequestFilters): Promise<Request[]> {
  const supabase = createSupabaseAdminClient();
  let query = supabase.from("requests").select(REQUEST_COLUMNS).eq("company_id", profile.companyId);

  if (filters.scope === "mine") {
    query = query.eq("created_by", profile.id);
  } else if (!COMPANY_WIDE_VIEW_ROLES.has(profile.role)) {
    if (profile.role === "manager" && profile.departmentId) {
      query = query.or(`created_by.eq.${profile.id},department_id.eq.${profile.departmentId}`);
    } else {
      query = query.eq("created_by", profile.id);
    }
  }

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.departmentId) query = query.eq("department_id", filters.departmentId);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toRequest);
}
