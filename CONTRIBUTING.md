# Contributing to AGI Workforce

Thanks for jumping in. Three things to know before you open a PR:

1. **CI on `main` should always be green.** If it isn't, that's the highest-priority bug — fix it before stacking more work on top.
2. **Read [BUILD.md](./BUILD.md) first** if you haven't already. The Rust toolchain, Node version, and pnpm version are all pinned and CI enforces them.
3. **The remediation plan at `~/.claude/plans/make-a-plan-to-purrfect-papert.md` (mirror in `AUDIT_REPORT.md` + `FIX_QUEUE.md`) is the source of truth** for prioritized work. If the work you're picking up touches a `FIX-XXX` item, mention the FIX number in the commit and PR.

## Branch + PR conventions

- Branch off `main`. Use `feat/`, `fix/`, `chore/`, `docs/` prefixes (`feat/cli-output-styles`, `fix/computer-use-gate`).
- Keep PRs focused. A single PR should land a single commit-worth of conceptually grouped work — large refactors get broken into a stack of small PRs that each leave the tree green.
- All commits go through GitHub PR review. **No direct pushes to `main`** except the rare emergency revert.
- The PR description should:
  - Explain the **why** (link to the FIX number, audit phase, or issue)
  - Include a "Test plan" section with the commands you ran locally
  - Note any **breaking changes** or **migration steps** users will see

## Commit message format

We use Conventional Commits with a 100-character subject limit (enforced by commitlint via `lint-staged`):

```
<type>(<scope>): <subject>

<body>

Co-Authored-By: <name> <email>
```

- **type**: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`, `style`
- **scope**: optional but recommended — the directory or surface area: `cli`, `desktop`, `web`, `security`, `deps`, `workspace`, `crates`
- **subject**: imperative present tense, lowercase, no trailing period

Examples:

```
fix(security): gate computer_use_* through tool_confirmation modal

feat(cli): output styles + 4 new slash commands

chore(crates): port codex-rs batch 7 — finalize rebrand + bazel + readmes
```

## Code review checklist

Before requesting review, run:

```bash
pnpm lint
pnpm typecheck:all
pnpm test
cargo check --workspace
cargo clippy --workspace --lib -- -D warnings -D unsafe-code
```

The reviewer will check:

- Does the change follow the existing patterns in the affected file? (Look at sibling functions / call sites first.)
- Are new IPC handlers registered in `apps/desktop/src-tauri/src/lib.rs::generate_handler!`? `apps/desktop/check-wiring.sh` will catch silent-dead commands once it's wired into CI (FIX-023).
- For security-sensitive paths (anything under `sys/security/`, `sys/commands/computer_use*`, `sys/commands/messaging*`, anything that touches credentials): is there a `tool_confirmation` gate or a `MasterPasswordEncryption` indirection? See FIX-001/002/003/004 in the audit for the rationale.
- For new dependencies: was the addition coordinated with `pnpm audit` / `cargo audit`? Both gates are blocking on `>= high` severity (FIX-043).

## Branch protection (administrative)

`main` should have:

- Required status checks: `ci` (lint + typecheck + test + build + audits + clippy + Rust test build), and (post-FIX-009) `windows-smoke`
- Require PR review (1 approval)
- Require linear history (no merge commits — squash-merge only)
- Disallow force pushes
- Require signed commits (post-Sprint 4)

These are configured in the GitHub repo settings, not in this repo.

## Getting unstuck

- Build issues → check the Troubleshooting section of [BUILD.md](./BUILD.md)
- Audit / FIX questions → cross-reference [AUDIT_REPORT.md](./AUDIT_REPORT.md) and [FIX_QUEUE.md](./FIX_QUEUE.md)
- Plan questions → `~/.claude/plans/make-a-plan-to-purrfect-papert.md` for sprint sequencing
- Anything else → open an issue tagged `question`
