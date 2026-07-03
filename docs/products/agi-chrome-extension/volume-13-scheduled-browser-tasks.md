# AGI Chrome Extension — Volume 13 — Scheduled Browser Tasks

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (repo root), `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), the nearest surface guide `apps/extension/AGENTS.md`, and the real implementation this volume grounds in: `apps/extension/manifest.json`, `apps/extension/src/features/background/tasks.ts`, `apps/extension/src/background.ts`, `apps/extension/src/types.ts`, `apps/extension/src/background/policy.ts`, `apps/extension/src/features/background/shortcuts.ts`, `apps/extension/src/features/computer-use/{escalationEngine,agentLoop,cdpDriver}.ts`, `apps/extension/THREAT_MODEL.md`.

## Overview & stance

This volume specifies **recurring, unattended browser tasks** for the AGI Browser Companion — a schedule that wakes the extension, optionally notifies the user, and runs either a recorded workflow (a saved shortcut) or a bridged-chat prompt. It **replaces the removed Projects volume**; there is no Projects/Programs surface in the extension.

The trust model is decisive. The extension holds **no provider keys and runs no inference**: a scheduled prompt is dispatched through the thin bridged chat, which streams via the cloud gateway (`providerStreamClient.ts` -> `/api/v1/providers/<id>/stream`), never contacting a provider host directly. There is **no BYOK and no Local mode** on this surface. A recorded-shortcut task replays local page actions through CDP computer-use (`agentLoop.ts` / `cdpDriver.ts`) on the current tab. Task definitions live in `chrome.storage.local` only (device-scoped, **never synced** — no Neon delta-sync, no cross-device schedule mirroring); this is workspace/task-scoped by canon. Every fire-time run re-checks the site allowlist and remains approval-gated for high-risk actions. Unbuilt frequencies are marked 🔭.

## Scheduling — daily / weekly / monthly / annually

Tasks are typed `ScheduledTask` with `scheduleType: 'hourly' | 'daily' | 'weekly' | 'monthly'` and a `scheduleValue` (minutes for hourly; `HH:MM` for daily; day + `HH:MM` for weekly/monthly) — `apps/extension/src/types.ts` (~L833–855). Create/list/update/delete are handled in `tasks.ts` (`handleCreateScheduledTask`, `handleListScheduledTasks`, `handleUpdateScheduledTask`, `handleDeleteScheduledTask`), capped at `MAX_TASKS = 50`.

- **Daily / weekly ✅ Built** — `getAlarmPeriod` maps daily -> 1440 min, weekly -> 10080 min (`tasks.ts` L37–53).
- **Monthly 🟡 Partial** — supported, but `getAlarmPeriod` approximates a month as a fixed **30-day** period (43200 min), not a calendar month; a true "same date each month" and `scheduleValue` day-of-month honoring are not yet implemented (`tasks.ts` L44–46). Gap: calendar-accurate monthly scheduling.
- **Annually 🔭 Planned** — no `'annually'` (or quarterly) member exists in `ScheduleType`. Adding it requires a new `getAlarmPeriod` branch plus a next-anniversary computation; it is not built.

Requirements: schedule editing runs only from trusted extension pages (side-panel Workflows tab / options), never a content script; updates strip `id`/`createdByOrigin` and re-validate any `actions` (`tasks.ts` L104–115, security batch-220 fix).

## Alarms API

Scheduling is backed by `chrome.alarms` (declared in `apps/extension/manifest.json` `permissions`). `registerTaskAlarm` calls `chrome.alarms.create(\`${TASK_ALARM_PREFIX}${task.id}\`, { periodInMinutes, delayInMinutes })`and only registers when`task.enabled`is true;`unregisterTaskAlarm` clears by name (`tasks.ts` L55–66). — **✅ Built.**

Requirements: (1) one alarm per task, keyed `agi_task_<id>`, so the fire handler recovers the task id by prefix strip; (2) MV3 minimum period is 1 minute — no sub-minute schedules; (3) alarms are best-effort (Chrome may coalesce/delay), so downstream logic must be idempotent and must not assume exact wall-clock firing.

## Background Execution — service-worker constraints

The background is an MV3 **service worker** (`manifest.json` `background.service_worker`, `type: module`, `minimum_chrome_version: 132`). MV3 workers are terminated when idle, which **destroys in-memory timers**. The design compensates:

- On worker startup, `restoreScheduledTaskAlarms()` reloads persisted tasks and re-registers an alarm for every enabled task (`tasks.ts` L134–144), invoked from `background.ts` (~L388). — **✅ Built.**
- The alarm listener `chrome.alarms.onAlarm` reloads state from `chrome.storage.local` on each fire rather than trusting worker memory (`background.ts` L3245–3281). — **✅ Built.**
- A `keep-alive` alarm and `chrome.runtime.onSuspend` handler manage the native-bridge connection lifecycle across suspensions (`background.ts` L3246–3299). — **✅ Built.**

Requirements: never hold schedule state only in worker memory; durable state lives in `chrome.storage.local` (`agi_scheduled_tasks`). A fired task must tolerate a cold worker, a closed side panel, and a not-yet-connected bridge.

## Notifications on completion

The `notifications` permission is declared (`manifest.json`). On fire, if the user preference `agi_task_notifications` is not `false` (default on), the handler raises a "AGI Task Running" notification with the task name before executing (`background.ts` L3262–3274). On completion, `executeScheduledTask` calls `showNotification('Task Completed', ...)` (`background.ts` L835; helper at ~L660). — **✅ Built.**

Requirements: notifications are user-toggleable and default-on; the start notification must never leak page content or prompt text (name only); completion notification names the task, not its result payload.

## Failure Handling

- **Origin revocation ✅ Built** — at fire time `executeScheduledTask` re-checks `createdByOrigin` against the live `agi_site_allowlist` cache and **auto-deletes** any task whose origin is no longer allowlisted, so a stale schedule cannot become a persistent capability (`background.ts` L764–783, C-02 audit).
- **Prompt bounding ✅ Built** — a scheduled prompt is capped at `10_000` chars before dispatch, with a truncation warning (`background.ts` L800–808).
- **Fault isolation 🟡 Partial** — the alarm handler wraps load/execute in `.catch` and logs (`background.ts` L3277–3279), and a disabled/missing task is a no-op. Gaps: **no retry/backoff**, no per-task failure counter or auto-disable after repeated failures, and no persisted run-history/error surface beyond `lastRun` (`background.ts` L830–833). These are 🔭 Planned.

Requirements (target): record last-run status (ok / denied / error) and a bounded run log; expose failures in the side panel; add capped exponential backoff for transient bridge failures; auto-disable after N consecutive failures with a notification.

## Approval Model — scheduled runs still approval-gated for high-risk actions

Scheduled execution does **not** bypass approvals. A shortcut task calls `handleReplayShortcut`; a prompt task calls `handleChatMessage` with a synthesized trusted extension-page sender (`background.ts` L787–828). Any high-risk computer-use action then flows through the same gate as interactive runs: when `agi_cu_ask_before_acting` is on (default), the background sends `AGI_CU_APPROVE_REQUEST` to the side panel and **waits, failing CLOSED (deny) on a 30 s timeout**; the request id is CSPRNG (`crypto.randomUUID`), and only responses from a trusted extension page (no `sender.tab`) are honored (`background.ts` L1748–1795). — **✅ Built.**

Consequence to spec honestly: because the approval prompt renders in the side panel, a scheduled high-risk action firing with **no panel open denies by design** — safe, but it means fully-unattended high-risk automation is intentionally not supported. Low-risk/read-only steps proceed. A future "pre-authorized scheduled scope" (explicit, per-task, time-boxed consent) is 🔭 Planned and must never weaken the fail-closed default.

## Repository map

- `apps/extension/manifest.json` — `alarms`, `notifications` permissions; MV3 service worker.
- `apps/extension/src/features/background/tasks.ts` — task CRUD, `getAlarmPeriod`, `registerTaskAlarm`, `restoreScheduledTaskAlarms`, `MAX_TASKS`.
- `apps/extension/src/background.ts` — `onAlarm` fire handler, `executeScheduledTask`, allowlist re-check, `showNotification`, approval gate.
- `apps/extension/src/types.ts` — `ScheduledTask`, `ScheduleType`, task message contracts.
- `apps/extension/src/background/policy.ts` — `validateShortcutActions`, `generateRecordId`, `ORIGIN_EXTENSION_PAGE`.
- `apps/extension/src/features/background/shortcuts.ts` — recorded-workflow replay (`handleReplayShortcut`).
- `apps/extension/src/features/computer-use/{agentLoop,cdpDriver,escalationEngine}.ts` — CDP execution + high-risk escalation.

## Competitor notes

Claude for Chrome offers scheduled/recurring browser tasks with plan gating and approval prompts; ChatGPT's agent and OpenAI Codex focus on cloud-run or host-steered sessions. AGI's deliberate divergence: (1) **local-first, task-scoped** — schedules live in `chrome.storage.local`, never synced server-side or across devices; (2) **no keys, no inference on-surface** — bridged chat streams through the cloud gateway with per-plan model gating; (3) **fail-closed approvals** even for scheduled runs, versus assistants that grant unattended autonomy; (4) **per-surface trust** — BYOK and Local (Desktop/CLI/VS Code) are deliberately absent here.

## Acceptance / Definition of Done

Build

- [ ] `restoreScheduledTaskAlarms` re-registers all enabled tasks after a cold MV3 worker restart; verified by simulated worker termination.
- [ ] Daily/weekly/monthly alarms fire within Chrome's coalescing tolerance; monthly-calendar accuracy tracked as the 🟡 gap.
- [ ] Start + completion notifications respect `agi_task_notifications` and leak no page/prompt content.

Trust

- [ ] No scheduled path contacts a provider host directly; prompt tasks route only through the cloud gateway; no BYOK/Local mode reachable.
- [ ] Task definitions are never written to any Neon `/sync` endpoint; storage is `chrome.storage.local` only.

Security

- [ ] Fire-time allowlist re-check auto-deletes de-allowlisted tasks; update path strips `id`/`createdByOrigin` and re-validates actions.
- [ ] High-risk actions in a scheduled run trigger the fail-closed 30 s approval gate; forged/content-script approval responses are rejected.

## Anti-patterns

- Do not treat a scheduled run as pre-approved: never skip the high-risk approval gate or turn the 30 s timeout into auto-allow.
- Do not sync schedules, run history, or memory across devices or to the cloud; no Neon delta-sync, no Projects.
- Do not route a scheduled prompt to any provider host, embed provider keys, or add BYOK/Local on Chrome.
- Do not hold schedule state only in worker memory (MV3 kills it); do not assume exact wall-clock firing.
- Do not hardcode or invent model IDs — resolve via the catalog (`packages/types/src/models.json`); do not reference Supabase or removed tiers ("Plus", `pro_plus`, "Hobby"), and never spec in-extension checkout or credit top-ups.
- Do not claim annually/quarterly scheduling as shipped — it is 🔭 Planned until `ScheduleType` and `getAlarmPeriod` support it.
