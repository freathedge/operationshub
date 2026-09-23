# Sidebar Shell — Design

Date: 2026-09-23
Source: `docs/STATUS.md` backlog item "Sidebar shell — full shadcn dashboard example"
Architecture: `docs/architecture.md`

---

## 1. Goal

Replace the authenticated app's simple header shell (`app/(app)/layout.tsx`) with the full shadcn `dashboard-01` block's sidebar-navigation shell (the same block Phase 7 partially pulled and pruned, and the block that `ui.shadcn.com/examples/dashboard` renders), adapted to this app's real routes and data. Applied app-wide — every page under `app/(app)/` (dashboard, tasks, requests, operations, employees, assets, workflows) shares the same shell, not just the dashboard page. This reopens Phase 7's deliberate decision to discard the block's sidebar/site-header (made when the dashboard alone didn't need one); the app as a whole now does.

This is architectural: it restructures `app/(app)/layout.tsx`, which every authenticated page depends on, and changes app-wide navigation. No page's own content changes.

## 2. Decisions taken during brainstorming

**Scope of the shell change is layout-only.** None of the 7 existing route pages (`tasks/page.tsx`, `requests/page.tsx`, etc.) change. They keep rendering their own `<h1>`, `BackLink`, and content exactly as today, inside the new shell's content slot.

