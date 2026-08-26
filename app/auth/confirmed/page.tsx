"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";

export default function ConfirmedPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "confirmed" | "error">("checking");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setStatus(session ? "confirmed" : "error");
    });
  }, []);

  if (status === "checking") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-muted-foreground">Confirming your email...</p>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold">Confirmation link invalid or expired</h1>
        <p className="max-w-sm text-muted-foreground">
          Please try signing up again, or log in if you already confirmed your email.
        </p>
        <Link href="/signup" className="text-sm underline underline-offset-4">
          Back to sign up
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Email confirmed ✓</h1>
      <p className="max-w-sm text-muted-foreground">
        Your account is verified. Continue to finish setting up your profile.
      </p>
      <Button onClick={() => router.push("/dashboard")}>Continue</Button>
    </main>
  );
}
