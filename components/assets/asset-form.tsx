"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createAssetSchema, type CreateAssetInput } from "@/lib/validation/assets";
import type { Department } from "@/lib/domain/departments";
import type { Location } from "@/lib/domain/locations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AssetForm({
  departments,
  locations,
}: {
  departments: Department[];
  locations: Location[];
}) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateAssetInput>({ resolver: zodResolver(createAssetSchema) });

  async function onSubmit(values: CreateAssetInput) {
    setSubmitError(null);
    const response = await fetch("/api/assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      const body = await response.json();
      setSubmitError(typeof body.error === "string" ? body.error : "Failed to create asset");
      return;
    }

    const { asset } = await response.json();
    router.push(`/assets/${asset.id}`);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 max-w-lg">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" {...register("name")} />
        {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category">Category</Label>
        <Input id="category" {...register("category")} placeholder="laptop, monitor, vehicle, ..." />
        {errors.category && <p className="text-sm text-red-600">{errors.category.message}</p>}
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

      {submitError && <p className="text-sm text-red-600">{submitError}</p>}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating..." : "Create asset"}
      </Button>
    </form>
  );
}