**Navigation grouping — two groups plus a standalone root:**
- **Home** (a group, despite the name, per shadcn's own "Platform"/"Projects" grouping convention): Dashboard, Tasks, Requests, Operations, Workflows.
- **Resources**: Employees, Assets.

No role-based filtering of nav items — confirmed no page in `app/(app)/` has a page-level role redirect today (only per-record permission checks inside each page), so every authenticated role sees the same 7 links, matching current behavior.

**User menu (`NavUser`, bottom of sidebar) replaces the current header's profile display.** Shows the profile's `fullName`, `role`, and the Supabase auth user's `email` (not on the `Profile` type — `app/(app)/layout.tsx` already loads the Supabase `user` object via `getUser()`, which has `.email`; no domain-layer change needed). Avatar is initials-only (no photo field on `profiles`, no upload feature — out of scope). Menu items: **Settings** (link to `/settings`) and **Log out** (reuses the existing `components/auth/logout-button.tsx` logic, adapted into a menu item rather than a standalone button).

**New `/settings` page** (`app/(app)/settings/page.tsx`): read-only profile info (name, role, email — no edit form, that's a separate future feature) plus a light/dark theme toggle. No new domain function; the page loads the same profile+user data `app/(app)/layout.tsx` already loads.

**Secondary nav (above `NavUser`, per the block's own layout):**
- **Search** — UI shell only (the nav entry and, per the block's own component, a `⌘K`-style trigger), no working search yet. Wired to real results in Phase 8 (`docs/superpowers/plans/2026-08-26-remaining-phases-outline.md`'s Phase 8 already covers global search) — this phase only needs the entry to exist and open an empty/placeholder dialog, not to regress later. **This plan stops at the placeholder** — implementing search itself is explicitly Phase 8's job, not this plan's.
- **Get Help** — a static `mailto:` link (no destination page). Exact address is a placeholder (`support@alpentech.example`) until the project has a real one — implementer should search the codebase/`docs/idea.md` for an existing support-contact convention before hardcoding one; if none exists, use the placeholder and leave a comment.

**Dropped from the block, with reasons (YAGNI, no analog in this app):**
- Team switcher (`TeamSwitcher`) — one profile belongs to exactly one company; no multi-org switching concept anywhere in this app (`docs/architecture.md` §4 confirms `company_id` is fixed per profile).
- Documents menu (`NavDocuments`) — no document-management feature exists or is planned.

**No formal auth-provider abstraction.** `docs/architecture.md` §5's "Auth via Clerk" note is still an undecided idea, not a plan. Building an interface/adapter layer now would be premature. Instead, `NavUser` and the `/settings` page's profile section take a plain, provider-agnostic prop shape:
```ts
interface CurrentUserSummary {
  name: string;
  email: string;
  role: string;
}
```
never a Supabase `User` or the domain `Profile` type directly. A future Clerk migration only changes what `app/(app)/layout.tsx`/`app/(app)/settings/page.tsx` pass in, not `NavUser` or the settings page's rendering. This is the same prop-shape decoupling already used throughout the dashboard components (Phase 7) — not a new pattern.

**Dark mode wiring.** `app/globals.css` already defines `.dark` overrides and `@custom-variant dark (&:is(.dark *))` (from the base-nova shadcn style) — the CSS half of theming already exists, just unused. `next-themes` (installed since Phase 7, unused until now) gets wired as a `ThemeProvider` in the **root** layout (`app/layout.tsx`), not `app/(app)/layout.tsx`, so it covers marketing/auth pages too at no extra cost, following next-themes' documented pattern: `attribute="class"`, and `suppressHydrationWarning` added to the root `<html>` element (next-themes sets the class client-side before hydration; without this the root layout would show a hydration-mismatch warning on every load, not just a cosmetic one — first paint's theme class disagrees with the server-rendered markup until this suppresses that specific, expected mismatch).

## 3. File structure

| File | Change |
|---|---|
| `app/layout.tsx` | Modify — wrap children in `next-themes`' `ThemeProvider`, add `suppressHydrationWarning` to `<html>`. |
| `app/(app)/layout.tsx` | Modify — stays a Server Component (auth/profile loading, redirect logic unchanged); renders `SidebarProvider` → `AppSidebar` (client, gets profile + email) + `SidebarInset` → `SiteHeader` + `{children}`. |
| `components/ui/sidebar.tsx` | Re-add (deleted in Phase 7 Task 1) — pull via `npx shadcn add dashboard-01`, same as Phase 7's Task 1 did. |
| `hooks/use-mobile.ts` | Re-add (deleted in Phase 7 Task 1), same source. |
| `components/app-sidebar.tsx` | Re-add and adapt — real nav data (Home/Resources groups), no team switcher. |
| `components/nav-main.tsx` | Re-add and adapt — renders the Home group's 5 items. |
| `components/nav-secondary.tsx` | Re-add and adapt — Search (placeholder) + Get Help (mailto link) only. |
| `components/nav-user.tsx` | Re-add and adapt — takes `CurrentUserSummary`, renders Settings + Log out. |
| `components/site-header.tsx` | Re-add and simplify — just the mobile/collapse `SidebarTrigger`, no page title (pages already render their own `<h1>`), no "Quick Create" button. |
| `components/nav-documents.tsx`, `components/team-switcher.tsx` | Not re-added — dropped per §2. |
| `app/(app)/settings/page.tsx` | New — Server Component, loads profile+user like every other page in `app/(app)/`, renders profile info + a `ThemeToggle` client component. |
| `components/settings/theme-toggle.tsx` | New — client component, `next-themes`' `useTheme()`, a simple light/dark switch (shadcn's own dark-mode-toggle pattern: a button or a two-state control, no need for a "system" third option unless trivial to include). |
| `app/(app)/layout.test.tsx` | Modify — redirect-to-`/login`/`/signup` tests unchanged; the "renders shell with profile" test updates its assertion to match wherever the new shell actually renders the name/role (inside `NavUser`). |
| Every other page under `app/(app)/` | **Unchanged.** |

Not re-added from the block: `components/chart-area-interactive.tsx`, `components/data-table.tsx` (already correctly dropped in Phase 7, still not needed).

## 4. Nav content (exact)

**Home group**, in order:
| Label | Route | Icon (lucide-react, verify exact export name exists before using) |
|---|---|---|
| Dashboard | `/dashboard` | `LayoutDashboardIcon` |
| Tasks | `/tasks` | `ListTodoIcon` |
| Requests | `/requests` | `InboxIcon` |
| Operations | `/operations` | `FolderKanbanIcon` |
| Workflows | `/workflows`¹ | `WorkflowIcon` |

¹ `/workflows` has no list page today (only `/workflows/[id]` detail) — whether this nav entry links there as-is, to a "coming soon" state, or is disabled is an implementation-time call, see §6. The icon and label aren't in question, only what clicking it does.

**Resources group:**
| Label | Route | Icon |
|---|---|---|
| Employees | `/employees` | `UsersIcon` |
| Assets | `/assets` | `PackageIcon` |

**Secondary nav:**
| Label | Behavior |
|---|---|
| Search | Opens a placeholder dialog/command palette shell (or, if that's meaningfully more work than a static disabled-looking entry, a simple non-functional nav item — implementer's call, see §6) — no real search logic. |
| Get Help | `mailto:` link, placeholder address per §2. |

**User menu**, in order: profile summary (name/role/email) → Settings → Log out.

## 5. Testing approach

Following this repo's existing conventions (vitest + `@testing-library/react`, mocking `next/navigation`/`@/lib/supabase/server`/`@/lib/domain/profiles` the same way `app/(app)/layout.test.tsx` already does):

- `app/(app)/layout.test.tsx`: keep the two redirect tests unchanged (still the binding contract — unauthenticated → `/login`, no profile → `/signup`). Update the third test's assertion to find the profile's name/role wherever `NavUser` actually renders them (still checking the same underlying data flows through, not the exact old header markup).
- `components/nav-main.tsx` / `components/nav-user.tsx` / `components/nav-secondary.tsx`: component tests asserting the right links/labels render (matching the plain, presentational-component testing style already used for `components/dashboard/*`).
- `app/(app)/settings/page.tsx`: a component test (or a server-component-return-value test matching `layout.test.tsx`'s own style, since this is also an async Server Component) asserting profile info renders and the theme toggle is present.
- `components/settings/theme-toggle.tsx`: a component test asserting it calls `next-themes`' `setTheme` on interaction (mock `next-themes`, matching how `@/lib/supabase/browser` is already mocked elsewhere).

No integration tests needed — nothing here touches Supabase queries beyond what `app/(app)/layout.tsx` already does today.

## 6. Open implementation-time calls (left to the plan/implementer, not re-litigated here)

- **Workflows has no list page** (only `/workflows/[id]` detail — same gap already logged in `docs/STATUS.md`'s "`/approvals` and `/workflows` list pages" backlog item from the dashboard-interactivity work). The nav item exists per §4 (the block's own nav always lists top-level sections), but its link target needs a decision: link to `/dashboard` with a "coming soon" affordance, disable/gray it out, or accept it 404s until that backlog item lands. Implementer picks the least-surprising option **and links back to the STATUS.md backlog entry** rather than silently deciding; this spec does not mandate one, since none is clearly better without seeing it rendered.
- **Search's exact placeholder fidelity** (full command-palette shell vs. a simpler static entry) — whichever costs meaningfully less without producing a visibly broken UI element; not worth a spec-level decision.
- **Exact lucide-react icon export names** — verify each exists in the installed version before use; substitute a close equivalent if a named icon doesn't exist (lucide-react's icon set changes between versions).

## 7. Out of scope

- Implementing real global search (Phase 8's job).
- A working `/approvals` or `/workflows` list page (separate backlog item).
- Profile editing (settings page is read-only).
- Avatar photo upload.
- A formal auth-provider abstraction layer (Clerk migration is still undecided).
- Any change to the 7 existing route pages' own content, permissions, or data.
