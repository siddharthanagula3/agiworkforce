---
id: "AREA-063"
type: "area"
title: "Routines, schedules, and triggers"
features: ["F063-01", "F063-02", "F063-03", "F063-04", "F063-05", "F063-06", "F063-07", "F063-08", "F063-09"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 63. Routines, schedules, and triggers

A routine is a saved prompt that the Cloud runs for you without you being present. It can run once, on a repeating clock, when an outside event arrives (GitHub, Slack, Gmail, Calendar, a signed webhook), or when you press Run now. You get the result in a run history, and the run stops and asks you when it needs approval for a risky step. It saves repeat work (briefings, inbox triage, monitoring) and keeps cost bounded through run limits and credit caps.

**Who uses it.** Signed-in users on a plan that includes scheduled tasks. The cap is read from the plan table: local-only, own-key (byok) and Free get 0 (so the create call is refused with an upgrade prompt), Basic 3, Pro 5, Max 15, a plan named max_15x 25, Team 10, Enterprise 'custom' (packages/contracts/types/src/billing-catalog.ts:593-723). Routines are Cloud-only: they run on the server, not on the device. Workspace members must still be active members of their workspace for runs to fire, and the access gate can block them (apps/web/app/api/schedules/route.ts:96-103). The only Local-mode path is the Desktop "local routines" panel on web (LocalRoutinesSection.tsx), which runs through the desktop host bridge.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F063-01](F063-01-routine-gallery-templates.md) | Routine gallery (templates) | built | built | built | no | n/a | built |
| [F063-02](F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md) | Create a routine (from a prompt, from a chat turn, from a share link) | built | built | partly | built | no | partly |
| [F063-03](F063-03-what-a-run-may-use-sources-connectors-agent-model.md) | What a run may use: sources, connectors, agent, model | partly | partly | partly | partly | no | partly |
| [F063-04](F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md) | When it runs: one-time, repeating, time zone, advanced rules | built | built | built | partly | n/a | partly |
| [F063-05](F063-05-event-triggers-and-webhooks.md) | Event triggers and webhooks | built | built | partly | built | n/a | no |
| [F063-06](F063-06-run-now-and-run-results.md) | Run now and run results | built | built | built | partly | built | partly |
| [F063-07](F063-07-pause-resume-edit-delete-share.md) | Pause, resume, edit, delete, share | partly | partly | partly | partly | partly | partly |
| [F063-08](F063-08-cost-and-safety-controls-caps-notifications-approv.md) | Cost and safety controls: caps, notifications, approvals | built | built | partly | partly | built | partly |
| [F063-09](F063-09-missed-runs-retries-and-held-runs.md) | Missed runs, retries and held runs | partly | partly | partly | partly | partly | partly |

Requirement items for this area: [10-requirements/capabilities/063-routines-schedules-and-triggers.md](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md).

## How this area works in the code

