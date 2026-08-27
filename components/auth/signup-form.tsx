"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { roleSchema } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const signupFormSchema = z
  .object({
    fullName: z.string().min(1, "Name is required").max(200),
    email: z.string().email("Enter a valid email"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
    role: roleSchema,
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type SignupFormValues = z.infer<typeof signupFormSchema>;

const PASSWORD_STRENGTH_MAX_LENGTH = 10;
const PASSWORD_STRENGTH_WEAK_COLOR = { r: 239, g: 68, b: 68 }; // red-500
const PASSWORD_STRENGTH_STRONG_COLOR = { r: 34, g: 197, b: 94 }; // green-500

function getPasswordStrengthColor(ratio: number) {
  const r = Math.round(
    PASSWORD_STRENGTH_WEAK_COLOR.r +
      (PASSWORD_STRENGTH_STRONG_COLOR.r - PASSWORD_STRENGTH_WEAK_COLOR.r) * ratio
  );
  const g = Math.round(
    PASSWORD_STRENGTH_WEAK_COLOR.g +
      (PASSWORD_STRENGTH_STRONG_COLOR.g - PASSWORD_STRENGTH_WEAK_COLOR.g) * ratio
  );
  const b = Math.round(
    PASSWORD_STRENGTH_WEAK_COLOR.b +
      (PASSWORD_STRENGTH_STRONG_COLOR.b - PASSWORD_STRENGTH_WEAK_COLOR.b) * ratio
  );
  return `rgb(${r}, ${g}, ${b})`;
}

const ROLE_OPTIONS: { value: SignupFormValues["role"]; label: string }[] = [
  { value: "employee", label: "Employee" },
  { value: "manager", label: "Manager" },
  { value: "operations_manager", label: "Operations Manager" },
  { value: "it", label: "IT" },
  { value: "hr", label: "HR" },
  { value: "admin", label: "Admin" },
];

export function SignupForm() {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormValues>({ resolver: zodResolver(signupFormSchema) });

  const password = watch("password") ?? "";
  const passwordStrengthRatio = Math.min(password.length / PASSWORD_STRENGTH_MAX_LENGTH, 1);

  // A user returning from the email-confirmation link already has a Supabase Auth session
  // and already picked a role before confirming — read it back from the user metadata
  // signUp stored, instead of making them pick again (or silently defaulting).
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      const rememberedRole = roleSchema.safeParse(user?.user_metadata?.role);
      if (rememberedRole.success) {
        setValue("role", rememberedRole.data);
      }
    });
  }, [setValue]);

  async function onSubmit(values: SignupFormValues) {
    setSubmitError(null);
    const supabase = createSupabaseBrowserClient();

    const {
      data: { session: existingSession },
    } = await supabase.auth.getSession();

    if (!existingSession) {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          data: { role: values.role },
          emailRedirectTo: `${window.location.origin}/auth/confirmed`,
        },
      });
      if (signUpError) {
        setSubmitError(signUpError.message);
        return;
      }
      if (!signUpData.session) {
        setSubmitError(
          "Check your email to confirm your account, then come back here to finish setting up your profile."
        );
        return;
      }
    }

    const response = await fetch("/api/auth/complete-signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fullName: values.fullName, role: values.role }),
    });

    if (!response.ok) {
      let message = "Failed to complete signup";
      try {
        const body = await response.json();
        if (typeof body.error === "string") message = body.error;
      } catch {
        // non-JSON error body (e.g. an unhandled server error) — keep the fallback message
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
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" {...register("email")} />
        {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" {...register("password")} />
        <div
          role="progressbar"
          aria-label="Password strength"
          aria-valuenow={password.length}
          aria-valuemin={0}
          aria-valuemax={PASSWORD_STRENGTH_MAX_LENGTH}
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${passwordStrengthRatio * 100}%`,
              backgroundColor: getPasswordStrengthColor(passwordStrengthRatio),
            }}
          />
        </div>
        {errors.password && <p className="text-sm text-red-600">{errors.password.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input id="confirmPassword" type="password" {...register("confirmPassword")} />
        {errors.confirmPassword && (
          <p className="text-sm text-red-600">{errors.confirmPassword.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="role">Explore as</Label>
        <select
          id="role"
          defaultValue=""
          {...register("role")}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <option value="" disabled>
            Choose a role
          </option>
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {errors.role && <p className="text-sm text-red-600">{errors.role.message}</p>}
      </div>

      {submitError && <p className="text-sm text-red-600">{submitError}</p>}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating account..." : "Create account"}
      </Button>
    </form>
  );
}
