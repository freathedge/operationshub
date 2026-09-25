"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { completeSignupSchema, type CompleteSignupInput } from "@/lib/validation/auth";
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

const ROLE_OPTIONS: { value: CompleteSignupInput["role"]; label: string }[] = [
  { value: "employee", label: "Employee" },
  { value: "manager", label: "Manager" },
  { value: "operations_manager", label: "Operations Manager" },
  { value: "it", label: "IT" },
  { value: "hr", label: "HR" },
  { value: "admin", label: "Admin" },
];

export function CompleteSignupForm() {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CompleteSignupInput>({ resolver: zodResolver(completeSignupSchema) });

  async function onSubmit(values: CompleteSignupInput) {
    setSubmitError(null);
    const response = await fetch("/api/auth/complete-signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });

    if (response.status === 409) {
      // Invited employee whose profile was already linked by Clerk's webhook — they're done.
      router.push("/dashboard");
      router.refresh();
      return;
    }

    if (!response.ok) {
      let message = "Failed to complete signup";
      try {
        const body = await response.json();
        if (typeof body.error === "string") message = body.error;
      } catch {
        // non-JSON error body — keep the fallback message
      }
      setSubmitError(message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 max-w-sm">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" {...register("fullName")} />
        {errors.fullName && <p className="text-sm text-red-600">{errors.fullName.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="role">Explore as</Label>
        <Controller
          name="role"
          control={control}
          render={({ field }) => (
            <Select value={field.value ?? null} onValueChange={field.onChange}>
              <SelectTrigger id="role" className="w-full">
                <SelectValue>
                  {(value: string | null) => (value ? (ROLE_OPTIONS.find((o) => o.value === value)?.label ?? value) : "Choose a role")}
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
          )}
        />
        {errors.role && <p className="text-sm text-red-600">{errors.role.message}</p>}
      </div>

      {submitError && <p className="text-sm text-red-600">{submitError}</p>}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Continuing..." : "Continue"}
      </Button>
    </form>
  );
}
