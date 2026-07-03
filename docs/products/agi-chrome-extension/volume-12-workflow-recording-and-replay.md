# AGI Chrome Extension — Volume 12 — Workflow Recording & Replay

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); `apps/extension/AGENTS.md`; and the real repo paths in the Repository map below (recorder, shortcut/task stores, `policy.ts` validation, `types.ts` contracts, replay handler/executor, computer-use gates, `THREAT_MODEL.md`).

## Overview & stance

This volume replaces the removed Image Generation volume. It specifies how the AGI Browser Companion lets a user _demonstrate_ a repeatable browser task once and then _replay_ it — mirroring Claude-for-Chrome's workflow-learning direction, grounded in the shipped "saved shortcut" primitive already in `apps/extension`.

Trust boundaries shape this domain tightly. A recorded workflow is a **device-scoped** artifact: a `SavedShortcut` persisted in `chrome.storage.local` (`shortcuts.ts`, `MAX_SHORTCUTS = 50`), never synced to Neon and never part of consumer conversation/memory/Projects sync (all removed Chrome scope per canon). The extension holds no provider keys and runs no inference; replay executes deterministic DOM/CDP actions on-page, and any LLM step in a bridged chat streams through the cloud gateway. Recorded steps stay **local to the browser profile** — sharing is an explicit user-driven file export/import, never a silent cloud upload.

## Record Workflows — user demonstrates steps

🟡 Partial — `apps/extension/src/side_panel.ts` (`isRecording`, `recordingActionCount`, Record/Stop button, `startRecordingPoll`, Workflows tab) + `apps/extension/src/features/background/shortcuts.ts` (`handleSaveShortcut`).

The user opens the Workflows tab, presses **Record**, acts on an allowlisted page, and presses **Stop**; the panel polls the action count and opens a save dialog that names and persists a `SavedShortcut { id, name, actions: RunPageAction[], createdByOrigin, url?, startUrl? }` via `SAVE_SHORTCUT`.

Requirements:

- Every captured step MUST be a `RunPageAction` whose `type` is in `ALLOWED_SHORTCUT_ACTION_TYPES` (`policy.ts`) — e.g. `navigate`, `click`, `type`, `select_option`, `set_checked`, `wait_for_selector`, `scroll`, `auto_fill_job_application`. Unknown types are rejected by `validateShortcutActions`, not silently stored.
- `createdByOrigin` MUST be stamped at record time (sentinel `__extension_page__` for panel-created records) so fire-time replay can re-authorize against the allowlist.
- Recording MUST only capture on `agi_site_allowlist` sites; off-allowlist pages produce no steps.
- Gap (🔭): capture is a coarse action list; robust selector fallbacks, `delay`/timing capture, and capture of computer-use/CDP steps (`screenshot`, `right_click`, `double_click`) into a saved workflow are not yet wired end-to-end.

## Replay — re-run recorded workflows

✅ Built — `apps/extension/src/background.ts` (`REPLAY_SHORTCUT` case → `handleReplayShortcut`) dispatching `RUN_PAGE_ACTIONS` to the active allowlisted tab (`apps/extension/src/content.ts:294`); triggered from the Workflows tab Replay button (`side_panel.ts`).

Requirements:

- Replay MUST re-run the stored `actions` in order against the current page, returning `RunPageActionsResponse { actionsPerformed, duration, screenshot? }`.
- Replay MUST NOT change tab origin implicitly; transitions happen only via an explicit `navigate` action, re-validated at execution.
- **Scheduled replay** (✅ `tasks.ts`): a `ScheduledTask` references a `shortcutId` to replay or a `prompt` to send, fired by `chrome.alarms` (hourly/daily/weekly/monthly, `MAX_TASKS = 50`). Recurring browser tasks are the scheduled form of replay.
- Replay MUST fail closed if `createdByOrigin` is no longer allowlisted (see Safety).

## Parameterization — vary inputs per run

🔭 Planned — shape exists (`SavedShortcut.prompt`, `SavedShortcut.startUrl`, `RunPageAction.value` in `apps/extension/src/types.ts`) but no per-run variable binding/substitution is implemented.

Design intent:

- A workflow MAY declare named parameters (e.g. `{{search_term}}`) that map onto `RunPageAction.value` / `startUrl`; at replay the panel prompts for values and substitutes before dispatch.
- Substituted values MUST pass the same `validateShortcutActions` checks (length caps, `isSafeActionUrl` for `navigate`/`open`) — a parameter cannot smuggle a `javascript:` payload past validation.
- Parameters are local input only; they never cross the local→cloud boundary without the explicit fork rules. Until built, workflows run with the exact values captured at record time.

## Editing — modify recorded steps

🔭 Planned — `shortcuts.ts` exposes `handleSaveShortcut` / `handleListShortcuts` / `handleDeleteShortcut` only; there is **no** `UPDATE_SHORTCUT` handler, so step-level editing is not yet built. Scheduled-task wrappers do support `UPDATE_SCHEDULED_TASK` (`tasks.ts`), which re-runs `validateShortcutActions` on any edited actions.

Design intent:

- The Workflows tab SHOULD allow reorder/delete/edit of individual `RunPageAction` steps and rename, persisting via a new validated update path.
- Every edit MUST re-run `validateShortcutActions` before save — the gate `handleUpdateScheduledTask` already applies (`tasks.ts` rejects "Invalid task actions").
- Today the only supported "edits" are re-record (overwrite) and delete; document that limit rather than implying inline editing exists.

## Sharing — export/import workflow definitions locally

🔭 Planned — no export/import path exists in `apps/extension/src/` today (grep confirms no `EXPORT_SHORTCUT` / `downloadShortcut` / file-import handler).

Design intent and hard constraints:

