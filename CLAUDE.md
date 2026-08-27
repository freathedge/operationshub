# Operations Hub — Agent Working Conventions

This file is read automatically by Claude Code at the start of every session in this repo. It defines how agents (and humans) work with git here so behavior stays consistent across sessions and across subagents.

## Branching

- `main` is the protected, deployable branch. **Never commit directly to `main`.**
- All implementation work happens on its own branch, created via a git worktree (see `superpowers:using-git-worktrees`) — one branch per plan (e.g. `foundation-plan`, `phase2-tasks-plan`), never shared between plans.
- A branch only merges into `main` after its plan's full review cycle is clean (per `superpowers:subagent-driven-development`'s final whole-branch review) and `superpowers:finishing-a-development-branch` has run.

## Commit messages

- Conventional Commits style: `<type>: <imperative summary>`, lowercase after the colon, no trailing period.
  - `feat:` — new functionality
  - `fix:` — bug fix
  - `chore:` — tooling, config, scaffolding, dependency changes
  - `test:` — test-only changes
  - `docs:` — documentation-only changes
  - `refactor:` — code change that isn't a fix or a feature
- One logical change per commit. Every task in an implementation plan ends with its own commit(s) — don't batch multiple tasks into one commit.
- Add a body only when the *why* isn't obvious from the diff — a short paragraph, not a bullet-point restatement of the diff.
- Never use `git commit --amend`, `--no-verify`, or force-push on `main`.

## Where things live

- Product concept: `docs/idea.md`
- Architecture & tech stack spec: `docs/architecture.md`
- Implementation plans (one per build phase): `docs/superpowers/plans/`
- Full phase breakdown and build order: `docs/superpowers/plans/2026-08-26-remaining-phases-outline.md`
- **Project status board:** `docs/STATUS.md` — Backlog / In Progress / Review / Finished. **Keep it current as part of the work, not as an afterthought:** move a phase or piece of work to a new column the moment its state actually changes (starting it, opening a PR, merging it), not in a separate later pass.

## UI

- Build screens from shadcn/ui's pre-made blocks/templates wherever one exists for the job (e.g. the dashboard block(s) at [ui.shadcn.com/blocks](https://ui.shadcn.com/blocks)) instead of composing layouts from primitives from scratch. Pull the block in via the shadcn CLI, then adapt it to this project's data and routes.
- Fall back to composing shadcn/ui primitives directly only when no suitable block exists.
- **Back navigation:** every new page gets a `<BackLink href="...">` (`components/back-link.tsx`) pointing at its logical parent route (a detail page → its list, a creation form → its list), placed at the top of the page's content. Exceptions: the landing page (`/`) and the authenticated app's `/dashboard` are the "roots" of their areas and don't get one. Fixed destination, not `router.back()` — predictable regardless of how the page was reached (direct link, reload, bookmark). See `docs/architecture.md` §11.

## Workflow

This project follows the Superpowers skill workflow end to end: `brainstorming` → `writing-plans` → `subagent-driven-development` (or `executing-plans`) → `finishing-a-development-branch`. Each build phase gets its own spec-derived plan, its own worktree/branch, and merges to `main` only through that review gate.