1. **Person sets up a routine.** A form (web ScheduleForm, desktop DesktopCloudSchedules, mobile ScheduleForm, CLI command, Chrome side panel) collects name, prompt, timing, model, sources, connectors, agent, caps, retries, missed policy and notifications. Templates, chat answers, share links and agents only pre-fill this draft. (`apps/web/features/schedules/components/SchedulesPage.tsx:443`, `apps/web/features/schedules/components/ScheduleForm.tsx:228`, `apps/web/features/schedules/components/ScheduleAccessFields.tsx:40`, `apps/web/features/chat/components/messages/MessageBubble.tsx:4050`, `apps/mobile/src/features/schedules/policy.ts:4`)
2. **Request reaches the server.** Every app calls the same /api/schedules endpoints. The server finds the user, applies rate limit and CSRF check, checks the plan quota (Free and own-key get 0) and the workspace feature gate, and refuses prompts with secrets. (`apps/web/app/api/schedules/route.ts:96`, `apps/mobile/src/features/schedules/service.ts:184`, `apps/cli/src/schedules.rs:292`)
3. **Input is checked and saved.** validateScheduleInput rejects unknown fields, bad lengths, bad time zones and impossible timing, checks the model against the catalog, and works out the first next_execution_at. createSchedule inserts the row into scheduled_tasks under a per-user lock; options like sources and connectors are stored in the metadata column. (`apps/web/lib/services/schedule-service.ts:681`, `apps/web/lib/services/schedule-service.ts:994`, `apps/web/app/api/schedules/route.ts:107`)
4. **The clock fires runs.** Vercel calls /api/cron/run-schedules every 15 minutes. It claims up to 10 due routines per wave (up to 50 per sweep) and runs them, each with a time limit. Missed-run detection and the condition watch happen when each claim is processed. (`vercel.json:50`, `apps/web/app/api/cron/run-schedules/route.ts:43`, `apps/web/lib/services/schedule-service.ts:1341`, `apps/web/lib/services/schedule-service.ts:2102`, `apps/web/lib/services/schedule-service.ts:2471`)
5. **Events fire runs.** A signed webhook (or GitHub, Slack, Gmail, Calendar receiver) is verified, matched to triggers, filtered by conditions and debounce, and queued as a job. The job creates a run with idempotency key eventId:attempt and appends the event data to the prompt as untrusted text. (`apps/web/app/api/webhooks/connectors/[triggerId]/route.ts:46`, `apps/web/lib/triggers/trigger-ingest.ts:361`, `apps/web/lib/triggers/trigger-fire.ts:85`, `apps/web/lib/services/schedule-service.ts:1503`)
6. **Run now.** POST /api/schedules/{id}/runs needs an Idempotency-Key. It creates a running row (or returns the earlier one for the same key) and runs the agent in the same request with a 40-second limit. (`apps/web/app/api/schedules/[id]/runs/route.ts:69`, `apps/web/lib/services/schedule-service.ts:1495`, `apps/web/features/schedules/components/SchedulesPage.tsx:491`)
7. **The agent runs unattended.** The executor re-checks secrets, plan access and agent, picks a route for the model (refusing routes unfit for Google user data or no-training settings), builds the allowed tool list from sources and connectors, and runs the tool loop with approvals set to pause. Result text, tools used and cost are stored. (`apps/web/lib/services/scheduled-agent-executor.ts:861`, `apps/web/lib/services/scheduled-agent-executor.ts:237`, `apps/web/lib/services/scheduled-agent-executor.ts:595`)
8. **Approval pause and resume.** If a step needs approval the run becomes awaiting_approval with a checkpoint, the routine pauses, and a notification job is queued. The approval endpoint loads the checkpoint and resumes the same run. (`apps/web/lib/services/schedule-service.ts:1874`, `apps/web/lib/services/schedule-service.ts:1957`, `apps/web/app/api/schedules/[id]/runs/[runId]/approval/route.ts:27`, `apps/web/features/schedules/components/SchedulesPage.tsx:700`)
9. **Results are shown.** Run rows are mapped to a public shape with the output text, status, error and a timing note, and shown in each app's history list. (`apps/web/lib/services/schedule-service.ts:454`, `apps/web/features/schedules/components/ScheduleRunHistory.tsx:150`, `apps/mobile/src/features/schedules/service.ts:95`)

## Files to know

| File | Role |
|---|---|
| `apps/web/lib/services/schedule-service.ts` | All routine rules: validation, quota, create/edit/pause/delete, claiming due runs, retries, missed runs, approvals, caps. |
| `apps/web/lib/services/scheduled-agent-executor.ts` | Runs one routine as an unattended agent: route, tools, sources, connectors, approval pause. |
| `apps/web/app/api/schedules/route.ts` | List and create endpoint, with plan limit and gate errors. |
| `apps/web/app/api/schedules/[id]/runs/route.ts` | Run history and Run now (manual / API start). |
| `apps/web/app/api/cron/run-schedules/route.ts` | The 15-minute sweep that fires due routines. |
| `apps/web/lib/triggers/trigger-fire.ts` | Job that turns a matched event into a run. |
| `apps/web/lib/triggers/trigger-ingest.ts` | Matches incoming events to triggers, applies filters, debounce and rate limits, queues jobs. |
| `apps/web/app/api/webhooks/connectors/[triggerId]/route.ts` | Signed webhook receiver. |
| `apps/web/features/schedules/components/SchedulesPage.tsx` | Main web screen: list, filters, gallery, create, run, approve, share, delete. |
| `apps/web/features/schedules/components/ScheduleForm.tsx` | The create/edit form. |
| `packages/contracts/cloud-contracts/src/schedules.ts` | Shared types, templates, timing notes used by all apps. |
| `apps/web/lib/services/schedule-share-service.ts` | Share link save, revoke and read. |
| `apps/cli/src/schedules.rs` | CLI client for the same Cloud routines. |

