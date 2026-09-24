import { SidebarTrigger } from "@/components/ui/sidebar"
import { getCurrentProfile } from "@/lib/auth/session"
import { NotificationBell } from "@/components/notification-bell"

export async function SiteHeader() {
  const profile = await getCurrentProfile()

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <div className="ml-auto">
          {profile && <NotificationBell profileId={profile.id} />}
        </div>
      </div>
    </header>
  )
}
