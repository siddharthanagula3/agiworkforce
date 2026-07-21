# apps/web/features/tasks

Status: Current
Owner role: Web lead
Last updated: 2026-07-21
Purpose: Tasks page — lists the signed-in user's Managed Cloud agent runs (AGI Work), with Active/All filtering, run state + work-mode labels, cancel (Stop) for in-flight runs, and click-through to the originating conversation.

## Rules

- Run data comes only from the shared `createManagedCloudAgentRunClient` (`@agiworkforce/cloud-contracts`); do not hand-roll a second `cloud_agent_runs` fetch path.
- Auth every call with the live Clerk token via `getAuthToken`; mutations (cancel) carry CSRF headers through `decorateMutationHeaders`.
- Degrade gracefully when `/runs` is unavailable (empty/again-later state), never a hard crash — AGI Work availability depends on the `cloud_agent_runs` migrations being applied.
- State/label vocabulary lives in `lib/task-display.ts` (`taskStateLabel`/`taskStateTone`/`workModeLabel`/`isCancellableState`); keep it the single source so cards and filters stay consistent.
