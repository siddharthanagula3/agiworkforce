# Troubleshooting

Status: Current
Owner: Repository maintainers
Last updated: 2026-09-17

Symptoms whose cause is not where the error points. Each entry names what to
check first, so the usual half hour of chasing the wrong layer is skipped.

This file does not restate the validation rules. Those are `AGENTS.md` section
12, including the four things it warns bite: guards read the working tree rather
than `HEAD`, the guard chain is `&&` and hides every failure after the first,
`apps/web`'s `tsc --noEmit` needs a raised heap, and a loaded machine fails tests
that pass alone.

## Install and dependencies

**`pnpm install --frozen-lockfile` fails right after a dependency merge.** A
merged dependency update changes a manifest without regenerating the lock, and a
frozen install is the first thing to notice. Regenerate the lock with the package
manager. Never hand-edit it; `AGENTS.md` section 12 and a local hook both refuse
that.

**A dependency bump lands and nothing changes.** Root `pnpm.overrides` wins over
a workspace's own range, so bumping a package that is overridden at the root is
cosmetic. Check the root `package.json` overrides block before believing a
version bump took effect.

**A lockfile-only install passes and the build then breaks.** Installing from the
lock alone resolves what the lock says, not what the manifests now ask for. When
a dependency change is suspected, install without the lock once and compare.

## Typecheck and build

**`pnpm check:protocol-types` is red and you did not touch the protocol.** The
generated TypeScript bindings come from `crates/agiworkforce-protocol` through
`pnpm generate:protocol-types`. A stale build output in a package the check reads
produces the same failure as a real drift. Rebuild the workspace's outputs before
investigating the exporter.

**`tsc -b` fails locally and CI is green.** A torn or partial `dist` from an
interrupted build. Delete the affected package's build output and rebuild.

**A shared package compiles for its own tests and fails inside `apps/web`.** The
web app compiles shared sources under its own TypeScript target, which is older
than the one the package's tests use. Syntax the package accepted can be rejected
there. Fix it in the package rather than loosening the web target.

## Running the app locally

**Every authenticated page redirects somewhere that never resolves.** A Clerk
development publishable key (`pk_test_`) forces a handshake redirect. Use a live
format key for anything automated, which is what CI fixtures do.

**Sign-in fails locally with no useful error.** `CLERK_AUTHORIZED_PARTIES` is
required; `apps/web/lib/validate-env.ts` lists it. Without it the session is
rejected as coming from an unrecognised party.

**An environment variable in `.env.local` has no effect.** A value already
exported in the shell wins: the loader does not override `process.env`. Check the
shell first (`env | grep AGI_`), then the file. `pnpm check:env-contract` checks
the example files, not your shell.

**Chat answers with a closed-lane error and the model is fine.** The key-value
provider is a hard dependency of the completion path. When the shared instance is
over quota or unreachable, every completion fails the same way. Point
`AGI_KV_PROVIDER` at `memory` for local work; the container drill does exactly
that.

**The dev server gets slower over an afternoon and then wedges.** Build caches
grow without bound under repeated edits. Deleting `apps/web/.next` and the Turbo
cache is safe while the server is stopped. A dependency reinstall under a running
dev server also wedges it; stop the server, install, restart.

## Database

**A migration says it has not been applied and you believe it has.** The applied
state is whatever the target database's migration table says, not what a
changelog claims. `pnpm db:migrate -- status` against that target is the only
answer that counts. Production apply needs `--confirm-production`.

**`pnpm db:rls-probe` fails on a table you just added.** A new table needs its row
level security policy and its erasure and export classification in the same
change. `pnpm check:rls-boundary` names which is missing.

## Tests

**A test suite dies with an out-of-memory error.** In a component suite this is
usually a render loop, not a large fixture: an effect whose dependency is
recreated every render. Look for the loop before raising the heap.

**A test passes alone and fails in the suite.** State leaking between cases, or a
process-wide operation that reaps something a sibling test owns. Run the file
alone, then with `--test-concurrency=1` equivalent for the runner in use, and
compare.

**A route's contract test lives somewhere other than the route.** Co-located
tests under a route's own `__tests__` are not necessarily its whole test surface;
a cross-cutting contract may be asserted from a central suite. Grep for the route
path across the repository before concluding a behaviour is untested.

## Mobile

**Every `className` stops applying after a dependency change.** A stale Metro
cache. Clear it and restart the bundler; nothing in the styling code needs
changing.

**The iOS project looks wrong after a dependency change.** The native projects are
generated and gitignored. Re-run prebuild rather than editing them; a hand edit
is discarded by the next one. `apps/mobile/README.md` has the commands.

## CI

**A job fails in about three seconds with no logs and an empty step list.** That
is the platform refusing to run the job, not the job failing. Check the account's
Actions billing state before reading the workflow.

**A green run tested less than it looks like.** Affected-scope selection can skip
a package entirely, and a superseded run leaves its commit range untested. When a
result matters, check what the `scope` job classified before trusting the colour.

**A guard passes locally and fails in CI.** Guards read the working tree. An
untracked or unstaged file can satisfy a guard locally that CI, which only has
what was committed, will fail. Stage first, then run, then commit.
