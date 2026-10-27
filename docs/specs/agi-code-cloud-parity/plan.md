# Plan

## Approach

Sessions are created in `apps/web/lib/services/cloud-code-session-service.ts`, opened
through `apps/web/lib/services/cloud-code-session-open.ts`, and run in E2B sandboxes from
`apps/web/lib/e2b/runtime.ts`; agent turns go through
`apps/web/lib/services/cloud-code-agent-service.ts`. The Code page is
`apps/web/features/code/CloudCodePage.tsx` with its composer in
`apps/web/features/code/components/CodeComposer.tsx`. Schema changes are new numbered files
in `apps/web/db/neon`; applied migrations are never edited.

- Environments: a `cloud_code_environments` table owned per user, referenced by a session.
  Secrets are encrypted at rest with the existing connector secret sealing, never returned
  to the page after saving, and substituted by the provider proxy for listed hosts, the way
  model keys already are, so they never enter the sandbox.
- Setup script: run with the session's executor right after the clone, its output kept as
  terminal entries, and the sandbox snapshotted when it succeeds within five minutes; a
  later session in the same environment starts from the snapshot until the script or the
  allowed hosts change, or seven days pass.
- Permission modes: each harness maps the mode to its own flags in
  `apps/web/lib/e2b/harnesses/registry.ts`; a harness without a plan mode does not offer it.
- Background turns: the harness runs as a background command in the sandbox and writes its
  stream to a file; the agent route returns at once and the page polls a short status
  route, so no web request outlives the platform limit.
- Capacity: before a sandbox is created or resumed, the runtime counts running sandboxes
  through the provider's list API against a configured ceiling, keeps headroom for paid
  plans, and answers a queued state the page shows and retries.

## Rollout

Each item ships behind the existing Code gates and is checked in a preview deployment with
a real GitHub repository before production. The web app deploys continuously, so a new
request field is optional until every client sends it.

## Risks

Secrets and network policy are trust boundaries and fail closed. Snapshots and templates
use the provider's paid resources and need the owner's approval to build. Background turns
change how a turn ends, so reservation settlement and the turn reaper must keep working.
