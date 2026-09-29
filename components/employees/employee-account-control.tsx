"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@/lib/validation/auth";
import type { ProfileStatus } from "@/lib/domain/profile-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type EmployeeAccountInfo =
  | { linked: true; email: string }
  | { linked: false; invitedEmail?: string | null };

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "employee", label: "Employee" },
  { value: "manager", label: "Manager" },
  { value: "operations_manager", label: "Operations Manager" },
  { value: "it", label: "IT" },
  { value: "hr", label: "HR" },
  { value: "admin", label: "Admin" },
];

export function EmployeeAccountControl({
  employeeId,
  currentRole,
  currentStatus,
  account,
}: {
  employeeId: string;
  currentRole: Role;
  currentStatus: ProfileStatus;
  account: EmployeeAccountInfo;
}) {
  const router = useRouter();
  const [isSubmittingRole, setIsSubmittingRole] = useState(false);
  const [isSubmittingStatus, setIsSubmittingStatus] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changeRole(role: Role) {
    if (role === currentRole) return;
    setIsSubmittingRole(true);
    setError(null);
    try {
      const response = await fetch(`/api/employees/${employeeId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(typeof body.error === "string" ? body.error : "Failed to change role");
        return;
      }
      router.refresh();
    } catch {
      setError("Failed to change role");
    } finally {
      setIsSubmittingRole(false);
    }
  }

  async function toggleStatus() {
    const nextStatus: ProfileStatus = currentStatus === "active" ? "inactive" : "active";
    setIsSubmittingStatus(true);
    setError(null);
    try {
      const response = await fetch(`/api/employees/${employeeId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(typeof body.error === "string" ? body.error : "Failed to update status");
        return;
      }
      router.refresh();
    } catch {
      setError("Failed to update status");
    } finally {
      setIsSubmittingStatus(false);
    }
  }

  async function resendInvite() {
    setIsResending(true);
    setError(null);
    try {
      const response = await fetch(`/api/employees/${employeeId}/resend-invite`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(typeof body.error === "string" ? body.error : "Failed to resend invite");
        return;
      }
      setResendSent(true);
    } catch {
      setError("Failed to resend invite");
    } finally {
      setIsResending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Email</p>
          {account.linked ? (
            <p>{account.email}</p>
          ) : (
            <div className="flex items-center gap-2">
              <Badge variant="outline">Invitation pending</Badge>
              {account.invitedEmail && (
                <span className="text-sm text-muted-foreground">sent to {account.invitedEmail}</span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="employee-role">Role</Label>
          <Select
            value={currentRole}
            onValueChange={(value) => {
              if (value) changeRole(value as Role);
            }}
            disabled={isSubmittingRole}
          >
            <SelectTrigger id="employee-role" className="w-56">
              <SelectValue>
                {(value: Role | null) =>
                  value ? (ROLE_OPTIONS.find((option) => option.value === value)?.label ?? value) : ""
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Button variant="outline" disabled={isSubmittingStatus} onClick={toggleStatus}>
            {currentStatus === "active" ? "Deactivate" : "Reactivate"}
          </Button>
        </div>

        {!account.linked && (
          <div className="flex items-center gap-2">
            <Button variant="outline" disabled={isResending} onClick={resendInvite}>
              Resend invite
            </Button>
            {resendSent && <span className="text-sm text-muted-foreground">Invitation resent.</span>}
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}
