export type RequestStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "in_progress"
  | "completed";

export type RequestCategory =
  | "equipment"
  | "software"
  | "access"
  | "maintenance"
  | "purchase"
  | "hr"
  | "general"
  | "other";

export const REQUEST_STATUSES: RequestStatus[] = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "in_progress",
  "completed",
];

export const REQUEST_CATEGORIES: RequestCategory[] = [
  "equipment",
  "software",
  "access",
  "maintenance",
  "purchase",
  "hr",
  "general",
  "other",
];

export const REQUEST_STATUS_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  draft: [],
  submitted: [],
  under_review: [],
  approved: ["in_progress"],
  rejected: [],
  in_progress: ["completed"],
  completed: [],
};

export function getValidNextStatuses(current: RequestStatus): RequestStatus[] {
  return REQUEST_STATUS_TRANSITIONS[current];
}
