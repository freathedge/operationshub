import type { Profile } from "@/lib/domain/profiles";

export interface TaskLike {
  companyId: string;
  creatorId: string | null;
  assigneeId: string | null;
  departmentId: string | null;
}

const COMPANY_WIDE_VIEW_ROLES = new Set(["operations_manager", "it", "hr", "admin"]);
const ELEVATED_ROLES = new Set(["operations_manager", "admin"]);

export function canViewTask(profile: Profile, task: TaskLike): boolean {
  if (profile.companyId !== task.companyId) return false;
  if (COMPANY_WIDE_VIEW_ROLES.has(profile.role)) return true;
  if (profile.id === task.assigneeId || profile.id === task.creatorId) return true;
  // Unassigned, department-scoped tasks (e.g. workflow-generated task steps) are
  // meant to be visible to anyone in that department, not just its manager. A task
  // already assigned to someone else is not opened up to the rest of the department.
  if (
    task.assigneeId === null &&
    profile.departmentId !== null &&
    profile.departmentId === task.departmentId
  ) {
    return true;
  }
  return false;
}

export function canCreateTask(_profile: Profile): boolean {
  return true;
}

export function canAssignTask(
  profile: Profile,
  task: TaskLike,
  currentAssignee: Profile | null,
  targetAssignee: Profile
): boolean {
  if (profile.companyId !== task.companyId) return false;
  if (ELEVATED_ROLES.has(profile.role)) return true;
  if (profile.id === task.creatorId) return true;
  if (profile.id === targetAssignee.id) return true;
  if (currentAssignee && profile.id === currentAssignee.managerId) return true;
  if (profile.id === targetAssignee.managerId) return true;
  return false;
}

export function canChangeTaskStatus(
  profile: Profile,
  task: TaskLike,
  assignee: Profile | null
): boolean {
  if (profile.companyId !== task.companyId) return false;
  if (ELEVATED_ROLES.has(profile.role)) return true;
  if (profile.id === task.assigneeId || profile.id === task.creatorId) return true;
  if (assignee && profile.id === assignee.managerId) return true;
  // Unassigned, department-scoped tasks (e.g. workflow-generated task steps) are
  // meant to be completable by anyone in that department. A task already assigned
  // to someone else is not opened up to the rest of the department.
  if (
    task.assigneeId === null &&
    profile.departmentId !== null &&
    profile.departmentId === task.departmentId
  ) {
    return true;
  }
  return false;
}

export function canDeleteTask(profile: Profile, task: TaskLike): boolean {
  if (profile.companyId !== task.companyId) return false;
  return profile.id === task.creatorId || ELEVATED_ROLES.has(profile.role);
}

export const canComment = canViewTask;
export const canUploadAttachment = canViewTask;

export interface RequestLike {
  companyId: string;
  createdBy: string | null;
  departmentId: string | null;
}

export function canCreateRequest(_profile: Profile): boolean {
  return true;
}

export function canViewRequest(
  profile: Profile,
  request: RequestLike,
  approverId: string | null
): boolean {
  if (profile.companyId !== request.companyId) return false;
  if (COMPANY_WIDE_VIEW_ROLES.has(profile.role)) return true;
  if (profile.id === request.createdBy || profile.id === approverId) return true;
  if (
    profile.role === "manager" &&
    profile.departmentId !== null &&
    profile.departmentId === request.departmentId
  ) {
    return true;
  }
  return false;
}

export function canDecideApproval(
  profile: Profile,
  approval: { approverId: string | null }
): boolean {
  return profile.id === approval.approverId || ELEVATED_ROLES.has(profile.role);
}

export function canTransitionRequestStatus(
  profile: Profile,
  request: RequestLike,
  approverId: string | null
): boolean {
  if (profile.companyId !== request.companyId) return false;
  if (ELEVATED_ROLES.has(profile.role)) return true;
  return profile.id === request.createdBy || profile.id === approverId;
}

