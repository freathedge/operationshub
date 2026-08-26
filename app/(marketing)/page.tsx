import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-3xl font-semibold">Operations Hub</h1>
      <p className="max-w-md text-muted-foreground">
        A centralized internal operations platform for AlpenTech
        Industries — requests, tasks, workflows, employees, assets, and
        operations in one place.
      </p>
      <div className="flex gap-3">
        <Button render={<Link href="/signup" />}>Create an account</Button>
        <Button render={<Link href="/login" />} variant="outline">
          Log in
        </Button>
      </div>
    </main>
  );
}
