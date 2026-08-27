import { BackLink } from "@/components/back-link";
import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="absolute left-6 top-6">
        <BackLink href="/" />
      </div>
      <h1 className="text-2xl font-semibold">Create your account</h1>
      <SignupForm />
    </main>
  );
}
