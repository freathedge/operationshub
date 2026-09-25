import { SignIn } from "@clerk/nextjs";
import { BackLink } from "@/components/back-link";

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="absolute left-6 top-6">
        <BackLink href="/" />
      </div>
      <h1 className="text-2xl font-semibold">Log in</h1>
      <SignIn fallbackRedirectUrl="/dashboard" />
    </main>
  );
}