## What is stored

- Routines (name, prompt, timing, model, caps, retry and missed policy, sources and connectors in metadata, next/last run, paused reason): database table scheduled_tasks (apps/web/db/neon/0009_scheduling.sql:1, 0209_scheduled_task_rules_and_policies.sql:39-47)
- Runs (status, trigger source, output, error, idempotency key, lease, approval checkpoint and request): database table scheduled_task_runs (0009_scheduling.sql:34, 0057_durable_scheduling.sql:8, 0308_schedule_run_approval.sql:24)
- Event triggers (source, account, event types, conditions, debounce, verification): database table event_triggers (0210_event_triggers.sql:38)
- Incoming event deliveries and their outcome: database table event_trigger_events (0210_event_triggers.sql:81)
- Share links as a snapshot with a token: database table scheduled_task_shares (0311_scheduled_task_shares.sql:26)
- Credit use per routine: read from managed_usage_requests rows with scheduled_task_id (schedule-service.ts CREDITS_USED_SQL)
- Missed-run audit events: security audit log via recordAuditEvent (schedule-service.ts:2150-2165)
- Mobile copy of the list: mobile local store (apps/mobile/src/features/schedules/store.ts); exact storage medium not checked
- Desktop local routines: desktop host runtime, not the cloud database (LocalRoutinesSection.tsx invokes bridge commands); file or table not checked

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Plan limit maxScheduledTasks**: 0 for local-only, own-key and Free (create refused); 3, 5, 15, 25, 10, custom for others (packages/contracts/types/src/billing-catalog.ts:593-723; read in apps/web/lib/services/schedule-service.ts:877)
- **Workspace feature gate 'schedules' and access gate**: A workspace can block creating and listing routines (apps/web/app/api/schedules/route.ts:96-103,121)
- **External sharing gate**: Workspace can block share links (apps/web/app/api/schedules/[id]/share/route.ts:46)
- **Mobile FEATURES.schedules**: When false, every mobile schedule call throws 'not available in v1'; it is true (apps/mobile/lib/v1FeatureFlags.ts:14; apps/mobile/src/features/schedules/service.ts:27)
- **connectorsReleased()**: Hides connector choice on mobile when connectors are not released (apps/mobile/src/features/schedules/components/ScheduleAccessSection.tsx:8,36)
- **Low-power database mode (dbLowPowerEnabled / lowPowerCronSkip)**: Sweep can be skipped and the missed-run grace becomes 2 hours (apps/web/lib/services/schedule-service.ts:81-86; apps/web/app/api/cron/run-schedules/route.ts:20)
- **Event signing key environment value**: Without it webhook events are refused with 503 (apps/web/app/api/webhooks/connectors/[triggerId]/route.ts:76 (EVENT_TRIGGER_SIGNING_SECRET_ENV))
- **Cron authentication**: Only requests that pass verifyCronRequest start the sweep (apps/web/app/api/cron/run-schedules/route.ts:21)
- **Platform limits**: 50 runs per sweep; 30 event runs per hour, 720 per day (packages/contracts/types/src/billing-catalog.ts:478-482)
- **Account state**: Owners whose account may not run unattended work get no runs and no valid share links (schedule-service.ts ownerMayRunUnattendedSql; schedule-share-service.ts getSharedSchedule)

## Shared between apps

