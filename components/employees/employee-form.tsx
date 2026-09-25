"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createEmployeeSchema, type CreateEmployeeInput } from "@/lib/validation/employees";
import type { Department } from "@/lib/domain/departments";
import type { Location } from "@/lib/domain/locations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

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
    control,
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
        <Controller
          name="role"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="role" className="w-full">
                <SelectValue>{(value: string) => ROLE_OPTIONS.find((o) => o.value === value)?.label ?? value}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
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
        <Controller
          name="departmentId"
          control={control}
          render={({ field }) => (
            <Select
              value={field.value ?? "none"}
              onValueChange={(value) => field.onChange(value === "none" || value === null ? undefined : value)}
            >
              <SelectTrigger id="departmentId" className="w-full">
                <SelectValue>
                  {(value: string) => (value === "none" ? "No department" : (departments.find((x) => x.id === value)?.name ?? value))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No department</SelectItem>
                {departments.map((department) => (
                  <SelectItem key={department.id} value={department.id}>
                    {department.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="locationId">Location</Label>
        <Controller
          name="locationId"
          control={control}
          render={({ field }) => (
            <Select
              value={field.value ?? "none"}
              onValueChange={(value) => field.onChange(value === "none" || value === null ? undefined : value)}
            >
              <SelectTrigger id="locationId" className="w-full">
                <SelectValue>
                  {(value: string) => (value === "none" ? "No location" : (locations.find((x) => x.id === value)?.name ?? value))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No location</SelectItem>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="managerId">Manager</Label>
        <Controller
          name="managerId"
          control={control}
          render={({ field }) => (
            <Select
              value={field.value ?? "none"}
              onValueChange={(value) => field.onChange(value === "none" || value === null ? undefined : value)}
            >
              <SelectTrigger id="managerId" className="w-full">
                <SelectValue>
                  {(value: string) => (value === "none" ? "No manager" : (managers.find((x) => x.id === value)?.fullName ?? value))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No manager</SelectItem>
                {managers.map((manager) => (
                  <SelectItem key={manager.id} value={manager.id}>
                    {manager.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="flex items-center gap-2">
        <Controller
          name="startOnboarding"
          control={control}
          render={({ field }) => (
            <Checkbox id="startOnboarding" checked={field.value} onCheckedChange={field.onChange} />
          )}
        />
        <Label htmlFor="startOnboarding">Start onboarding workflow</Label>
      </div>

      {submitError && <p className="text-sm text-red-600">{submitError}</p>}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating..." : "Create employee"}
      </Button>
    </form>
  );
}
