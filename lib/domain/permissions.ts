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
  if (
    profile.role === "manager" &&
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
  instance: { companyId: string },
  request: RequestLike | null,
  approverId: string | null
): boolean {
  if (profile.companyId !== instance.companyId) return false;
  if (request) return canViewRequest(profile, request, approverId);
  return COMPANY_WIDE_VIEW_ROLES.has(profile.role);
}