Shared: the server (apps/web/app/api/schedules, schedule-service.ts, scheduled-agent-executor.ts, triggers) is the only place routines live. Types, validation schemas, templates, paths, page-size limits and the missed-run wording are in packages/contracts/cloud-contracts/src/schedules.ts and used by web, desktop, mobile and the Chrome panel. Plan limits come from packages/contracts/types/src/billing-catalog.ts. Time helpers (cron builder, local-to-ISO) are in packages/platform/utils/src/scheduling. Separate per app: every UI (web React components, desktop DesktopCloudSchedules.tsx, mobile React Native screens, Chrome DOM side panel, VS Code tree and commands) and the CLI's Rust client. The CLI daemon with local cron, webhook and file triggers and the web LocalRoutinesSection for the Desktop host are separate local mechanisms.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief says CLI has no manual run, but the CLI has an agi schedules run command that waits for the result. (apps/cli/src/lib.rs:1585)
- Brief says CLI cannot edit, but there is an Edit command for name, description, prompt, model, cron and time zone. (apps/cli/src/lib.rs:1551)
- Brief says mobile lacks event triggers, agent and connector selection, but the code has a Triggers screen and an access section with agent and connector choices. (apps/mobile/src/features/schedules/ScheduleTriggersScreen.tsx:203; apps/mobile/src/features/schedules/components/ScheduleAccessSection.tsx:24)
- Brief says Chrome has no run history and no model choice, but the Chrome panel has a runs view and a model dropdown. (apps/extension/src/features/side-panel/schedulesSection.ts:518,924-1130)
- Several brief code pointers do not point at the feature. Desktop pointers for sources, connectors and filters name an unrelated function (isLocalhost) and a route-prefix list; CLI 'create from task' points at the continue-with-cloud command, while the real code is /save-routine. (apps/desktop/electron/config.ts:39; packages/contracts/types/src/product-routes.ts:20; apps/cli/src/claude_parity.rs:256 (real: 321, 901))
- Brief S63.18 points at openapi.json lines that are another endpoint (member invitations); the runs endpoint is at line 4629. No separate API-trigger run source is recorded: Run now stores trigger_source 'manual' even for token callers, while the table allows 'api'. (apps/web/public/openapi.json:4396,4629; apps/web/lib/services/schedule-service.ts:1503-1520; apps/web/db/neon/0009_scheduling.sql:34-45)
- Delete is a hard delete with no Trash step, while the repo rule says removals go to Trash first. The web asks first, but nothing can restore it. (apps/web/lib/services/schedule-service.ts:1291-1312)
- Cron expression via CLI is sent as recurrence 'custom'; the CLI can only make cron schedules, not once or daily. (apps/cli/src/schedules.rs:89-110)
- A manual run is cut at 40 seconds inside the request (timeoutMs 40000, maxDuration 60), so long routines end as timeouts when run now. (apps/web/app/api/schedules/[id]/runs/route.ts:80-86)
- Missing features confirmed in code: no repository field, no per-routine effort field, no pause-until-date, no duplicate, no held run until allowance reset, no connector-expiry repair. (apps/web/lib/services/schedule-service.ts:139-167 (ScheduleInput has none of these))

## Not established

- How the Desktop (Electron) build shows routines: it hosts the web app, and apps/desktop/src DesktopCloudSchedules.tsx belongs to the retained Tauri build. I did not trace which one the public Desktop uses for the cloud schedule page.
- Where the Desktop local routines are stored and which code runs them; I only saw the web panel invoking host-bridge commands (LocalRoutinesSection.tsx), and I did not open the host side.
- Whether 'Run now' from the API with a token is recorded as manual or api; I did not open getUserScopedDb's bearer path or any code writing trigger_source 'api'.
- The mobile local store's storage medium, and the full mobile run-history behaviour.
- The exact name of the plan with 25 routines (listed as max_15x in the plan table, line 673); it is not confirmed which product name that is.
- The unattended approval gate rules in tool-call-gate.ts (which tools force a pause); I did not open the file.
- Whether CLI and VS Code approve and run commands call the same endpoints as web; I only saw the CLI client method names.
- The notification delivery details (push, email) for routine runs; only the queueing of the notification job was seen.
- Exact behaviours of the web gallery open and close on non-empty lists beyond the helper functions seen.
- Gmail and Calendar watch registration details.
