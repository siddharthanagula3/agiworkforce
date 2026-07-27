# apps/desktop/src/features/tasks

Status: Current
Owner role: Desktop lead
Last updated: 2026-07-27
Purpose: Desktop host adapter for the shared Tasks surface (durable Managed Cloud agent runs).

## What lives here

`DesktopTasks.tsx` only. The view is `TasksPage` in
`@agiworkforce/unified-chat`, shared with web so the two lists cannot drift.

The run client was already shared — `createManagedCloudAgentRunClient` in
`cloud-contracts` — so only three things differ per host, via `TasksTransport`:

| transport          | web                        | desktop                            |
| ------------------ | -------------------------- | ---------------------------------- |
| `client`           | Clerk token + CSRF         | `createDesktopCloudAgentRunClient` |
| `openConversation` | `router.push('/chat/:id')` | `hostBridge.selectConversation`    |
| `notifyError`      | sonner toast               | sonner toast                       |

## Trust boundary

Tasks are durable runs executed in AGI Cloud — they continue with the app
closed — so this is Cloud-only. A Local session has no Cloud runs; `Scheduled`
is the device-side equivalent, and navigating to Tasks from Local says so rather
than showing an empty list. Signed out, it asks for sign-in instead of implying
you have no tasks.

## Related

`lib/task-display` (state→label/tone mapping, cancellable predicate) moved into
the shared package with the view. `apps/web/features/tasks/lib/task-display.ts`
re-exports it so existing web importers keep working against one implementation.
