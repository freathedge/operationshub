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
