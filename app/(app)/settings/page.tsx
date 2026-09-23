import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfileByAuthUserId } from "@/lib/domain/profiles";
import { BackLink } from "@/components/back-link";
import { ThemeToggle } from "@/components/settings/theme-toggle";

export default async function SettingsPage() {
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
    <div>
      <BackLink href="/dashboard" />
      <h1 className="text-2xl font-semibold mb-4 mt-2">Settings</h1>
      <div className="flex flex-col gap-6 max-w-md">
        <div>
          <p className="text-sm text-muted-foreground">Name</p>
          <p>{profile.fullName}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Role</p>
          <p>{profile.role}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Email</p>
          <p>{user.email ?? ""}</p>
        </div>
        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-sm font-medium">Theme</p>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
