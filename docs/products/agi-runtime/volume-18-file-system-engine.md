# AGI Runtime — Volume 18 — File System Engine

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`; `apps/cli/AGENTS.md` (nearest surface owner of the FS tool
catalog); `docs/current/source-of-truth.md`; `docs/products/README.md` (binding canon).
Grounded in real repo paths: `crates/agiworkforce-apply-patch/src/{lib.rs,parser.rs}`,
`packages/tools/apply-patch/src/`, `apps/cli/src/apply_patch.rs`, `apps/cli/src/file_state.rs`,
`apps/cli/src/features/exec/tools/file_ops/mod.rs`,
`apps/cli/src/features/exec/tools/dir_ops/mod.rs`,
`apps/cli/src/features/exec/tools/common/mod.rs`,
`apps/cli/src/platform/runtime/tool_catalog.rs`,
`crates/agiworkforce-app-server/src/lib.rs`,
`crates/agiworkforce-protocol/src/{tool_name.rs,permissions.rs,approvals.rs}`,
`apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`,
`services/signaling-server/src/index.ts`.

## Overview & stance

The File System Engine is the AGI Runtime's local capability for reading, writing,
editing, patching, searching, and diffing files on a host workspace. It is an internal
layer, not a user surface. Every operation runs inside the **Local** trust boundary —
compute and bytes stay on the host — and reaches the model only through the runtime's
tool host (`crates/agiworkforce-app-server/src/lib.rs`, JSON-RPC over stdio + WebSocket,
consumed only by the CLI today). BYOK does not change these mechanics: a Local→BYOK fork
must run a secret scan and payload preview over selected file content before any bytes
leave the host with a visible provider label and consent. Managed Cloud never receives
raw workspace files — only Managed-Cloud chat rows sync via Neon delta-sync
(`apps/web/app/api/{chat,memory,projects}/sync`); file contents never sync.

Surface exposure follows the trust matrix. The engine is realized on the dev surfaces
(**CLI** today; **Desktop / VS Code** share the same crates by design). **Web and
Mobile have no raw workspace FS access** — Mobile is on-device LLM + Cloud, Web is
Cloud-only. Under **Remote Control** a phone/web window may request an FS operation, but
the session runs locally and every mutation is approval-gated through the signaling
relay's `approval_request`/`approval_response` verbs
(`services/signaling-server/src/index.ts`) — the window never touches the disk directly.

## Read Operations

Requirement: read a file (optionally a line range) with byte/line caps, deterministic
truncation, and read-state tracking so subsequent writes can detect staleness.

**✅ Built (CLI).** `execute_read_file` in
`apps/cli/src/features/exec/tools/file_ops/mod.rs` enforces `MAX_TEXT_READ_BYTES`
(1,000,000), supports `start_line` ranged reads, truncates oversized output via
`truncate_output_with_save`, and calls `crate::file_state::record_file_read` to snapshot
content + mtime. The `read_file` (plus `read_many_files`) tool is registered read-only
in `apps/cli/src/platform/runtime/tool_catalog.rs`. Cross-surface extraction into a
shared `packages/client/client-runtime` FS module for Desktop/VS Code reuse is **🔭 Planned**.

## Write Operations

Requirement: create or fully overwrite a file only after the caller has read the current
version; refuse stale or unread overwrites; require approval; preview the change.

**✅ Built (CLI).** `execute_write_file` (same file) enforces `MAX_EDIT_FILE_BYTES`
(2,000,000), gates on `crate::file_state::ensure_previously_read_and_fresh` (returns the
"File has not been read yet" / "File has been modified since read" messages from
`apps/cli/src/file_state.rs`), routes through `request_approval` /
`ApprovalRequest` (`crate::tui::approval_broker`) with persistable
per-path decisions (`crate::permissions::PermissionStore`), shows a `generate_simple_diff`
preview, and records the new content with `record_file_write`. Path containment is
validated by `validate_file_path`. Approval semantics ride the protocol approval types in
`crates/agiworkforce-protocol/src/{approvals.rs,permissions.rs}`.

## Edit Operations — apply edits

Requirement: targeted, exact-match string replacement and batched multi-edit that either
applies every hunk or fails as a unit, with the same read-before-write and approval gates
as Write.

**✅ Built (CLI).** `execute_edit_file` performs a unique exact-match `old_string →
new_string` replacement; `execute_multiedit` applies an ordered list of
`MultiEditOp { old_string, new_string, replace_all }` sequentially against one buffer and
commits once via `record_file_write`. Both call `ensure_previously_read_and_fresh` before
mutating and render a diff preview. Notebook-cell edits are handled separately by
`apps/cli/src/notebook_edit.rs`. Tool names normalize through
`crates/agiworkforce-protocol/src/tool_name.rs` and the aliases in `tool_catalog.rs`
(`edit_file`, `multiedit`).

## Patch Engine — apply patches safely

Requirement: parse and apply add/update/delete/move hunks with hard workspace
containment; reject absolute paths and `..` traversal; never write outside the root.

**✅ Built.** `crates/agiworkforce-apply-patch/src/lib.rs` (`parse_patch`,
`apply_patch`, `parse_and_apply`, `PatchApplyOutcome { added, modified, deleted }`) and
`parser.rs` (`Hunk`, `UpdateFileChunk`). The `resolve()` helper (AUDIT-FIX C-4) refuses
absolute, `ParentDir`, `RootDir`, and `Prefix` components, canonicalizes the candidate,
and asserts `starts_with(canonical_root)` — including for not-yet-existing paths via the
nearest existing ancestor. A parallel TypeScript engine, `@agiworkforce/apply-patch`
(`packages/tools/apply-patch/src/{apply-update.ts,parse.ts,node-fs-bridge.ts}`), carries a
`workspaceOnly` flag with `__tests__/path-traversal.test.ts` coverage. The CLI's
`git apply` bridge (`apps/cli/src/apply_patch.rs` `validate_patch_targets`) **fails
closed** — workspace-only, no `--unsafe-paths` opt-out. Known gap: on first hunk failure
already-applied changes are **not** rolled back (documented in `lib.rs`); transactional
all-or-nothing patch application is **🔭 Planned**.

## Search Engine — search filesystem

Requirement: regex content search and glob path search across a workspace, respecting
ignore rules, with bounded output.

**✅ Built (CLI).** `apps/cli/src/features/exec/tools/dir_ops/mod.rs` provides
`execute_grep_files` and `execute_search_files` (ripgrep `rg` primary backend with a
`grep` fallback), `execute_glob` for path patterns, and `execute_list_directory`. These
are registered read-only with output size caps in `tool_catalog.rs` (e.g. `search_files`
capped at 50,000 bytes). A shared cross-surface search index / persistent symbol index is
**🔭 Planned** — today search is per-invocation subprocess-backed.

## Diff Engine — generate diffs

Requirement: generate a human-reviewable diff for every mutation preview and for
approval prompts, ideally unified/word-level and reusable across surfaces.

**🟡 Partial.** `generate_simple_diff` in
`apps/cli/src/features/exec/tools/common/mod.rs` produces a line-oriented diff used by
Write/Edit previews and approval output — real and shipping, but intentionally simple.
Rich unified-diff and word-level rendering, plus a **shared diff-overlay component reused
across CLI, Desktop, and VS Code**, is **🔭 Planned** (the CLI live diff-overlay is a
tracked core-render refactor). No diff artifact is ever auto-synced to Cloud.

## Repository map

- `crates/agiworkforce-apply-patch/src/{lib.rs,parser.rs}` — Rust patch parse/apply + containment.
- `packages/tools/apply-patch/src/{apply-update.ts,parse.ts,node-fs-bridge.ts,types.ts}` — TS `@agiworkforce/apply-patch`.
- `apps/cli/src/apply_patch.rs` — fail-closed `git apply` target validator.
- `apps/cli/src/file_state.rs` — read-before-write / staleness cache.
- `apps/cli/src/features/exec/tools/file_ops/mod.rs` — read/write/edit/multiedit handlers.
- `apps/cli/src/features/exec/tools/dir_ops/mod.rs` — grep/search/glob/list handlers.
- `apps/cli/src/features/exec/tools/common/mod.rs` — `generate_simple_diff`, `validate_file_path`.
- `apps/cli/src/notebook_edit.rs` — notebook-cell edits.
- `apps/cli/src/platform/runtime/tool_catalog.rs` — tool definitions, aliases, size caps.
- `crates/agiworkforce-app-server/src/lib.rs` — local stdio+WS tool host (CLI-only).
- `crates/agiworkforce-protocol/src/{tool_name.rs,permissions.rs,approvals.rs}` — tool/approval protocol.
- `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs` — desktop 127.0.0.1 host.
- `services/signaling-server/src/index.ts` — approval-gated remote-control relay.

## Competitor notes

Claude Code, ChatGPT/Codex, and Codex CLI expose comparable read/write/edit/apply-patch
and grep/glob tools against a single-provider backend. AGI diverges deliberately:
FS tools are **provider-agnostic** and run under a **per-surface trust matrix** — the
same engine backs Local and (on Desktop/CLI/VS Code) BYOK, never Web or Mobile. Every
mutation is **local-first** and **approval-gated**; a Local→BYOK handoff is an explicit,
secret-scanned, previewed fork, never an automatic route to the cloud. Under Remote
Control the phone is a window over a host session, matching Claude Code Remote Control /
Codex "nothing moves to the cloud," rather than shipping the workspace to a hosted VM.

## Acceptance / Definition of Done

Production-ready when all FS mutations are containment-checked, read-before-write gated,
approval-gated, diff-previewed, and provably unable to write outside the workspace or
route file bytes to BYOK/Cloud without an explicit consented fork.

- [ ] **Build:** `read_file`, `write_file`, `edit_file`, `multiedit`, `apply_patch`,
      `grep_files`/`search_files`, `glob`, `list_directory` pass unit + scenario tests
      (`crates/agiworkforce-apply-patch/tests/scenarios.rs`,
      `packages/tools/apply-patch/src/__tests__/`, `apps/cli/src/file_state.rs` tests).
- [ ] **Trust:** no FS operation crosses Local→BYOK without secret scan, payload preview,
      provider label, and consent; no file bytes enter Neon delta-sync.
- [ ] **Security:** patch/edit/write paths reject absolute + `..` traversal and stay
      pinned under the canonical workspace root; remote-requested mutations are
      approval-gated via the signaling relay.

## Anti-patterns

- Silently routing Local file content to BYOK or Managed Cloud, or syncing workspace
  files through the chat delta-sync APIs.
- Adding an `--unsafe-paths` / `workspaceOnly: false` escape hatch to the patch validators.
- Skipping `ensure_previously_read_and_fresh` before a write/edit, or applying a
  multi-edit partially and reporting success.
- Treating a Remote Control window as a fourth trust mode or letting it write to disk
  without host approval.
- Hardcoding or inventing model IDs (read only from `packages/contracts/types/src/models.json`),
  referencing removed tiers (`Plus`/`pro_plus`/`Hobby`) or credit top-ups, or naming
  Supabase — the stack is Clerk + Neon + Stripe.
- Claiming shipped state without a repo path, or inventing a monolithic runtime daemon.
