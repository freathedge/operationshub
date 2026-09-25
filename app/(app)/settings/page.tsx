import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getProfileByAuthUserId } from "@/lib/domain/profiles";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="flex flex-col gap-6">
      <BackLink href="/dashboard" />
      <PageHeader title="Settings" />
      <div className="flex flex-col gap-4 max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
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
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <p className="text-sm font-medium">Theme</p>
            <ThemeToggle />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
