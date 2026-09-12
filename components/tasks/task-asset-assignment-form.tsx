"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createAssetSchema, type CreateAssetInput } from "@/lib/validation/assets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TaskAssetAssignmentForm({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateAssetInput>({ resolver: zodResolver(createAssetSchema) });

  async function onSubmit(values: CreateAssetInput) {
    setSubmitError(null);
    const response = await fetch(`/api/tasks/${taskId}/complete-with-asset`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: values.name, category: values.category }),
    });

    if (!response.ok) {
      const body = await response.json();
      setSubmitError(typeof body.error === "string" ? body.error : "Failed to complete task");
      return;
    }

    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3 rounded-md border p-4">
      <p className="text-sm font-medium">Assign the asset to complete this step</p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="asset-name">Name</Label>
        <Input id="asset-name" {...register("name")} />
        {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="asset-category">Category</Label>
        <Input id="asset-category" {...register("category")} placeholder="laptop, monitor, ..." />
        {errors.category && <p className="text-sm text-red-600">{errors.category.message}</p>}
      </div>

      {submitError && <p className="text-sm text-red-600">{submitError}</p>}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Assigning..." : "Assign Asset & Complete"}
      </Button>
    </form>
  );
}
