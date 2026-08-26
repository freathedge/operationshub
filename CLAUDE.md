# Operations Hub — Agent Working Conventions

This file is read automatically by Claude Code at the start of every session in this repo. It defines how agents (and humans) work with git here so behavior stays consistent across sessions and across subagents.

## Branching

- `production` is the protected, deployable branch. **Never commit directly to `production`.**
- All implementation work happens on its own branch, created via a git worktree (see `superpowers:using-git-worktrees`) — one branch per plan (e.g. `foundation-plan`, `phase2-tasks-plan`), never shared between plans.
- A branch only merges into `production` after its plan's full review cycle is clean (per `superpowers:subagent-driven-development`'s final whole-branch review) and `superpowers:finishing-a-development-branch` has run.

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
- Never use `git commit --amend`, `--no-verify`, or force-push on `production`.

## Where things live

- Product concept: `docs/idea.md`
- Architecture & tech stack spec: `docs/architecture.md`
- Implementation plans (one per build phase): `docs/superpowers/plans/`
- Full phase breakdown and build order: `docs/superpowers/plans/2026-08-26-remaining-phases-outline.md`

## Workflow

This project follows the Superpowers skill workflow end to end: `brainstorming` → `writing-plans` → `subagent-driven-development` (or `executing-plans`) → `finishing-a-development-branch`. Each build phase gets its own spec-derived plan, its own worktree/branch, and merges to `production` only through that review gate.
