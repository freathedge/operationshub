import Link from "next/link";

export function BackLink({ href, label = "Back" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="text-sm text-muted-foreground hover:text-foreground">
      ← {label}
    </Link>
  );
}