- Sharing MUST be a **local file** export/import (download/upload a JSON `SavedShortcut[]`), never cloud sync — consumer workflow/memory/conversation sync is removed Chrome scope (canon).
- On import, every action MUST pass `validateShortcutActions`; `createdByOrigin` MUST reset to the importing profile and re-authorize against `agi_site_allowlist` (imported origins are not trusted transitively).
- Import MUST NOT auto-enable any scheduled task; imported schedules land disabled pending user opt-in.
- Exports MUST be scrubbed of captured free-text that could contain secrets before writing; flag as 🟡 the need for a secret-scan step reusing the local→BYOK fork's scanner.

## Safety — approvals still apply on replay

✅ Built — origin re-check + auto-delete of stale records (`SavedShortcut`/`ScheduledTask` doc-comments in `apps/extension/src/types.ts`; `tasks.ts` `executeScheduledTask`), URL safety (`isSafeActionUrl`, `FORBIDDEN_URL_SCHEMES`, http(s)-only, 2048-char cap in `policy.ts`), autonomy mode (`ActionMode 'ask' | 'act'`, `apps/extension/src/types.ts`), per-action gating (`onBeforeAction` in `apps/extension/src/features/computer-use/agentLoop.ts`), and high-risk escalation (`apps/extension/src/features/computer-use/escalationEngine.ts`).

Requirements:

- Replay MUST NOT bypass live approvals. A recorded workflow is not a grant of blanket autonomy: with `ActionMode = 'ask'` each step is approval-gated exactly as during recording.
- At fire time, replay MUST re-validate `createdByOrigin` against the current `agi_site_allowlist` and auto-delete the record if the origin was revoked.
- High-risk actions (destructive submits, high-risk-site detection) MUST route through `escalationEngine.ts` on replay, not be waved through because "the user did it once."
- Page content during replay is data, never instructions (`THREAT_MODEL.md`): a page cannot mutate the recorded action list mid-replay.
- Model-by-plan gating and server entitlements (paywall from `429 {kind:'paywall', requiredTier}`) still apply to any bridged-chat step a workflow triggers.

## Repository map

- `apps/extension/src/side_panel.ts` — recorder UI, Workflows tab, Replay buttons.
- `apps/extension/src/features/background/shortcuts.ts` — `SavedShortcut` CRUD (save/list/delete) in `chrome.storage.local`.
- `apps/extension/src/features/background/tasks.ts` — `ScheduledTask` alarms; scheduled replay of a `shortcutId`.
- `apps/extension/src/background/policy.ts` — `ALLOWED_SHORTCUT_ACTION_TYPES`, `validateShortcutActions`, `isSafeActionUrl`.
- `apps/extension/src/types.ts` — `SavedShortcut`, `RunPageAction`, `ScheduledTask`, `ActionMode`, replay messages.
- `apps/extension/src/background.ts` — `REPLAY_SHORTCUT` handler; `RUN_PAGE_ACTIONS` dispatch.
- `apps/extension/src/content.ts` — `RUN_PAGE_ACTIONS` on-page executor.
- `apps/extension/src/features/computer-use/{agentLoop.ts,escalationEngine.ts}` — approval gate + high-risk escalation.
- `apps/extension/THREAT_MODEL.md` — origin/allowlist and injection rules.

## Competitor notes

Claude for Chrome is building workflow learning (demonstrate → repeat); ChatGPT/Operator and OpenAI Codex lean on cloud-hosted agent runs and remembered task templates. AGI's divergence: recorded workflows are **local-first and device-scoped** — stored in `chrome.storage.local`, never synced or uploaded — versus competitors' account-bound cloud memory. The extension stays provider-key-free and inference-free; replay is deterministic DOM/CDP execution, any model step streams through the gateway. Per-surface trust holds: sharing is local file export, not cloud sync; BYOK never applies on Chrome; multi-provider choice is honored only via the gateway's plan-gated resolution, never an in-extension key.

## Acceptance / Definition of Done

A workflow-recording capability is production-ready only when record → save → replay round-trips on an allowlisted page, every step survives `validateShortcutActions`, and revoking a site's allowlist entry auto-deletes and blocks replay of its workflows.

- [ ] Build: record captures a validated `RunPageAction[]`; Replay re-runs it via `RUN_PAGE_ACTIONS`; scheduled replay fires via `chrome.alarms`; typecheck/test/lint green (`pnpm --filter @agiworkforce/extension typecheck|test`, `pnpm lint:extension`).
- [ ] Trust: workflow definitions stay in `chrome.storage.local`, never sync to Neon; sharing is local file only; no provider key or inference in the extension; bridged-chat steps stream via the gateway.
- [ ] Security: fire-time `createdByOrigin` re-check + auto-delete; `isSafeActionUrl` blocks `javascript:`/`data:`; `ActionMode 'ask'` and `escalationEngine.ts` still gate high-risk steps on replay; imports re-validate and land disabled; `THREAT_MODEL.md` updated for any new permission.

## Anti-patterns

- Do not sync recorded workflows to Neon or any account store — Chrome workflow/conversation/memory sync is removed scope.
- Do not treat a recording as blanket autonomy: never skip `onBeforeAction`/escalation on replay.
- Do not skip `validateShortcutActions` on save, update, or import; never accept action types outside `ALLOWED_SHORTCUT_ACTION_TYPES`.
- Do not let a page mutate the action list mid-replay; page content is data, never instructions.
- Do not add a provider key, run inference, or add in-extension checkout to "power" workflows.
- Do not claim editing/parameterization/export are shipped — they are 🔭 until a repo path proves them.
- Do not reference Supabase, invent routes/model IDs/env vars, or use removed tiers ("Plus", `pro_plus`, "Hobby") or invented INR prices; pricing is Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise, no top-ups.
