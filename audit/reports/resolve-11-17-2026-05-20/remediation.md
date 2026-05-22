# Resolve 11-17 Remediation - 2026-05-20

## Fixed

- Mobile compliance ledger now persists disclosure and named-provider consent in encrypted MMKV storage instead of process memory.
- Mobile installed-model storage now reads/writes/removes SQLCipher rows instead of returning no-op values.
- Mobile storage index now exports the adopted storage repositories that exist in the worktree.
- Mobile model downloads now validate model id length, SHA-256 digest shape, positive safe file size, HTTPS URL, and duplicate active downloads before starting network/file work.
- Mobile `@noble/hashes` dependency is now declared explicitly instead of relying on a transitive dependency.
- Canonical Supabase migration contract for Stripe webhook idempotency is now covered by a web test.
- High-risk boundary ownership is documented in `docs/OWNERSHIP.md`.
- CLI `read_file` missing-file regression test now uses a unique temp path under the workspace instead of a fixed relative filename, removing order/collision sensitivity found during the full Rust test run.

## Verification

- `pnpm install` passed and updated the lockfile for the explicit mobile `@noble/hashes` dependency.
- `pnpm --filter @agiworkforce/mobile typecheck` passed.
- `pnpm --filter @agiworkforce/mobile test -- compliance-ledger.test.ts installed-models-storage.test.ts storage-encryption.test.ts` passed: 3 suites, 18 tests.
- `pnpm --filter web test -- __tests__/api/stripe-rpc-migrations.test.ts` passed: 1 suite, 1 test.
- `pnpm typecheck:all` passed across the TS workspaces.
- `pnpm lint` passed.
- `pnpm lint:extension` passed.
- `pnpm test` passed across the pnpm workspace. Existing jsdom/React console warnings were emitted, but the command exited 0.
- `pnpm build` passed.
- `pnpm audit --prod` passed: no known vulnerabilities.
- `cargo audit` passed with the repository audit ignore policy.
- `cargo clippy --workspace --lib -- -D warnings -D unsafe-code` passed after the CLI test hardening.
- `cargo test -p agiworkforce-cli features::exec::tools::tests --lib` passed: 41 tests.
- `cargo test --workspace --lib` passed on rerun after hardening the CLI missing-file test.
- `git diff --check` passed.
- `pnpm exec prettier --check <touched TS/MD/package files>` passed.
- `rustfmt --edition 2024 --config skip_children=true --check apps/cli/src/features/exec/tools/mod.rs` passed.
- `gh pr checks 376 --watch` passed for PR #376 at pushed commit `faac88ddc`.

## Verification Caveats

- `cargo fmt --all -- --check` was not made green in this pass. It reports formatting diffs in many Rust files outside the touched CLI test and appears to reflect pre-existing/parallel worktree churn; applying `cargo fmt --all` would rewrite broad unrelated surfaces.
- CI is green for the pushed branch/PR, but these local remediation edits are uncommitted and unpushed, so GitHub checks do not yet cover them.

## Still Backlogged

- CLI security modules are untracked and unwired; they need a CLI-owned integration pass.
- Legacy Supabase directory consolidation is not complete; this pass only pins Stripe RPC presence in canonical root migrations.
- Web Playwright E2E files are still absent.
- Large docs/research/example outputs remain untracked and need an archival decision.
- Full Rust formatting should be normalized in a dedicated formatting-only change once parallel edits settle.
