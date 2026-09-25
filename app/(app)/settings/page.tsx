import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getProfileByAuthUserId } from "@/lib/domain/profiles";
import { BackLink } from "@/components/back-link";
import { ThemeToggle } from "@/components/settings/theme-toggle";

export default async function SettingsPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/login");
  }

  const profile = await getProfileByAuthUserId(userId);
  if (!profile) {
    redirect("/signup");
  }

  const user = await currentUser();

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
          <p>{user?.primaryEmailAddress?.emailAddress ?? ""}</p>
        </div>
        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-sm font-medium">Theme</p>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
