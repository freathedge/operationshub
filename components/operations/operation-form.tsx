"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createOperationSchema, type CreateOperationInput } from "@/lib/validation/operations";
import type { Department } from "@/lib/domain/departments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PRIORITY_OPTIONS: NonNullable<CreateOperationInput["priority"]>[] = [
  "low",
  "medium",
  "high",
  "critical",
];

export function OperationForm({ departments }: { departments: Department[] }) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateOperationInput>({
    resolver: zodResolver(createOperationSchema),
    defaultValues: { priority: "medium" },
  });

  async function onSubmit(values: CreateOperationInput) {
    setSubmitError(null);
    const response = await fetch("/api/operations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      const body = await response.json();
      setSubmitError(typeof body.error === "string" ? body.error : "Failed to create operation");
      return;
    }

    const { operation } = await response.json();
    router.push(`/operations/${operation.id}`);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 max-w-lg">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">Title</Label>
        <Input id="title" {...register("title")} />
        {errors.title && <p className="text-sm text-red-600">{errors.title.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Description</Label>
        <textarea
          id="description"
          {...register("description", { setValueAs: (v) => v || undefined })}
          className="min-h-24 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
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
        <Label htmlFor="priority">Priority</Label>
        <select
          id="priority"
          {...register("priority")}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          {PRIORITY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="startDate">Start date</Label>
        <Input
          id="startDate"
          type="date"
          {...register("startDate", { setValueAs: (v) => v || undefined })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="targetDate">Target date</Label>
        <Input
          id="targetDate"
          type="date"
          {...register("targetDate", { setValueAs: (v) => v || undefined })}
        />
      </div>

      {submitError && <p className="text-sm text-red-600">{submitError}</p>}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating..." : "Create operation"}
      </Button>
    </form>
  );
}
