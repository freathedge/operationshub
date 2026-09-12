"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createEmployeeSchema, type CreateEmployeeInput } from "@/lib/validation/employees";
import type { Department } from "@/lib/domain/departments";
import type { Location } from "@/lib/domain/locations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ROLE_OPTIONS: { value: CreateEmployeeInput["role"]; label: string }[] = [
  { value: "employee", label: "Employee" },
  { value: "manager", label: "Manager" },
  { value: "operations_manager", label: "Operations Manager" },
  { value: "it", label: "IT" },
  { value: "hr", label: "HR" },
  { value: "admin", label: "Admin" },
];

interface ManagerOption {
  id: string;
  fullName: string;
}

export function EmployeeForm({
  departments,
  locations,
}: {
  departments: Department[];
  locations: Location[];
}) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateEmployeeInput>({
    resolver: zodResolver(createEmployeeSchema),
    defaultValues: { role: "employee", startOnboarding: true },
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profiles?role=manager").then(async (response) => {
      if (cancelled || !response.ok) return;
      const body = await response.json();
      setManagers(body.profiles);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(values: CreateEmployeeInput) {
    setSubmitError(null);
    const response = await fetch("/api/employees", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      const body = await response.json();
      setSubmitError(typeof body.error === "string" ? body.error : "Failed to create employee");
      return;
    }

    const { employee } = await response.json();
    router.push(`/employees/${employee.id}`);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 max-w-lg">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" {...register("fullName")} />
        {errors.fullName && <p className="text-sm text-red-600">{errors.fullName.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" {...register("email")} />
        {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="role">Role</Label>
        <select
          id="role"
          {...register("role")}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="positionTitle">Position</Label>
        <Input id="positionTitle" {...register("positionTitle", { setValueAs: (v) => v || undefined })} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="employeeNumber">Employee number</Label>
        <Input
          id="employeeNumber"
          {...register("employeeNumber", { setValueAs: (v) => v || undefined })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="departmentId">Department</Label>
        <select
          id="departmentId"
          {...register("departmentId", { setValueAs: (v) => v || undefined })}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">No department</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="locationId">Location</Label>
        <select
          id="locationId"
          {...register("locationId", { setValueAs: (v) => v || undefined })}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">No location</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="managerId">Manager</Label>
        <select
          id="managerId"
          {...register("managerId", { setValueAs: (v) => v || undefined })}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">No manager</option>
          {managers.map((manager) => (
            <option key={manager.id} value={manager.id}>
              {manager.fullName}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <input id="startOnboarding" type="checkbox" defaultChecked {...register("startOnboarding")} />
        <Label htmlFor="startOnboarding">Start onboarding workflow</Label>
      </div>

      {submitError && <p className="text-sm text-red-600">{submitError}</p>}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating..." : "Create employee"}
      </Button>
    </form>
  );
}
