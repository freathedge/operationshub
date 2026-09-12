"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { AcceptInviteForm } from "@/components/auth/accept-invite-form";

export default function AcceptInvitePage() {
  const [status, setStatus] = useState<"checking" | "ready" | "error">("checking");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setStatus(session ? "ready" : "error");
    });
  }, []);

  if (status === "checking") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-muted-foreground">Confirming your invite...</p>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold">Invite link invalid or expired</h1>
        <p className="max-w-sm text-muted-foreground">
          Ask whoever invited you to send a new invite, or log in if you already set a password.
        </p>
        <Link href="/login" className="text-sm underline underline-offset-4">
          Back to login
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">Welcome</h1>
        <p className="max-w-sm text-muted-foreground">
          Set a password to finish setting up your account.
        </p>
      </div>
      <AcceptInviteForm />
    </main>
  );
}
