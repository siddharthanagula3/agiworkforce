# AGI VS Code Extension — Volume 07 — Code Generation

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (repo root), `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), `apps/extension-vscode/AGENTS.md`, `docs/surfaces/vscode-extension.md`, and real repo paths — `apps/extension-vscode/package.json`, `apps/extension-vscode/src/core/runInlineCommand.ts`, `apps/extension-vscode/src/platform/applyEdit.ts`, `apps/extension-vscode/src/integrations/patchEngine.ts`, `apps/extension-vscode/src/providers/agentMode/agentLoop.ts`, `apps/extension-vscode/src/providers/agentMode/agentUI.ts`, `apps/extension-vscode/src/providers/diffDecorationProvider.ts`, `apps/extension-vscode/src/providers/codeActionProvider.ts`, `apps/extension-vscode/src/data/checkpointManager.ts`, `apps/extension-vscode/src/features/inline-completions/inlineCompletionProvider.ts`, `apps/extension-vscode/src/features/model-picker/modelConstants.ts`. Model IDs derive only from `packages/contracts/types/src/models.json`.

## Overview & stance

This volume specifies how the AGI VS Code Extension turns intent into code inside the editor: generating new code, editing and refactoring existing code, coordinated multi-file changes, and generating tests, documentation, and scaffolding. It is the IDE-native developer surface and is **workspace-scoped**.

All three trust modes apply — **Local**, **BYOK** (permitted here; Desktop/CLI/VS Code only), and **Managed Cloud** — chosen explicitly with visible host/provider labels. Generation never sends editor context into consumer app-chat history. Workspace Trust restricts endpoints, CLI path, auto-apply, telemetry endpoint, and tier overrides and forces diff review for untrusted workspaces. Model selection resolves through the shared catalog adapter; the default `auto` value is a routing alias, not a model ID.

## Generate

Generation has two entry paths. **Inline ghost-text completions** as you type — provider, debounce, and length are configurable (`agiWorkforce.inlineCompletions.*` in `package.json`) and implemented in `apps/extension-vscode/src/features/inline-completions/inlineCompletionProvider.ts`. ✅ Built. **Prompt-driven generation** via the `@agi` chat participant and code lenses ("Ask AI") emits fenced code that `applyEdit.ts` (`extractCodeBlock` / `applyLlmEdit`) offers to apply inline, open in a new tab, or cancel. ✅ Built (`apps/extension-vscode/src/platform/applyEdit.ts`, `apps/extension-vscode/src/features/chat-participant/chatParticipant.ts`).

Requirements: completions must respect the active trust mode and show the resolved model/provider label before first token; a Local session must not emit a BYOK/Cloud request without an explicit fork. Completions require a key/session (`inlineCompletions.enabled` note in `package.json`) and must degrade silently to no suggestion, never to a hidden Cloud call.

## Edit

Editing an existing selection or file must always be reviewable. `applyLlmEdit` presents **Apply Inline | View in New Tab | Cancel**; `autoApplyFixes` is honored only in a **trusted** workspace and is forced `false` otherwise (`runInlineCommand.ts`, EXTV-1). ✅ Built. Applied changes render as accept/reject diff decorations with per-diff, per-file, and global commands (`agi-workforce.acceptDiff` / `rejectDiff` / `acceptAllDiffsGlobal` and keybindings in `package.json`), backed by `apps/extension-vscode/src/providers/diffDecorationProvider.ts`. ✅ Built.

Requirements: no edit is written without either an explicit diff review or a trusted-workspace auto-apply opt-in; the diff overlay must expose expected-vs-actual context (`agi-workforce.showOriginalContext`) so a fuzzy match is auditable before acceptance.

## Refactor

Refactoring is exposed as the `agi-workforce.refactor` command, the `/refactor` chat slash command, the editor context menu, and a lightbulb Code Action (`vscode.CodeActionKind.Refactor`) in `apps/extension-vscode/src/providers/codeActionProvider.ts`; the shared handler lives in `apps/extension-vscode/src/core/runInlineCommand.ts`. ✅ Built. Refactors flow through the same diff-review path as Edit — a refactor is never applied silently. Requirement: multi-selection or whole-file refactors that touch more than the active file escalate to the Multi-file path below rather than editing invisibly.

## Multi-file Editing

Agent Mode drives coordinated edits across files. `agentLoop.ts` parses both `edit:<path>` full-file blocks (`parseFileEdits`) and search/replace patch blocks (`parsePatchBlocks` from `integrations/patchEngine.ts`), then dispatches through `handleEditRequests` / `handlePatchRequests`; `agentUI.ts` applies them (including `wsEdit.createFile` for new files) with batch accept/reject (`agi-workforce.acceptBatch` / `rejectBatch`). 🟡 Partial (`apps/extension-vscode/src/providers/agentMode/agentLoop.ts`, `agentUI.ts`, `integrations/patchEngine.ts`) — gaps: patch application is per-file with confidence scoring (high/medium/low), not a single cross-file atomic transaction with automatic rollback of a partially-applied batch. Checkpoints partially cover this: `data/checkpointManager.ts` plus `createCheckpoint` / `restoreCheckpoint` / `listCheckpoints` and `rewindLast` let a user snapshot before and restore after a batch. ✅ Built (checkpoints). Requirements: sensitive files (`.env`, keys) are refused/confirmed before write or create (`utils/pathSafety.ts` `isSensitiveFile`, patchEngine PR-2B/F-04); every write stays inside a workspace folder; a rejected batch must leave the tree unchanged.

## Tests

Test generation is the `agi-workforce.generateTests` command, the `/tests` chat slash command, and the "Tests" code lens/context action, sharing `runInlineCommand.ts`. ✅ Built. Running the suite is a separate command (`agi.test.run`). ✅ Built (`package.json`). Requirements: generated tests apply through the standard diff-review path; the target framework should be inferred from the workspace rather than assumed. Auto-running a generated test file is out of scope unless the user invokes `agi.test.run`; a generate→run→repair loop is 🔭 Planned.

## Documentation

Documentation generation is `agi-workforce.docs`, the `/docs` slash command, and the "Docs" code lens (`runInlineCommand.ts`). ✅ Built. Output (e.g. JSDoc-style comments per the chat participant `sampleRequest`) is inserted through the same reviewable apply path — never written without preview outside a trusted auto-apply. Requirement: doc comments match the file's language/comment convention.

## Scaffolding

Agent Mode can create new files during a multi-file change (`wsEdit.createFile` in `agentUI.ts`), so lightweight, prompt-driven scaffolding of individual files exists today. 🟡 Partial (`apps/extension-vscode/src/providers/agentMode/agentUI.ts`) — gap: there is no dedicated project/template scaffolding command in `package.json:contributes.commands`. A first-class scaffolding flow (project templates, framework bootstrap wizard, multi-file starter kits with a preview tree) is 🔭 Planned. Requirements when built: all created files pass the sensitive-file guard and workspace-containment check, and land through the batch diff/checkpoint path so scaffolding is fully reviewable and reversible.

## Repository map

- `apps/extension-vscode/package.json` — commands, `@agi` chat participant + slash commands, keybindings, settings, `restrictedConfigurations`.
- `apps/extension-vscode/src/core/runInlineCommand.ts` — shared explain/fix/refactor/tests/docs handler + untrusted-workspace auto-apply gate.
- `apps/extension-vscode/src/platform/applyEdit.ts` — code-block extraction and inline-apply UX.
- `apps/extension-vscode/src/integrations/patchEngine.ts` — search/replace patch parse + apply, confidence scoring, sensitive-file refusal.
- `apps/extension-vscode/src/providers/agentMode/{agentLoop.ts,agentUI.ts}` — multi-file edit/patch orchestration and application.
- `apps/extension-vscode/src/providers/{diffDecorationProvider.ts,codeActionProvider.ts}` — diff accept/reject overlay and lightbulb actions.
- `apps/extension-vscode/src/data/checkpointManager.ts` — snapshot/restore/rewind.
- `apps/extension-vscode/src/features/inline-completions/inlineCompletionProvider.ts` — ghost-text completions.
- `apps/extension-vscode/src/features/model-picker/modelConstants.ts` — catalog adapter over `packages/contracts/types/src/models.json`.
- `apps/extension-vscode/src/utils/pathSafety.ts` — sensitive-file / containment guards.

## Competitor notes

Claude Code and Codex IDE extensions offer chat/edit/agent modes, `@`-file references, editor + diagnostics context, inline diff review, approvals, and local application of remote diffs. AGI matches the diff-review, code-action, and agent-edit shape but diverges deliberately: **multi-provider** model selection from a shared catalog (not a single vendor), **BYOK** honored where the trust matrix allows (Desktop/CLI/VS Code only), **per-surface trust** with explicit Local/BYOK/Cloud labels, and **local-first** defaults — completions and edits can run entirely on a local runtime with no cloud round-trip. Unlike the parity products, AGI never auto-syncs IDE generation into cross-device app chat.

## Acceptance / Definition of Done

Production-ready when generation and editing across all seven required domains route through one reviewable apply path, respect the active trust mode with a visible model/provider label, and honor workspace-trust and sensitive-file guards.

- [ ] **Build:** `pnpm --filter agi-workforce typecheck` and `pnpm --filter agi-workforce test` pass; new generation code has tests (extend `patchEngine.test.ts`, `applyEdit.test.ts`, `codeActionProvider.test.ts`).
- [ ] **Trust:** no path promotes a Local edit to BYOK/Cloud without an explicit fork; untrusted workspaces force diff preview; no editor context reaches app chat except via explicit redacted handoff.
- [ ] **Security:** every write/create is workspace-contained and passes `isSensitiveFile`; rejected batches leave the tree unchanged; model IDs resolve only from `packages/contracts/types/src/models.json`.

## Anti-patterns

- Auto-applying generated code with no diff in an untrusted workspace, or bypassing `restrictedConfigurations`.
- Silently routing a Local generation to BYOK or Managed Cloud, or hiding the resolved provider/model label.
- Auto-syncing generated code or editor context into Web/Mobile/Desktop app chat.
- Hardcoding or inventing a model ID instead of reading `packages/contracts/types/src/models.json`.
- Referencing removed tiers ("Plus", `pro_plus`, "Hobby") or credit top-ups in generation gating; the manifest exposes only current extension access modes.
- Referencing Supabase (fully migrated to Clerk + Neon + Stripe) or claiming a scaffolding/test-repair loop as shipped without a repo path.
