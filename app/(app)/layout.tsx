import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getProfileByAuthUserId } from "@/lib/domain/profiles";
import { canViewCompanyOverview } from "@/lib/domain/permissions";
import { QueryProvider } from "@/components/providers/query-provider";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();

  if (!userId) {
    redirect("/login");
  }

  const profile = await getProfileByAuthUserId(userId);
  if (!profile) {
    redirect("/signup");
  }

  const user = await currentUser();
  const cookieStore = await cookies();
  const sidebarDefaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider
      defaultOpen={sidebarDefaultOpen}
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar
        variant="inset"
        user={{
          name: profile.fullName,
          email: user?.primaryEmailAddress?.emailAddress ?? "",
          role: profile.role,
        }}
        canViewReports={canViewCompanyOverview(profile)}
      />
      <SidebarInset>
        <SiteHeader />
        <main className="flex-1 p-6">
          <QueryProvider>{children}</QueryProvider>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
