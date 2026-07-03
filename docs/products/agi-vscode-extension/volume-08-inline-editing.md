# AGI VS Code Extension — Volume 08 — Inline Editing

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/extension-vscode/AGENTS.md`, `docs/surfaces/vscode-extension.md`, and grounded in `apps/extension-vscode/package.json`, `apps/extension-vscode/src/providers/diffDecorationProvider.ts`, `apps/extension-vscode/src/integrations/patchEngine.ts`, `apps/extension-vscode/src/data/checkpointManager.ts`, `apps/extension-vscode/src/core/runInlineCommand.ts`, `apps/extension-vscode/src/platform/applyEdit.ts`, `apps/extension-vscode/src/core/commandSetup.ts`, `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts`.

## Overview & stance

Inline editing is where AGI writes into the user's open buffers. On VS Code — an IDE surface exposing all three trust modes (Local, BYOK, Managed Cloud) with explicit selection and a visible provider label — the bar is that no model output ever touches disk without a reviewable diff and an explicit human accept, unless the user has deliberately opted into auto-apply in a trusted workspace. The extension is workspace-scoped: edits stay in the workspace, and there is **no automatic app-chat sync** — any handoff to app chat is explicit and redacted. The trust boundary shapes two concrete rules here. First, `autoApplyFixes` is force-disabled in untrusted workspaces so a cloned repo's `.vscode/settings.json` cannot silently apply LLM code (`src/core/runInlineCommand.ts` reads the raw flag and gates on `vscode.workspace.isTrusted`). Second, sensitive files are guarded at apply time (`isSensitiveFile` in `src/integrations/patchEngine.ts`). The parity reference is Claude Code and Codex IDE inline diff review: propose, review side-by-side, accept/reject at fine granularity, undo cleanly. AGI's divergence is multi-provider and per-trust: the same review UI serves a Local (Ollama/LM Studio), BYOK, or Managed-Cloud model, always with the active provider labeled.

## Inline Chat

An editor-embedded inline prompt (Copilot `Ctrl+I` / Claude Code inline style) that lets a user invoke AGI on a selection or cursor position and receive an edit rendered in place.

- 🟡 Partial — Command-driven inline editing is built: `src/core/runInlineCommand.ts` handles `explain`, `fix`, `refactor`, `tests`, `docs` over the selection, and `src/platform/applyEdit.ts` offers **Apply Inline | View in New Tab | Cancel**. Invocation is via the `@agi` chat participant, the `editor/context` menu, and keybindings (`package.json`). What is **not** built: a native editor-anchored inline-chat input widget (VS Code `CommentController`/inline-chat surface) — there is no `CommentController` in `src/`. Treat the in-editor prompt box as 🔭 Planned; the command + participant path is the shipped substitute.
- Requirement: inline chat must show the resolved trust mode and provider/model label before sending, and must respect `agiWorkforce.agent.mode` (`ask`/`auto`/`plan`/`bypass`, `package.json`) so `ask`/`plan` never edit without confirmation.

## Inline Diffs

When AGI proposes an edit, changes render as an inline diff inside the target editor rather than replacing text blindly.

- ✅ Built — `src/providers/diffDecorationProvider.ts` maintains `DiffSession`s and renders line-level gutter decorations (`+`/`-`), a summary header (`Changes: +X lines, -Y lines`), and a per-diff **confidence** badge (`high`/`medium`/`low`) sourced from the patch engine. A `DiffCodeLensProvider` places Accept / Reject / Accept-All / Reject-All / Accept-Batch / Reject-Batch CodeLenses above each hunk.
- Requirement: every applied hunk originates from the search-and-replace patch contract (`src/integrations/patchEngine.ts`: `<<<<<<< SEARCH / ======= / >>>>>>> REPLACE` envelopes, exact then fuzzy match, bottom-to-top application). Multi-file patch batches carry a `batchId` so a single model response spanning files is reviewed as one unit.

## Preview Changes

Before committing an edit, the user can see original-vs-proposed content side by side.

- 🟡 Partial — Live preview is the inline decoration set above. A native side-by-side preview exists via `showOriginalContext` (`src/integrations/patchEngine.ts`, invoking `vscode.diff`), surfaced as `agi-workforce.showOriginalContext` ("Patch Expected vs Actual") in `src/core/commandSetup.ts`. Gap: this is an on-demand comparison for a resolved patch, not a mandatory pre-write preview gate for every edit; a first-class "preview then apply" modal covering agent-mode batches is 🔭.
- Requirement: for Managed-Cloud/BYOK edits, preview must render before any disk write when `agent.mode` is `ask` or `plan`, and must never leak Local context into a BYOK/Cloud request without the explicit fork (context selection, secret scan, payload preview, consent).

## Accept

Accepting writes the proposed hunk(s) into the buffer.

- ✅ Built — `diffDecorationProvider.acceptDiff` / `acceptAll` / `acceptBatch` / `acceptCurrentDiff` / `acceptAllGlobal`, wired in `src/core/commandSetup.ts` to `agi-workforce.acceptDiff`, `acceptAllDiffs`, `acceptBatch`, `acceptCurrentDiff`, `acceptAllDiffsGlobal`. Keybindings (`package.json`): `cmd/ctrl+shift+enter` (accept), `cmd/ctrl+shift+a` (accept current, guarded by `agi-workforce.hasDiff`), `cmd/ctrl+shift+alt+y` (accept all files).
- Requirement: accept must be reversible — a git-stash **checkpoint** is created around AI changes (`src/data/checkpointManager.ts`, `agi-workforce.createCheckpoint` / `restoreCheckpoint`, max 20, graceful no-op outside a git repo) so `Restore Checkpoint`/`Rewind Last` recovers prior state.

## Reject

Rejecting discards the proposal and restores the buffer without writing.

- ✅ Built — `diffDecorationProvider.rejectDiff` / `rejectAll` / `rejectBatch` / `rejectCurrentDiff` / `rejectAllGlobal`, wired to `agi-workforce.rejectDiff`, `rejectAllDiffs`, `rejectBatch`, `rejectCurrentDiff`, `rejectAllDiffsGlobal`. Keybindings: `escape` (reject) and `cmd/ctrl+shift+r` (reject current) under `agi-workforce.hasDiff`; `cmd/ctrl+shift+alt+u` rejects across all files.
- Requirement: reject must remove decorations and leave the document byte-identical to pre-proposal state; rejecting a batch must discard every unaccepted hunk in that `batchId`.

## Partial Accept

Accepting some proposed changes while rejecting others in the same response.

- 🟡 Partial — Granularity exists at the **hunk**, **file**, and **batch** levels: `acceptCurrentDiff` accepts the `DiffSession` nearest the cursor while leaving siblings pending; `acceptAll(uri)` scopes to one file; `acceptBatch(batchId)` to one multi-file response (`src/providers/diffDecorationProvider.ts`). Gap: **sub-hunk / per-line** partial accept within a single diff region is not implemented — a user cannot cherry-pick individual added lines inside one hunk. That line-level selection is 🔭 Planned.
- Requirement: partial accept must keep unaccepted hunks live and reviewable, and must not renumber or corrupt pending hunks (patch application is bottom-to-top for exactly this reason).

## Repository map

- `apps/extension-vscode/src/providers/diffDecorationProvider.ts` — inline diff sessions, decorations, CodeLens, accept/reject/partial logic.
- `apps/extension-vscode/src/integrations/patchEngine.ts` — patch parse/apply, confidence scoring, `showOriginalContext` preview, sensitive-file guard, patch log channel.
- `apps/extension-vscode/src/data/checkpointManager.ts` — git-stash checkpoints (create/restore/list, prune to 20).
- `apps/extension-vscode/src/core/runInlineCommand.ts` — inline commands + trust-gated auto-apply.
- `apps/extension-vscode/src/platform/applyEdit.ts` — apply-inline vs new-tab flow, code-block extraction.
- `apps/extension-vscode/src/core/commandSetup.ts` — command registration for all diff/checkpoint/patch actions.
- `apps/extension-vscode/package.json` — commands, keybindings, `agent.mode`, `autoApplyFixes`, untrusted-workspace restrictions.

## Competitor notes

Claude Code's VS Code extension and Codex IDE extension both center inline diff review: inline hunk decorations, side-by-side preview, keyboard accept/reject, and clean undo, with cloud handoff and local application of remote diffs. GitHub Copilot adds an editor-anchored inline chat widget (`Ctrl+I`). AGI matches inline diffs, accept/reject, and checkpoint-based undo today; it deliberately diverges by (1) driving every edit through the same review UI regardless of trust mode, with a **visible provider/model label**; (2) supporting Local models (Ollama/LM Studio) for inline edits with **no data leaving the device**; (3) refusing silent auto-apply in untrusted workspaces. The editor-anchored inline-chat widget and line-level partial accept are the two visible parity gaps (both 🔭).

## Acceptance / Definition of Done

Inline editing is production-ready when a proposed edit is always reviewable, accept/reject is fully reversible via checkpoints, and no edit crosses a trust boundary without consent and a visible provider label.

Build:

- [ ] Accept/reject at hunk, file, and batch granularity work via CodeLens and keybindings; rejected hunks leave the buffer byte-identical.
- [ ] Checkpoint created before AI edits; `Restore Checkpoint` recovers prior state (or clean no-op outside git).

Trust:

- [ ] `autoApplyFixes` verified force-off in untrusted workspaces; provider/model label shown before every apply.
- [ ] Local edits never routed to BYOK/Cloud without the explicit fork (context selection, secret scan, payload preview, consent).

Security:

- [ ] `isSensitiveFile` blocks patches to secrets/keys; patch application stays bottom-to-top; no auto-apply path bypasses the diff on Cloud/BYOK.

## Anti-patterns

- Writing model output to disk without an inline diff and explicit accept (outside opted-in trusted auto-apply).
- Enabling auto-apply in an untrusted workspace, or honoring workspace-overridden endpoint/gateway/system-prompt settings there.
- Silently routing a Local inline edit to BYOK or Managed Cloud, or omitting the provider label.
- Auto-syncing inline edits or diffs to app chat — handoff must be explicit and redacted.
- Hardcoding or inventing model IDs; all LLM IDs come from `packages/types/src/models.json`.
- Referencing removed tiers. `package.json` `agiWorkforce.tier` still enumerates `hobby`/`pro_plus` — that is a known 🟡 reconciliation gap; specs use only Free / Basic ($8·₹399) / Pro ($20) / Max ($100 & $200) / Enterprise, with no top-ups.
- Referencing Supabase (fully migrated away) or renaming `proxy.ts` to `middleware.ts`.
