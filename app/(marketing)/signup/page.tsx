import Link from "next/link";
import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <Link
        href="/"
        className="absolute left-6 top-6 text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back
      </Link>
      <h1 className="text-2xl font-semibold">Create your account</h1>
      <SignupForm />
    </main>
  );
}