export const canCommentOnRequest = canViewRequest;
export const canUploadRequestAttachment = canViewRequest;
export const canReassignApproval = canDecideApproval;

export function canViewWorkflowInstance(
  profile: Profile,
  instance: { companyId: string; relatedEmployeeId?: string | null },
  request: RequestLike | null,
  approverId: string | null
): boolean {
  if (profile.companyId !== instance.companyId) return false;
  if (profile.id === instance.relatedEmployeeId) return true;
  if (request) return canViewRequest(profile, request, approverId);
  return COMPANY_WIDE_VIEW_ROLES.has(profile.role);
}

// Same role set as canViewWorkflowInstance's no-linked-request fallback branch, named
// separately for the "list every workflow instance in the company" gate (scope=all on
// /workflows), which has no single instance to check per-row permissions against.
export function canViewAllWorkflowInstances(profile: Profile): boolean {
  return COMPANY_WIDE_VIEW_ROLES.has(profile.role);
}

const EMPLOYEE_MANAGER_ROLES = new Set(["hr", "admin"]);
const ASSET_MANAGER_ROLES = new Set(["it", "operations_manager", "admin"]);

export function canCreateEmployee(profile: Profile): boolean {
  return EMPLOYEE_MANAGER_ROLES.has(profile.role);
}

export function canUpdateEmployee(profile: Profile): boolean {
  return EMPLOYEE_MANAGER_ROLES.has(profile.role);
}

export interface EmployeeLike {
  companyId: string;
  id: string;
  managerId: string | null;
}

export function canViewEmployeeProfile(profile: Profile, target: EmployeeLike): boolean {
  if (profile.companyId !== target.companyId) return false;
  if (COMPANY_WIDE_VIEW_ROLES.has(profile.role)) return true;
  if (profile.id === target.id) return true;
  return profile.id === target.managerId;
}

export interface AssetLike {
  companyId: string;
  assignedTo: string | null;
  departmentId: string | null;
}

export function canCreateAsset(profile: Profile): boolean {
  return ASSET_MANAGER_ROLES.has(profile.role);
}

export function canAssignAsset(profile: Profile, asset: AssetLike): boolean {
  if (profile.companyId !== asset.companyId) return false;
  return ASSET_MANAGER_ROLES.has(profile.role);
}

export function canChangeAssetStatus(profile: Profile, asset: AssetLike): boolean {
  if (profile.companyId !== asset.companyId) return false;
  return ASSET_MANAGER_ROLES.has(profile.role);
}

export function canViewAsset(profile: Profile, asset: AssetLike): boolean {
  if (profile.companyId !== asset.companyId) return false;
  if (COMPANY_WIDE_VIEW_ROLES.has(profile.role)) return true;
  if (profile.id === asset.assignedTo) return true;
  return profile.departmentId !== null && profile.departmentId === asset.departmentId;
}

export interface OperationLike {
  companyId: string;
}

export function canCreateOperation(profile: Profile): boolean {
  return ELEVATED_ROLES.has(profile.role);
}

// Same ELEVATED_ROLES check as canCreateOperation, named separately for its use at each entity
// detail page's "attach/detach operation" gate rather than at operation creation — the linked
// operation itself is always visible to anyone who can view the entity (company-wide
// visibility, idea.md), only the attach/detach action is role-gated.
export function canLinkEntityToOperation(profile: Profile): boolean {
  return canCreateOperation(profile);
}

export function canManageOperation(profile: Profile, operation: OperationLike): boolean {
  if (profile.companyId !== operation.companyId) return false;
  return ELEVATED_ROLES.has(profile.role);
}

export function canViewOperation(profile: Profile, operation: OperationLike): boolean {
  return profile.companyId === operation.companyId;
}

export const canCommentOnOperation = canViewOperation;

export function canViewCompanyOverview(profile: Profile): boolean {
  return ELEVATED_ROLES.has(profile.role);
}
