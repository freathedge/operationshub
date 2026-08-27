import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfileByAuthUserId } from "@/lib/domain/profiles";
import { LogoutButton } from "@/components/auth/logout-button";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const profile = await getProfileByAuthUserId(user.id);
  if (!profile) {
    redirect("/signup");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <span className="font-semibold">Operations Hub</span>
        <div className="flex items-center gap-4 text-sm">
          <span>
            {profile.fullName} · {profile.role}
          </span>
          <LogoutButton />
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
