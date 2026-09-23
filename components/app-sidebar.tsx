"use client"

import * as React from "react"
import Link from "next/link"

import { NavMain, type NavGroup } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser, type CurrentUserSummary } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  LayoutDashboardIcon,
  ListTodoIcon,
  InboxIcon,
  FolderKanbanIcon,
  WorkflowIcon,
  UsersIcon,
  PackageIcon,
  CircleHelpIcon,
  SearchIcon,
  LayoutGridIcon,
} from "lucide-react"

const navGroups: NavGroup[] = [
  {
    label: "Home",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: <LayoutDashboardIcon /> },
      { title: "Tasks", url: "/tasks", icon: <ListTodoIcon /> },
      { title: "Requests", url: "/requests", icon: <InboxIcon /> },
      { title: "Operations", url: "/operations", icon: <FolderKanbanIcon /> },
      { title: "Workflows", url: "/workflows", icon: <WorkflowIcon /> },
    ],
  },
  {
    label: "Resources",
    items: [
      { title: "Employees", url: "/employees", icon: <UsersIcon /> },
      { title: "Assets", url: "/assets", icon: <PackageIcon /> },
    ],
  },
]

const navSecondary = [
  { title: "Search", url: "#", icon: <SearchIcon /> },
  { title: "Get Help", url: "mailto:support@alpentech.example", icon: <CircleHelpIcon /> },
]

export function AppSidebar({
  user,
  ...props
}: { user: CurrentUserSummary } & React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<Link href="/dashboard" />}
            >
              <LayoutGridIcon className="size-5!" />
              <span className="text-base font-semibold">Operations Hub</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain groups={navGroups} />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
