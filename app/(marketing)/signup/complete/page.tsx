import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { BackLink } from "@/components/back-link";
import { CompleteSignupForm } from "@/components/auth/complete-signup-form";

export default async function CompleteSignupPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/signup");
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="absolute left-6 top-6">
        <BackLink href="/signup" />
      </div>
      <h1 className="text-2xl font-semibold">One more step</h1>
      <p className="max-w-sm text-center text-muted-foreground">
        Tell us your name and pick a role to explore Operations Hub with.
      </p>
      <CompleteSignupForm />
    </main>
  );
}
