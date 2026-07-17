# AGI CLI — Volume 08 — File System

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/cli/AGENTS.md`, and the real implementation this volume grounds in: `apps/cli/src/platform/runtime/tool_catalog.rs`, `apps/cli/src/features/exec/tools/{file_ops,dir_ops,common}/mod.rs`, `apps/cli/src/path_security.rs`, `apps/cli/src/agent/mod.rs`, `apps/cli/src/app_server.rs`, and `crates/agiworkforce-app-server`.

## Overview & stance

This volume specifies how AGI CLI reads, writes, edits, searches, and patches files on the developer's machine. On the CLI the file system is an **on-device** capability: every operation runs against the local disk inside the workspace, so file access itself never changes the trust boundary. What the trust mode governs is where file **content** travels once it enters the model context. Local (`local_only`) keeps prompt, chat, and file bytes on the device; BYOK sends selected context directly to the user's provider key (Desktop/CLI/VS Code only); Managed Cloud routes selected context through AGI-managed compute. The privacy guard in `apps/cli/src/agent/mod.rs` (`PrivacyMode`, `validate_privacy_boundary`, `consume_byok_handoff`) is ✅ Built and blocks a Local session from silently feeding file content to a non-local provider — a file read on a Local session cannot leak to BYOK/Cloud without the explicit fork (context selection, secret scan, payload preview, visible provider label, consent). All file operations are workspace/session-scoped and are never auto-synced to app chat.

Two invariants hold everywhere below: **path confinement** — every path is resolved through `crate::path_security::validate_workspace_path` (`apps/cli/src/path_security.rs`) so tools cannot escape workspace roots (extra roots require explicit `/add-dir`); and **approval-gated mutation** — writes/edits/patches pass `FilePermissionOperation` approval (`apps/cli/src/permissions`) unless the user has pre-authorized them.

## Read Files

✅ Built — `read_file` (`apps/cli/src/platform/runtime/tool_catalog.rs:269`; execution in `file_ops/mod.rs`). Reads a file's contents with optional 1-based inclusive `start_line`/`end_line` range; marked read-only with a 100 KB result cap. Reads are byte-limited via `read_text_file_limited` (`MAX_TEXT_READ_BYTES = 1_000_000`) and line-limited (`MAX_FILE_LINES = 2_000`, `common/mod.rs`) so a single read cannot flood context. The same tool is exposed over the app-server JSON-RPC/WS host (`apps/cli/src/app_server.rs:61`). Requirement: absolute paths, confined to workspace roots; oversized reads must truncate with a visible marker, never silently.

## Write Files

✅ Built — `write_file` (`tool_catalog.rs:282`; `file_ops/mod.rs`). Creates a new file or **overwrites an existing file's entire contents**. The tool description mandates reading a file before overwriting so existing content is not discarded, and prefers `edit_file` for targeted change. Overwrites of an existing file render a diff preview (`generate_simple_diff`) and are approval-gated. Requirement: overwrite of a non-empty file must show a preview and require consent; new-file creation is the low-risk path.

## Edit Files

✅ Built — `edit_file` (`tool_catalog.rs:342`) replaces one exact `old_string` (which must be unique in the file) with `new_string`. For multiple edits to one file, `multiedit` (`tool_catalog.rs:457`, deferred/on-demand) applies an array of `{old_string, new_string}` edits **atomically** to a single file. Edits are byte-capped (`MAX_EDIT_FILE_BYTES = 2_000_000`) and produce a diff preview before applying. Requirement: a non-unique or non-matching `old_string` must fail with an actionable error, not a silent no-op or partial write.

## Create Files

✅ Built — file creation is `write_file` against a new path (`file_ops/mod.rs`), and `apply_patch` can create files via a `/dev/null` → `b/<path>` hunk (`normalize_patch_target`, `file_ops/mod.rs`). Requirement: creation still resolves through `validate_workspace_path` and honors approval; parent directories are created as needed by the write path.

## Delete Files

🟡 Partial — there is no dedicated `delete_file` tool. Deletion is available two ways: through `run_command` (`rm`, shell-approval-gated) and through `apply_patch` with an `a/<path>` → `/dev/null` hunk (`file_ops/mod.rs`, `patch_target_paths`). Gap: a first-class, preview-and-confirm `delete_file` tool with trash/undo semantics is 🔭 Planned; today deletion inherits shell/patch approvals rather than a purpose-built confirmation.

## Rename Files

🟡 Partial — no dedicated `rename_file` tool. Renames go through `run_command` (`mv`) or a git rename patch header (`diff --git a/… b/…`) parsed by `patch_target_paths` in `apply_patch` (`file_ops/mod.rs`). Gap: a dedicated rename tool that updates references and shows a single reviewable rename op is 🔭 Planned.

## Move Files

🟡 Partial — same mechanics as rename: `run_command` (`mv`) or a patch that removes the old path and creates the new one. Both source and destination must be inside authorized workspace roots (`path_security.rs`). Gap: a first-class `move_file` tool is 🔭 Planned.

## Search Files

✅ Built — three complementary tools. `search_files` (`tool_catalog.rs:319`, `dir_ops/mod.rs`) runs a regex across a directory like `grep -rn`, returning `file:line` matches; `grep_files` (`tool_catalog.rs:396`) uses ripgrep with `include` glob filtering; `glob` (`tool_catalog.rs:447`, deferred) finds files by pattern (e.g. `**/*.rs`) and refuses absolute patterns / patterns escaping the project (`dir_ops/mod.rs`). `list_directory` (`tool_catalog.rs:332`) enumerates entries with type and size. All are read-only with result-size caps. Requirement: results must truncate with a save-to-file pointer (`truncate_output_with_save`) rather than dumping unbounded output.

## Diff Generation

✅ Built — `generate_simple_diff` (`apps/cli/src/features/exec/tools/common/mod.rs:197`) produces the line diffs shown before `write_file` overwrites and `edit_file`/`multiedit` changes are applied, so the user sees exactly what will change ahead of consent. Requirement: every mutating file tool must surface a diff/preview in the approval flow; a mutation with no visible preview is a defect.

## Patch Application

✅ Built — `apply_patch` (`tool_catalog.rs:415`, deferred; execution `file_ops/mod.rs`) applies a unified diff to the working directory. Target paths are extracted and validated up front (`patch_target_paths`, `patch_permission_paths`), each resolved through workspace confinement and approval, with a size digest (`sha256`) used when the target set can't be enumerated. Requirement: a patch touching a path outside authorized roots must be rejected wholesale; partial application on failure is not acceptable.

## Large Files

✅ Built — layered limits protect context and memory: reads cap at 1 MB of text (`MAX_TEXT_READ_BYTES`) and 2,000 lines (`MAX_FILE_LINES`); edits refuse files over 2 MB (`MAX_EDIT_FILE_BYTES`) with an actionable "split the file or use a narrower patch" error (`read_editable_text_file`); tool output is truncated per-line (`truncate_line`) and per-result with overflow saved to disk (`truncate_output_with_save`). Requirement: oversized inputs degrade with a clear message and a line-range/patch path forward — never a panic or a silent partial result.

## Repository map

- `apps/cli/src/platform/runtime/tool_catalog.rs` — file-tool definitions, aliases, size caps, read-only/mutating classification.
- `apps/cli/src/features/exec/tools/file_ops/mod.rs` — `read_file`, `write_file`, `edit_file`, `multiedit`, `apply_patch` execution + approvals.
- `apps/cli/src/features/exec/tools/dir_ops/mod.rs` — `search_files`, `grep_files`, `glob`, `list_directory`.
- `apps/cli/src/features/exec/tools/common/mod.rs` — diff generation, path validation, truncation, `MAX_FILE_LINES`.
- `apps/cli/src/path_security.rs` — workspace-root confinement and `/add-dir` registration.
- `apps/cli/src/agent/mod.rs` — `PrivacyMode` guard over what file content may leave the device.
- `apps/cli/src/app_server.rs`, `crates/agiworkforce-app-server` — file tools exposed over the JSON-RPC/WS tool host.

## Competitor notes

Claude Code and Codex CLI expose the same file-tool family (read/write/edit/multi-edit, glob/grep, unified-diff patch) with diff previews and approval prompts; ChatGPT surfaces file editing mainly through its cloud/agent runtime, not a local BYOK CLI. AGI's deliberate divergence: **per-surface trust** and **local-first**. The provider/model behind an edit is user-selectable (BYOK on this surface) and the Local privacy guard means a file read on a Local session physically cannot be routed to a cloud provider without the explicit, previewed BYOK/Managed fork — a guarantee the single-vendor CLIs do not offer. Model IDs come only from `packages/contracts/types/src/models.json`; file tooling never hardcodes one.

## Acceptance / Definition of Done

- [ ] **Build:** all file tools resolve paths through `validate_workspace_path`, honor size/line caps, and truncate (never panic) on oversized input; `cargo test -p agiworkforce-cli --lib` green.
- [ ] **Trust:** file **content** entering model context on a Local session cannot reach BYOK/Managed without the explicit fork; `validate_privacy_boundary` and the BYOK-handoff tests cover the boundary; no auto-sync of workspace files to app chat.
- [ ] **Security:** every mutating tool (`write_file`, `edit_file`, `multiedit`, `apply_patch`, and shell-mediated delete/rename/move) shows a diff/preview and is approval-gated; patches touching paths outside authorized roots are rejected before any write.

## Anti-patterns

- Silently routing Local-session file content to BYOK or Managed Cloud, or auto-syncing workspace files into app chat.
- Any mutating file operation without a diff preview and approval; partial/atomic-violating edits or patches.
- Escaping workspace roots (absolute globs, `..` traversal, un-`/add-dir`'d paths).
- Dumping unbounded file/search output instead of truncating with a save pointer; panicking on oversized files.
- Inventing model IDs, routes, env vars, or tool names; using `agiworkforce <cmd>` in examples instead of `agi`.
- Referencing removed tiers ("Plus", `pro_plus`, "Hobby"), credit top-ups, or Supabase.
- Claiming a dedicated delete/rename/move tool is shipped — those are 🟡 (via `run_command`/`apply_patch`) with dedicated tools 🔭 Planned.
