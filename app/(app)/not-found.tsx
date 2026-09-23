import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">
        This page doesn&apos;t exist yet, or the link is out of date.
      </p>
      <Link href="/dashboard" className="text-sm underline">
        Back to dashboard
      </Link>
    </div>
  );
}
