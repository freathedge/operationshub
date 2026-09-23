# Sidebar Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `app/(app)/layout.tsx`'s simple header with the shadcn `dashboard-01` block's sidebar-navigation shell, applied app-wide, adapted to this app's real routes (Dashboard/Tasks/Requests/Operations/Workflows under "Home", Employees/Assets under "Resources"), with a real profile-backed user menu, a new `/settings` page, and a working light/dark theme toggle.

**Architecture:** `app/(app)/layout.tsx` stays a Server Component doing the same auth/profile loading and redirect logic it does today, but now renders `SidebarProvider` → `AppSidebar` (client, receives profile + email as plain props) → `SidebarInset` → `SiteHeader` + `{children}`. None of the 7 existing route pages change. `next-themes`' `ThemeProvider` and a `TooltipProvider` (the sidebar primitive needs one for its collapsed-state tooltips) get wired into the root layout, not the `(app)` layout, so theming also covers marketing/auth pages at no extra cost.

**Tech Stack:** Next.js App Router, shadcn/ui (`dashboard-01` block, Base UI variant), `next-themes`, lucide-react, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-23-sidebar-shell-design.md`

## Global Constraints

- No page under `app/(app)/` other than the new `app/(app)/settings/page.tsx` changes its own content, permissions, or data (spec §1, §7).
- No role-based filtering of nav items — every authenticated role sees the same 7 links (spec §2).
- No formal auth-provider abstraction layer — `NavUser` and the settings page take a plain `{ name, email, role }` shape, never a Supabase `User` or the domain `Profile` type directly (spec §2).
- No avatar photo upload, no profile editing — settings page is read-only display + theme toggle only (spec §7).
- No working global search — Search is a placeholder entry only; real search is Phase 8's job (spec §2, §7).
- No `/approvals` or `/workflows` list page gets built here — that's a separate backlog item (spec §7).
- `app/(app)/layout.test.tsx`'s two redirect tests (`/login` when no user, `/signup` when no profile) must keep passing unchanged — same mocking contract, same assertions on redirect target (spec §5).

## Review Focus

- **A profile whose `fullName` is long enough to overflow the sidebar's fixed width.** The block's own `NavUser` trigger already truncates (`truncate` classes on name/email spans) — a test should confirm this truncation class survives adaptation, not just that the text renders.
- **The currently-active route not highlighted, or the wrong one highlighted, when nested (e.g. `/tasks/abc-123` while `/tasks` is the nav item).** `SidebarMenuButton`'s `isActive` prop needs prefix-matching (`pathname === item.url || pathname.startsWith(item.url + "/")`), not exact-match only — otherwise every task/request/etc. detail page shows no active nav item at all, which a reasonable person would find confusing.
- **Logging out from the new `NavUser` menu item doesn't actually work** (the block's own "Log out" `DropdownMenuItem` has no `onClick` at all — it's decorative). This is a real, easy-to-miss regression risk: the old header's `LogoutButton` genuinely signs out; a naive port that just changes the label without wiring the click handler would silently break logout.
- **`useTheme()` called during server-side rendering / before hydration returns `undefined` for `theme`.** `next-themes`' own docs describe this: the toggle must render a stable, non-flashing initial state (a mounted-check `useEffect` guard) rather than reading `theme` directly on first render, or the toggle icon will flicker/mismatch between server and client.
- **The settings page reachable by a signed-in user with no profile row somehow bypasses the redirect** other pages enforce. Since `app/(app)/settings/page.tsx` is new code independently replicating the auth-check pattern (not reusing `getCurrentProfile()`, because it also needs email — see plan body), it's the one page most likely to accidentally skip a check the other six get for free through a shared helper.

---

## File Structure

| File | Responsibility |
|---|---|
| `app/layout.tsx` | Modify. Wrap children in `next-themes`' `ThemeProvider` and `TooltipProvider`; add `suppressHydrationWarning`. |
| `app/(app)/layout.tsx` | Modify. Same auth logic, new JSX: `SidebarProvider` → `AppSidebar` → `SidebarInset` → `SiteHeader` + `{children}`. |
| `app/(app)/layout.test.tsx` | Modify. Redirect tests unchanged; profile-rendering assertion updated to match the new shell's markup. |
| `components/ui/sidebar.tsx` | New (re-pulled from the block). Unmodified shadcn primitive. |
| `hooks/use-mobile.ts` | New (re-pulled from the block). Unmodified. |
| `components/app-sidebar.tsx` | New (from the block, adapted). Assembles `NavMain` + `NavSecondary` + `NavUser`, real "Operations Hub" branding. |
| `components/nav-main.tsx` | New (from the block, adapted). Takes grouped nav data, renders two labeled `SidebarGroup`s, real `Link`s, active-route highlighting. |
| `components/nav-secondary.tsx` | New (from the block, unchanged code — only its call-site data changes, in Task 5). Search (placeholder) + Get Help (`mailto:`). |
| `components/nav-user.tsx` | New (from the block, adapted). Takes `CurrentUserSummary`, real working Log out, Settings link. |
| `components/site-header.tsx` | New (from the block, adapted). Trigger + separator only, no page title. |
| `app/(app)/settings/page.tsx` | New. Server Component: loads profile + email, renders read-only info + `ThemeToggle`. |
| `components/settings/theme-toggle.tsx` | New. Client component using `next-themes`' `useTheme()`. |
| `components/settings/theme-toggle.test.tsx` | New. |
| `components/nav-main.test.tsx` | New. |
| `components/nav-user.test.tsx` | New. |
| `components/app-sidebar.test.tsx` | New. |

Not created: `app/dashboard/` (block's own stray demo route), `components/chart-area-interactive.tsx`, `components/data-table.tsx`, `components/nav-documents.tsx`, `components/section-cards.tsx` — none used, matching Phase 7's Task 1 precedent for pruning this same block.

---

### Task 1: Pull the block's sidebar files and prune

This mirrors Phase 7's Task 1 exactly (same block, same registry, verified live on 2026-09-23) — the only difference is which files this phase keeps vs. discards. Phase 7 discarded `app-sidebar.tsx`/`nav-main.tsx`/`nav-secondary.tsx`/`nav-user.tsx`/`site-header.tsx`/`sidebar.tsx`/`use-mobile.ts` because the dashboard alone didn't need a sidebar shell; this phase needs all of them.

**What the command does (verified by dry-run against this exact worktree on 2026-09-23):**
- Every existing `components/ui/*.tsx` primitive comes back "skip (identical)" — no overwrite risk this time (Phase 7's `cn`-package migration already landed).
- Creates fresh: `hooks/use-mobile.ts`, `components/ui/sidebar.tsx`, `app/dashboard/page.tsx` + `app/dashboard/data.json` (the block's own stray demo route — not ours), `components/app-sidebar.tsx`, `components/chart-area-interactive.tsx`, `components/data-table.tsx`, `components/nav-documents.tsx`, `components/nav-main.tsx`, `components/nav-secondary.tsx`, `components/nav-user.tsx`, `components/section-cards.tsx`, `components/site-header.tsx`.
- Adds dependencies already satisfied by Phase 7 (`cn`, `next-themes`, `recharts`, `sonner` — no-ops) plus `@dnd-kit/core`, `@dnd-kit/modifiers`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `@tanstack/react-table` — these five are only consumed by `components/data-table.tsx`, which this task deletes, so they get uninstalled again in Step 3, same as Phase 7 Task 1's pattern.

- [ ] **Step 1: Run the CLI**

```bash
npx shadcn@latest add dashboard-01 -y -o
```

- [ ] **Step 2: Delete the stray route and the files this phase doesn't need**

```bash
rm -rf app/dashboard
rm -f components/chart-area-interactive.tsx components/data-table.tsx \
      components/nav-documents.tsx components/section-cards.tsx
```

Keep: `components/app-sidebar.tsx`, `components/nav-main.tsx`, `components/nav-secondary.tsx`, `components/nav-user.tsx`, `components/site-header.tsx`, `components/ui/sidebar.tsx`, `hooks/use-mobile.ts` — Tasks 2-6 adapt these in place.

- [ ] **Step 3: Uninstall the dependencies only the deleted data-table needed**

```bash
npm uninstall @dnd-kit/core @dnd-kit/modifiers @dnd-kit/sortable @dnd-kit/utilities @tanstack/react-table
```

- [ ] **Step 4: Verify nothing broke**

```bash
npm run lint
npm run test:unit
```

Expected: lint clean (same pre-existing findings as every prior phase — one `react-hooks/refs` error in `lib/realtime/use-broadcast-listener.ts`, untouched by this branch, plus a handful of pre-existing unused-var warnings); all 366 existing unit tests still passing unchanged (the files this task keeps aren't imported by anything yet, so nothing exercises them).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: pull shadcn dashboard-01 block's sidebar files

Re-pulls the same block Phase 7 partially used, this time keeping the
sidebar/nav/user-menu files Phase 7 discarded (the dashboard alone
didn't need a shell; the whole app now does). Discards the block's
own demo route and the chart/data-table/documents/section-cards files
this app doesn't use, and uninstalls the five deps only the discarded
data-table needed.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Wire ThemeProvider and TooltipProvider into the root layout

**Files:**
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `ThemeProvider` from `next-themes` (already installed).
- Produces: every descendant component can call `next-themes`' `useTheme()`; the sidebar primitive's `Tooltip`/`TooltipContent` (used internally by `SidebarMenuButton` when it has a `tooltip` prop) has the context it needs.

This is the one file in this task whose current content is worth reading in full first — it's short.

- [ ] **Step 1: Read the current file**

```bash
cat app/layout.tsx
```

It currently exports `RootLayout({ children }: LayoutProps<"/">)` rendering `<html lang="en" className="...">` → `<body className="min-h-full flex flex-col">{children}</body>`, with no theme or tooltip wiring.

- [ ] **Step 2: Write the failing test**

There's no existing test file for `app/layout.tsx`. Add one, following the exact pattern `app/(app)/layout.test.tsx` already uses for testing an async/sync Server Component's returned element shape (`JSON.stringify(element)` substring checks) — but this component is synchronous, so no `await`:

Create `app/layout.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import RootLayout from "@/app/layout";

describe("RootLayout", () => {
  it("wraps children in ThemeProvider and TooltipProvider", () => {
    const element = RootLayout({ children: "hello-world-marker" });
    const serialized = JSON.stringify(element);
    expect(serialized).toContain("hello-world-marker");
    // next-themes' ThemeProvider and the shadcn TooltipProvider are both
    // rendered as component references in the element tree, not by a
    // string name JSON.stringify would show directly — so this test proves
    // structural nesting depth instead: children must be nested at least
    // two levels below <body>, which is only true once both providers wrap
    // it. A single flat <body>{children}</body> has children one level deep.
    const bodyChildren = element.props.children.props.children;
    // bodyChildren is whatever ThemeProvider wraps; if the providers were
    // never added, bodyChildren would literally equal "hello-world-marker"
    // instead of a nested element structure containing it.
    expect(bodyChildren).not.toBe("hello-world-marker");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm run test:unit -- app/layout.test.tsx
```

Expected: FAIL — currently `bodyChildren` (the direct child of `<body>`) already *is* `"hello-world-marker"` (no wrapping providers yet), so `.not.toBe(...)` fails.

- [ ] **Step 4: Implement**

Replace `app/layout.tsx`'s content with:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Operations Hub",
  description: "The internal operations platform for AlpenTech Industries.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm run test:unit -- app/layout.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Run the full unit suite**

```bash
npm run test:unit
```

Expected: all passing, no regressions.

- [ ] **Step 7: Commit**

```bash
git add app/layout.tsx app/layout.test.tsx
git commit -m "feat: wire next-themes and TooltipProvider into the root layout

Enables the sidebar shell's collapsed-state tooltips (the shadcn
sidebar primitive needs a TooltipProvider ancestor) and the theme
toggle Task 7 adds. suppressHydrationWarning is required here because
next-themes sets the dark/light class client-side before hydration
completes, which otherwise triggers a hydration-mismatch warning on
every page load.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Adapt `NavMain` for grouped, real, active-highlighted navigation

**Files:**
- Modify: `components/nav-main.tsx`
- Test: `components/nav-main.test.tsx`

**Interfaces:**
- Consumes: `SidebarGroup`, `SidebarGroupLabel`, `SidebarGroupContent`, `SidebarMenu`, `SidebarMenuButton`, `SidebarMenuItem` (`@/components/ui/sidebar`, all already exported per the primitive's own `export { ... }` block — verified 2026-09-23).
- Produces:
  ```ts
  export interface NavGroup {
    label: string;
    items: { title: string; url: string; icon: React.ReactNode }[];
  }
  export function NavMain(props: { groups: NavGroup[] }): JSX.Element;
  ```
  Task 5's `AppSidebar` imports `NavMain` and passes this exact `groups` shape — two groups, "Home" (Dashboard/Tasks/Requests/Operations/Workflows) and "Resources" (Employees/Assets).

The block's original `NavMain` takes a flat `items` array (no grouping, no real links — every item is a plain `<SidebarMenuButton>` with no `render`/`href` at all, so none of the block's own nav items actually navigate anywhere) and also renders a hardcoded "Quick Create" button + a mail-icon button that have no equivalent in this app. This task replaces all of that.

- [ ] **Step 1: Write the failing test**

Create `components/nav-main.test.tsx`, following `components/operations/operation-list-view.test.tsx`'s pattern for wrapping components that need routing context (mock `next/navigation`) — `NavMain` needs `usePathname()` to compute the active item, and needs to render inside a `SidebarProvider` since `SidebarMenuButton` calls `useSidebar()` internally:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LayoutDashboardIcon } from "lucide-react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { NavMain, type NavGroup } from "@/components/nav-main";

let mockPathname = "/dashboard";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

const groups: NavGroup[] = [
  {
    label: "Home",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: <LayoutDashboardIcon /> },
      { title: "Tasks", url: "/tasks", icon: <LayoutDashboardIcon /> },
    ],
  },
  {
    label: "Resources",
    items: [{ title: "Employees", url: "/employees", icon: <LayoutDashboardIcon /> }],
  },
];

function renderNavMain() {
  return render(
    <SidebarProvider>
      <NavMain groups={groups} />
    </SidebarProvider>
  );
}

describe("NavMain", () => {
  it("renders both group labels and every item within them", () => {
    renderNavMain();
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Resources")).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Tasks")).toBeInTheDocument();
    expect(screen.getByText("Employees")).toBeInTheDocument();
  });

  it("links each item to its real route, not a dead '#'", () => {
    renderNavMain();
    expect(screen.getByText("Tasks").closest("a")).toHaveAttribute("href", "/tasks");
  });

  it("marks the item matching the current pathname as active", () => {
    mockPathname = "/tasks";
    renderNavMain();
    const tasksButton = screen.getByText("Tasks").closest("[data-slot='sidebar-menu-button']");
    expect(tasksButton).toHaveAttribute("data-active", "true");
  });

  it("marks the item active on a nested route, not just an exact match", () => {
    mockPathname = "/tasks/some-task-id";
    renderNavMain();
    const tasksButton = screen.getByText("Tasks").closest("[data-slot='sidebar-menu-button']");
    expect(tasksButton).toHaveAttribute("data-active", "true");
  });

  it("does not mark an unrelated item active", () => {
    mockPathname = "/tasks";
    renderNavMain();
    const dashboardButton = screen
      .getByText("Dashboard")
      .closest("[data-slot='sidebar-menu-button']");
    expect(dashboardButton).toHaveAttribute("data-active", "false");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:unit -- components/nav-main.test.tsx
```

Expected: FAIL — `NavMain` doesn't export a `groups`-shaped API yet, and doesn't export `NavGroup`.

- [ ] **Step 3: Implement**

Replace `components/nav-main.tsx`'s content with:

```tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export interface NavGroup {
  label: string
  items: { title: string; url: string; icon: React.ReactNode }[]
}

export function NavMain({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname()

  return (
    <>
      {groups.map((group) => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => {
                const isActive =
                  pathname === item.url || pathname.startsWith(`${item.url}/`)
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      tooltip={item.title}
                      isActive={isActive}
                      render={<Link href={item.url} />}
                    >
                      {item.icon}
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  )
}
```

`data-active` on the rendered element comes from `SidebarMenuButton`'s own implementation (`state: { active: isActive }` fed into its `useRender` call, per `components/ui/sidebar.tsx`'s existing code) — this task doesn't need to add that attribute itself, just pass `isActive` correctly.

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:unit -- components/nav-main.test.tsx
```

Expected: PASS. If `data-active` isn't the exact attribute name `SidebarMenuButton` renders, read `components/ui/sidebar.tsx`'s `SidebarMenuButton` implementation and its underlying `useRender`/`mergeProps` call to find the real one, and adjust the test's assertions — don't guess a second attribute name without checking.

- [ ] **Step 5: Commit**

```bash
git add components/nav-main.tsx components/nav-main.test.tsx
git commit -m "feat: adapt NavMain for grouped nav with real links and active state

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Adapt `NavSecondary` (Search placeholder + Get Help) and `SiteHeader`

**Files:**
- Modify: `components/nav-secondary.tsx`
- Modify: `components/site-header.tsx`

**Interfaces:**
- Consumes: nothing new beyond what the block already imports.
- Produces: `NavSecondary` keeps its existing `{ items: { title, url, icon }[] } & SidebarGroup props` signature unchanged (Task 5 passes it two items). `SiteHeader` keeps its existing no-props signature.

The block's `NavSecondary` already renders real `<a href={item.url}>` links (verified 2026-09-23 — unlike `NavMain`, this one wasn't broken) via `render={<a href={item.url} />}`. This task only needs new *data*, not a rewrite of the component's rendering logic — a plain `<a>` is correct here (Get Help is a `mailto:` link, Search isn't a route at all), not `next/link`'s `Link`.

- [ ] **Step 1: Adapt `nav-secondary.tsx`**

The component function itself is already correct (re-read `components/nav-secondary.tsx` after Task 1 to confirm — its `NavSecondary({ items, ...props })` body needs no changes). This task is data-only, applied at the call site in Task 5 (`AppSidebar`), so there is nothing to change in `nav-secondary.tsx` itself beyond confirming it compiles as-is. Skip to Step 2.

- [ ] **Step 2: Simplify `site-header.tsx`**

Replace `components/site-header.tsx`'s content with:

```tsx
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

export function SiteHeader() {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 h-4 data-vertical:self-auto"
        />
      </div>
    </header>
  )
}
```

(Identical to the block's original except the `<h1 className="text-base font-medium">Documents</h1>` line is removed — every page already renders its own heading, per spec §2/§3.)

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no new errors (this task doesn't wire either component into anything yet — Task 5 does — so there's nothing importable to break yet; this just confirms both files are syntactically valid on their own).

- [ ] **Step 4: Commit**

```bash
git add components/site-header.tsx
git commit -m "feat: simplify SiteHeader, drop the block's placeholder page title

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

Note: `nav-secondary.tsx` isn't staged here since Step 1 made no changes to it — it was already correct from Task 1's pull.

---

### Task 5: Adapt `NavUser` (real profile data, working logout) and `AppSidebar` (assembly)

**Files:**
- Modify: `components/nav-user.tsx`
- Test: `components/nav-user.test.tsx`
- Modify: `components/app-sidebar.tsx`
- Test: `components/app-sidebar.test.tsx`

**Interfaces:**
- Consumes: `NavMain`/`NavGroup` (Task 3), `NavSecondary` (unchanged, Task 4), `SiteHeader` (Task 4) — `SiteHeader` isn't actually used inside `AppSidebar` (it's rendered by the layout in Task 6, alongside `AppSidebar`, not inside it — matching the block's own `app/dashboard/page.tsx` structure where `AppSidebar` and `SiteHeader` are siblings under `SidebarInset`).
- Produces:
  ```ts
  export interface CurrentUserSummary {
    name: string;
    email: string;
    role: string;
  }
  export function NavUser(props: { user: CurrentUserSummary }): JSX.Element;
  export function AppSidebar(
    props: { user: CurrentUserSummary } & React.ComponentProps<typeof Sidebar>
  ): JSX.Element;
  ```
  Task 6's `app/(app)/layout.tsx` imports `AppSidebar` and passes `user={{ name: profile.fullName, email: user.email ?? "", role: profile.role }}`.

This is the task the plan's Review Focus calls out twice: the block's own "Log out" menu item has no `onClick` at all (decorative), and the name/email truncation must survive the rewrite.

- [ ] **Step 1: Write the failing test**

Create `components/nav-user.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SidebarProvider } from "@/components/ui/sidebar";
import { NavUser } from "@/components/nav-user";

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

const signOutMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: { signOut: signOutMock },
  }),
}));

const user = { name: "Max Mustermann", email: "max@alpentech.example", role: "it" };

function renderNavUser() {
  return render(
    <SidebarProvider>
      <NavUser user={user} />
    </SidebarProvider>
  );
}

describe("NavUser", () => {
  it("renders the profile's name and email, truncated", () => {
    renderNavUser();
    const nameEl = screen.getByText("Max Mustermann");
    expect(nameEl).toHaveClass("truncate");
    const emailEl = screen.getByText("max@alpentech.example");
    expect(emailEl).toHaveClass("truncate");
  });

  it("has a Settings menu item linking to /settings", async () => {
    renderNavUser();
    await userEvent.click(screen.getByText("Max Mustermann"));
    expect(screen.getByText("Settings").closest("a")).toHaveAttribute("href", "/settings");
  });

  it("signs the user out and redirects to /login when Log out is clicked", async () => {
    renderNavUser();
    await userEvent.click(screen.getByText("Max Mustermann"));
    await userEvent.click(screen.getByText("Log out"));

    expect(signOutMock).toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith("/login");
    expect(refreshMock).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:unit -- components/nav-user.test.tsx
```

Expected: FAIL — current `NavUser` takes `{ name, email, avatar }`, has no Settings item, and its Log out item does nothing.

- [ ] **Step 3: Implement**

Replace `components/nav-user.tsx`'s content with:

```tsx
"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { EllipsisVerticalIcon, SettingsIcon, LogOutIcon } from "lucide-react"

export interface CurrentUserSummary {
  name: string
  email: string
  role: string
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ""
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ""
  return (first + last).toUpperCase()
}

export function NavUser({ user }: { user: CurrentUserSummary }) {
  const { isMobile } = useSidebar()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton size="lg" className="aria-expanded:bg-muted" />
            }
          >
            <Avatar className="size-8 rounded-lg grayscale">
              <AvatarFallback className="rounded-lg">{initials(user.name)}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs text-foreground/70">
                {user.role} &middot; {user.email}
              </span>
            </div>
            <EllipsisVerticalIcon className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="size-8">
                    <AvatarFallback className="rounded-lg">{initials(user.name)}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem render={<Link href="/settings" />}>
                <SettingsIcon />
                Settings
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOutIcon />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
```

`DropdownMenuItem`'s `render` prop follows the same Base UI polymorphic-render pattern already seen on `SidebarMenuButton`/`Button` elsewhere in this codebase (e.g. `Button render={<Link href="/tasks/new" />}` in `components/tasks/task-list-view.tsx`) — check `components/ui/dropdown-menu.tsx`'s `DropdownMenuItem` signature accepts `render` before committing to this; if it doesn't, wrap `<Link>` around the `<DropdownMenuItem>` instead (Next.js `Link` accepts any child), whichever compiles.

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:unit -- components/nav-user.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Adapt `app-sidebar.tsx`**

Replace `components/app-sidebar.tsx`'s content with:

```tsx
"use client"

import * as React from "react"

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
  SettingsIcon,
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
              render={<a href="/dashboard" />}
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
```

The `Workflows` nav item's `url: "/workflows"` (spec §6's open call): this plan resolves it to the plain route as written — `/workflows` currently has no `page.tsx` (only `/workflows/[id]`), so it will 404 until the separate `/approvals`+`/workflows` list-page backlog item lands. This is the "accept it 404s until that backlog item lands" option from spec §6, chosen here because it needs no extra UI state (a disabled nav item, or a "coming soon" page) for what's already a tracked, visible gap — do not build a stub page as part of this task, that's explicitly out of scope (spec §7).

The `Search` item's `url: "#"` is the placeholder from spec §2/§6 — clicking it currently does nothing (`NavSecondary` renders a plain `<a href="#">`). This is the "simpler static entry" option from spec §6's open call, chosen for the same reason: no extra state needed for a tracked, visible placeholder.

- [ ] **Step 6: Write a failing integration test for `AppSidebar`'s assembly**

`nav-secondary.tsx` itself isn't changed by this plan (Task 4 confirmed it's already correct), so it gets no test of its own — but nothing yet verifies this task's *data* actually reaches it once wired into `AppSidebar`. Create `components/app-sidebar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

let mockPathname = "/dashboard";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({ auth: { signOut: vi.fn() } }),
}));

import { AppSidebar } from "@/components/app-sidebar";

const user = { name: "Max Mustermann", email: "max@alpentech.example", role: "it" };

describe("AppSidebar", () => {
  it("renders every Home and Resources nav item", () => {
    render(<AppSidebar user={user} />);
    for (const label of ["Dashboard", "Tasks", "Requests", "Operations", "Workflows", "Employees", "Assets"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("renders the Search and Get Help secondary nav items", () => {
    render(<AppSidebar user={user} />);
    expect(screen.getByText("Search")).toBeInTheDocument();
    expect(screen.getByText("Get Help").closest("a")).toHaveAttribute(
      "href",
      "mailto:support@alpentech.example"
    );
  });

  it("renders the user's name in the footer menu", () => {
    render(<AppSidebar user={user} />);
    expect(screen.getByText("Max Mustermann")).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

```bash
npm run test:unit -- components/app-sidebar.test.tsx
```

Expected: FAIL — `SidebarProvider` is required as an ancestor of `Sidebar` (per `useSidebar()`'s internal context requirement), and `AppSidebar` doesn't render one itself (matching the original block, where the page wraps it) — this first run should fail with a "must be used within a SidebarProvider" error, not a missing-text error. That failure mode is itself informative: it confirms the test needs its own `SidebarProvider` wrapper, which the block's real usage (Task 6's `app/(app)/layout.tsx`) also provides.

- [ ] **Step 8: Fix the test's wrapper and re-run**

Wrap the three `render(<AppSidebar user={user} />)` calls in a `SidebarProvider`, matching `nav-main.test.tsx`'s and `nav-user.test.tsx`'s own wrapping pattern:

```tsx
import { SidebarProvider } from "@/components/ui/sidebar";
```

and change each `render(<AppSidebar user={user} />)` to:

```tsx
render(
  <SidebarProvider>
    <AppSidebar user={user} />
  </SidebarProvider>
);
```

```bash
npm run test:unit -- components/app-sidebar.test.tsx
```

Expected: PASS now that the provider requirement is met and Step 5's real implementation is in place.

- [ ] **Step 9: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean (this doesn't wire `AppSidebar` into the layout yet — Task 6 does — so this only confirms the file itself is valid).

- [ ] **Step 10: Run the full unit suite**

```bash
npm run test:unit
```

Expected: all passing.

- [ ] **Step 11: Commit**

```bash
git add components/nav-user.tsx components/nav-user.test.tsx components/app-sidebar.tsx \
        components/app-sidebar.test.tsx
git commit -m "feat: adapt NavUser and AppSidebar with real profile data and working logout

The block's own 'Log out' menu item had no onClick at all — this
wires it to the same supabase.auth.signOut() + redirect flow
components/auth/logout-button.tsx already used, so logout keeps
working once the old header is gone. Avatar is initials-only (no
photo field on profiles, no upload feature).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Replace `app/(app)/layout.tsx` with the new shell

**Files:**
- Modify: `app/(app)/layout.tsx`
- Modify: `app/(app)/layout.test.tsx`

**Interfaces:**
- Consumes: `AppSidebar`/`CurrentUserSummary` (Task 5), `SiteHeader` (Task 4), `SidebarProvider`/`SidebarInset` (`@/components/ui/sidebar`).
- Produces: nothing new for later tasks — this is where the shell actually becomes visible/reachable.

This task's only behavior change is the returned JSX; the auth-check logic (the two `redirect(...)` calls) must stay byte-for-byte the same, since `layout.test.tsx`'s two redirect tests assert on it directly via mocks of `next/navigation`, `@/lib/supabase/server`, and `@/lib/domain/profiles` — do not change what those tests mock or how `AppLayout` calls those modules.

- [ ] **Step 1: Read the current test file to confirm what must keep passing unchanged**

```bash
cat "app/(app)/layout.test.tsx"
```

Confirm its structure: mocks `next/navigation`'s `redirect` to throw `REDIRECT:<path>`, mocks `@/lib/supabase/server`'s `createSupabaseServerClient` to return `{ auth: { getUser: getUserMock } }`, mocks `@/lib/domain/profiles`'s `getProfileByAuthUserId`. Three tests: no user → `/login`; user but no profile → `/signup`; profile present → renders shell containing the profile's name and role.

- [ ] **Step 2: Update the third test's assertion**

The third test currently asserts `JSON.stringify(element)` contains `"Max Mustermann"` and `'"it"'` (the role, quoted since it's a JSON string value). Since `AppLayout`'s new JSX renders `AppSidebar user={{ name, role, email }}` rather than plain text, the name and role still appear in the serialized element tree as prop values passed to `AppSidebar` — the same two assertions (`toContain("Max Mustermann")`, `toContain('"it"')`) still hold with no change needed, because `JSON.stringify` on a React element tree serializes every descendant's props, including ones several component-boundaries deep that haven't rendered yet. Confirm this by running the test after Step 3's implementation (Step 4 below) rather than guessing — if it turns out the assertion needs a different string (e.g. because `role` is now nested inside a `user` object as `{"user":{"role":"it"}}` and `'"it"'` alone is ambiguous), tighten the assertion to `'"role":"it"'` instead. Either way, the test still proves the same thing: the real profile's role reaches the rendered tree.

No other test in this file needs edits.

- [ ] **Step 3: Implement the new layout**

Replace `app/(app)/layout.tsx`'s content with:

```tsx
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfileByAuthUserId } from "@/lib/domain/profiles";
import { QueryProvider } from "@/components/providers/query-provider";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

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
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar
        variant="inset"
        user={{ name: profile.fullName, email: user.email ?? "", role: profile.role }}
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
```

`user.email` is `string | undefined` on the Supabase `User` type — falling back to `""` matches how this plan's `CurrentUserSummary` requires a plain `string`, and an empty string is a safe, visible "nothing to show" rather than the literal text `"undefined"` a template string would otherwise produce.

- [ ] **Step 4: Run the layout tests**

```bash
npm run test:unit -- "app/(app)/layout.test.tsx"
```

Expected: all three tests pass. If the third test's assertion needs tightening per Step 2's note, do that now and re-run.

- [ ] **Step 5: Run the full unit suite**

```bash
npm run test:unit
```

Expected: all passing. Every other page under `app/(app)/` renders inside `{children}` unchanged, so none of their own tests should be affected — but confirm by reading the full suite's file count, not just the exit code (a silently-skipped file would still exit 0).

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/layout.tsx" "app/(app)/layout.test.tsx"
git commit -m "feat: replace the app shell's header with the sidebar

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: New `/settings` page and `ThemeToggle`

**Files:**
- Create: `app/(app)/settings/page.tsx`
- Create: `components/settings/theme-toggle.tsx`
- Test: `components/settings/theme-toggle.test.tsx`

**Interfaces:**
- Consumes: `useTheme` from `next-themes` (`{ theme, setTheme, resolvedTheme }` — verified against the installed package's type declarations, 2026-09-23).
- Produces: nothing later tasks depend on — this is a leaf page. `NavUser`'s Settings link (Task 5) already points at `/settings` by path, not by importing anything from this task.

Per spec §2 and this plan's Review Focus: `app/(app)/settings/page.tsx` independently replicates the same `createSupabaseServerClient()` → `getUser()` → `getProfileByAuthUserId()` → redirect pattern `app/(app)/layout.tsx` uses (not `getCurrentProfile()`, which discards the auth user's `email`) — this is deliberate duplication of ~6 lines to avoid changing `getCurrentProfile()`'s return type or `app/(app)/layout.tsx`'s already-tested redirect logic for a need only this one new page has.

- [ ] **Step 1: Write the failing test for `ThemeToggle`**

`next-themes`' own documented gotcha: `useTheme()`'s `theme` is `undefined` until the component has mounted client-side (the provider can't know the persisted preference during server rendering). A toggle that reads `theme` directly on first render risks a hydration mismatch. Test for the guarded, mounted-only render:

Create `components/settings/theme-toggle.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "@/components/settings/theme-toggle";

const setThemeMock = vi.fn();
let mockResolvedTheme = "light";
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: mockResolvedTheme, setTheme: setThemeMock }),
}));

describe("ThemeToggle", () => {
  it("renders a button once mounted", async () => {
    render(<ThemeToggle />);
    expect(await screen.findByRole("button")).toBeInTheDocument();
  });

  it("switches from light to dark when clicked", async () => {
    mockResolvedTheme = "light";
    render(<ThemeToggle />);
    const button = await screen.findByRole("button");
    await userEvent.click(button);
    expect(setThemeMock).toHaveBeenCalledWith("dark");
  });

  it("switches from dark to light when clicked", async () => {
    mockResolvedTheme = "dark";
    render(<ThemeToggle />);
    const button = await screen.findByRole("button");
    await userEvent.click(button);
    expect(setThemeMock).toHaveBeenCalledWith("light");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:unit -- components/settings/theme-toggle.test.tsx
```

Expected: FAIL — `components/settings/theme-toggle.tsx` doesn't exist yet.

- [ ] **Step 3: Implement `ThemeToggle`**

Create `components/settings/theme-toggle.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { MoonIcon, SunIcon } from "lucide-react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="outline" size="icon" disabled aria-label="Toggle theme">
        <SunIcon />
      </Button>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <MoonIcon /> : <SunIcon />}
    </Button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:unit -- components/settings/theme-toggle.test.tsx
```

Expected: PASS. The disabled pre-mount button still satisfies `getByRole("button")`, and `findByRole` waits past the `useEffect` mount tick — the test doesn't need to special-case the unmounted frame.

- [ ] **Step 5: Create the settings page**

Create `app/(app)/settings/page.tsx`:

```tsx
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
          <p>{user.email}</p>
        </div>
        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-sm font-medium">Theme</p>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
```

`/settings` is reached from the `NavUser` dropdown, not from `/dashboard` — but every other non-root page in this app points its `BackLink` at its logical parent per `CLAUDE.md` §UI, and settings has no natural single parent in the new nav structure (it's reachable from anywhere via the user menu). `/dashboard` is the closest fit, matching every other top-level section's convention of backing out to the app's root.

- [ ] **Step 6: Write a test for the settings page**

Following `app/(app)/layout.test.tsx`'s pattern for testing an async Server Component's redirect and render behavior:

Create `app/(app)/settings/page.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirectMock(path),
}));

const getUserMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}));

const getProfileByAuthUserIdMock = vi.fn();
vi.mock("@/lib/domain/profiles", () => ({
  getProfileByAuthUserId: (id: string) => getProfileByAuthUserIdMock(id),
}));

import SettingsPage from "@/app/(app)/settings/page";

beforeEach(() => {
  redirectMock.mockClear();
  getUserMock.mockReset();
  getProfileByAuthUserIdMock.mockReset();
});

describe("SettingsPage", () => {
  it("redirects to /login when there is no authenticated user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    await expect(SettingsPage()).rejects.toThrow("REDIRECT:/login");
  });

  it("redirects to /signup when the user has no profile yet", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "auth-1" } } });
    getProfileByAuthUserIdMock.mockResolvedValue(null);

    await expect(SettingsPage()).rejects.toThrow("REDIRECT:/signup");
  });

  it("renders the profile's name, role, and email", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "auth-1", email: "max@alpentech.example" } },
    });
    getProfileByAuthUserIdMock.mockResolvedValue({
      id: "profile-1",
      authUserId: "auth-1",
      companyId: "company-1",
      fullName: "Max Mustermann",
      role: "it",
      departmentId: null,
      managerId: null,
      positionTitle: null,
      employeeNumber: null,
      locationId: null,
      relatedOperationId: null,
      status: "active",
    });

    const element = await SettingsPage();
    const serialized = JSON.stringify(element);
    expect(serialized).toContain("Max Mustermann");
    expect(serialized).toContain('"it"');
    expect(serialized).toContain("max@alpentech.example");
  });
});
```

- [ ] **Step 7: Run test to verify it passes**

```bash
npm run test:unit -- "app/(app)/settings/page.test.tsx"
```

Expected: PASS. This test file didn't exist before this task, so there's no RED step to separately verify for the redirect assertions — but the render assertions did fail before Step 5 created the page at all (module wouldn't resolve), which is this task's real RED evidence; note that in the commit if asked, don't fabricate a separate red-run transcript for a file you're creating alongside its first-ever test.

- [ ] **Step 8: Run the full unit suite, lint, and type-check**

```bash
npm run test:unit
npm run lint
npx tsc --noEmit
```

Expected: all clean (same pre-existing lint findings as every prior task, nothing new).

- [ ] **Step 9: Commit**

```bash
git add "app/(app)/settings/page.tsx" "app/(app)/settings/page.test.tsx" \
        components/settings/theme-toggle.tsx components/settings/theme-toggle.test.tsx
git commit -m "feat: add /settings page with profile info and a theme toggle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Whole-branch verification and STATUS.md update

**Files:** `docs/STATUS.md` (modify), no other files.

- [ ] **Step 1: Full test suite**

```bash
npm run test:unit
npm run test:integration
```

Expected: all passing (`test:integration` needs `SUPABASE_SERVICE_ROLE_KEY` set in `.env.local` — same requirement as every other integration suite in this repo; this branch doesn't touch any integration-tested domain code, so this is a regression check, not new coverage).

- [ ] **Step 2: Lint and type-check**

```bash
npm run lint
npx tsc --noEmit
```

Expected: clean except the one pre-existing `react-hooks/refs` error in `lib/realtime/use-broadcast-listener.ts` (untouched by this branch).

- [ ] **Step 3: Production build**

```bash
npm run build
```

Expected: succeeds with no warnings — this is the check that caught the real `@container/main`/Suspense-adjacent issues in earlier phases, so it matters here too given how much of this branch is App Router layout structure.

- [ ] **Step 4: Manual smoke check**

If a browser or browser-automation tool is available in this environment, sign in as a seeded user and confirm: the sidebar renders with Home/Resources groups, clicking a nav item navigates and highlights it, the user menu shows real name/role/email, Settings opens and the theme toggle actually flips the page's appearance, Log out actually signs out. **If no such tool is available** (as in the Phase 7 and dashboard-interactivity branches before this one), say so explicitly rather than silently skipping this step, and note it as a required pre-merge action for whoever reviews this branch — this plan's Task 3/5/7 tests already cover the same logic paths a click-through would, but a purely visual defect (sidebar width on a real narrow viewport, collapse-icon tooltip positioning, dark-mode contrast) is exactly the class of bug those tests can't catch.

- [ ] **Step 5: Update `docs/STATUS.md`**

Move this branch's entry from wherever it's tracked (or add one if none exists yet) to **Review**, following the existing file's format (one-line description, spec/plan links, note on what the whole-branch review found once that's happened). Remove the "Sidebar shell — full shadcn dashboard example" line from the Backlog section, since this branch is that item. Leave it in **Review**, not **Finished**, until the branch actually merges, per the file's own header rule.
