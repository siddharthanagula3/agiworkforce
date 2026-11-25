---
id: "AREA-101"
type: "area"
title: "Shared package boundaries"
features: ["F101-01", "F101-02", "F101-03", "F101-04", "F101-05", "F101-06", "F101-07", "F101-08", "F101-99"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 101. Shared package boundaries

This area keeps the six apps (Web, Desktop, Mobile, CLI, VS Code extension, Chrome extension) in agreement with each other and with the server. They share one set of request and response shapes, error and event names, plan and capability decisions, sign-in and streaming clients, and design tokens, so a change made once reaches every app. A person does not see this area directly. They feel it as a new device sign-in that works, chats that sync between devices, and a plan that means the same thing on every screen. Without it, each app keeps its own copy of the rules, they drift apart, and one app shows a limit or status the server does not agree with.

**Who uses it.** Developers who change shared packages, shared client code, or the CI guard scripts (scripts/check-*.mjs). The six apps use the shared code at run time, so every user of every app is affected indirectly. Workspace admins feel the plan rules through the organization entitlement code (apps/web/lib/services/org-entitlements.ts). The code shows no separate user-facing switch for the area as a whole. Only the team artifact sharing check requires a particular plan (team_admin).

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F101-01](F101-01-shared-request-and-response-shapes.md) | Shared request and response shapes | n/a | n/a | n/a | n/a | n/a | n/a |
| [F101-02](F101-02-shared-events-notifications-content-blocks-errors.md) | Shared events, notifications, content blocks, errors and identifiers | n/a | n/a | n/a | n/a | n/a | n/a |
| [F101-03](F101-03-plan-capability-model-and-policy-decisions.md) | Plan, capability, model and policy decisions | n/a | n/a | n/a | n/a | n/a | n/a |
| [F101-04](F101-04-sign-in-api-and-streaming-clients.md) | Sign-in, API and streaming clients | n/a | n/a | n/a | n/a | n/a | n/a |
| [F101-05](F101-05-conversation-state-sync-and-agent-tasks.md) | Conversation state, sync and agent tasks | n/a | n/a | n/a | n/a | n/a | n/a |
| [F101-06](F101-06-tools-approvals-skills-and-the-coding-session-prot.md) | Tools, approvals, skills and the coding-session protocol | n/a | n/a | n/a | n/a | n/a | n/a |
| [F101-07](F101-07-design-tokens-ui-primitives-text-and-markdown.md) | Design tokens, UI primitives, text and Markdown | n/a | n/a | n/a | n/a | n/a | n/a |
| [F101-08](F101-08-telemetry-configuration-security-helpers-and-packa.md) | Telemetry, configuration, security helpers and package runtimes | n/a | n/a | n/a | n/a | n/a | n/a |
| [F101-99](F101-99-other-items.md) | Other items in Shared package boundaries | n/a | n/a | n/a | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/101-shared-package-boundaries.md](../../10-requirements/capabilities/101-shared-package-boundaries.md).

## How this area works in the code

1. **Contract declared once.** Each wire message is a zod schema in the cloud contracts package. Device sign-in has four route paths and schemas for the start reply, the approval-page lookup, the token reply, the token refusal (a tagged union on the error field), refresh and approve. (`packages/contracts/cloud-contracts/src/device-authorization.ts:3-6`, `packages/contracts/cloud-contracts/src/device-authorization.ts:9-16`, `packages/contracts/cloud-contracts/src/device-authorization.ts:33-40`, `packages/contracts/cloud-contracts/src/device-authorization.ts:55-73`)
2. **Identifiers are data, checked by a guard.** The identifier rules are a JSON file loaded into one exported constant. The guard reads every primary key from the migration history and applies these rules, so a bad key fails the build. (`packages/contracts/types/src/identifier-contract.ts:1-10`, `packages/contracts/types/src/identifier-contract.ts:12`, `packages/contracts/types/src/identifier-contract.ts:53`)
3. **Shared client runtime exports the clients.** The client runtime package is the one entry point apps import for device sign-in, auth provider ids, workspace policy, connectors and the event reader. (`packages/client/client-runtime/src/index.ts:117-128`, `packages/client/client-runtime/src/index.ts:130-137`, `packages/client/client-runtime/src/index.ts:155-163`, `packages/client/client-runtime/src/index.ts:172-173`)
4. **Server resolves an organization's plan.** For a team, the plan is read from the owner's subscription on a privileged connection, because a team administrator who is not the owner cannot see that row. The owner's personal plan is then resolved without seats, so a seat cannot entitle its holder to own the team. (`apps/web/lib/services/org-entitlements.ts:38-43`, `apps/web/lib/services/org-entitlements.ts:70-117`)
5. **Plan limits and the artifact sharing check.** The plan becomes shared project and connector limits (a number, or zero for none). Artifact sharing with a team asks whether the team_admin capability is on for the plan. (`apps/web/lib/services/org-entitlements.ts:119-131`, `apps/web/lib/services/org-entitlements.ts:133-138`, `apps/web/lib/services/org-entitlements.ts:155-169`)
6. **Guard keeps one entitlement entry point.** A build-time guard scans the web app. Any module outside the entry point that reads a plan and asks what it allows fails the check, except the listed own-row operations (top-ups, auto-reload, store purchases, account deletion). (`scripts/check-entitlement-entry-point.mjs:19`, `scripts/check-entitlement-entry-point.mjs:26`, `scripts/check-entitlement-entry-point.mjs:40`)
7. **Chat sync on the server and the client.** The server sync route reads the person's own conversations from the database and applies changes. The client conversation record holds the fields sync carries, including a deleted-at tombstone. The mobile store uses the shared sync code. (`apps/web/app/api/chat/sync/route.ts:85-92`, `apps/web/app/api/chat/sync/route.ts:594-600`, `packages/client/sync/src/conversations.ts:6-22`)
8. **Streaming reads through a guarded fetch.** The mobile streaming client sends each request through a guarded fetch, checks the run for a refusal (HTTP 403), and checks for abort after each wait. (`apps/mobile/services/streaming.ts:440-450`)
9. **Start-up configuration check.** The web server validates its environment at start-up. In production, test-mode payment keys are refused unless the explicit override is set. (`apps/web/lib/validate-env.ts:336-342`, `apps/web/lib/validate-env.ts:386`)
10. **Each shared package declares where it may run.** The package runtime file declares each package entry as universal, browser, server, native or asset. A second guard checks each entry's import graph against that declaration. (`scripts/config/package-runtimes.json:1-3`, `scripts/check-package-runtimes.mjs`)

## Files to know

| File | Role |
|---|---|
| `packages/contracts/cloud-contracts/src/device-authorization.ts` | Shared schemas and route paths for device sign-in (start, poll, refresh, approve) and the refusal list. |
| `packages/client/client-runtime/src/index.ts` | Public entry point of the shared client runtime: device sign-in, auth providers, workspace policy, connectors, event reader. |
| `apps/web/lib/services/org-entitlements.ts` | Resolves a team's plan on the server and answers project limits, connector limits and the artifact sharing check. |
| `scripts/check-entitlement-entry-point.mjs` | Guard that fails any plan decision made outside the single entitlement entry point. |
| `packages/contracts/types/src/identifier-contract.ts` | Loads the identifier rules from data and exports them for the identifier guard. |
| `apps/web/app/api/chat/sync/route.ts` | Server side of chat sync: reads the person's owned conversations and applies changes. |
| `packages/client/sync/src/conversations.ts` | Shared client sync for conversations: the record shape and tombstone handling. |
| `apps/mobile/services/streaming.ts` | Mobile streaming client with guarded fetch and refusal handling. |
| `apps/web/lib/validate-env.ts` | Validates the web server environment at start-up, including the production test-key refusal and the override. |
| `scripts/config/package-runtimes.json` | Declares where each shared package entry may run; checked by scripts/check-package-runtimes.mjs. |
| `apps/web/shared/lib/error-utils.ts` | Holds TimeoutError and withTimeout. The brief expects shared error codes here, but the file does not contain them. |
| `apps/mobile/src/ui/theme/tokens.ts` | Mobile colour and radius tokens, read from the design token package. |

## What is stored

- Plan and subscription rows (user id, Stripe subscription id, plan tier), and organization rows (owner user id, Stripe subscription id), read for entitlement: Postgres tables public.organizations and public.subscriptions (apps/web/lib/services/org-entitlements.ts:75-111); read only in this area
- Conversation records (id, title, timestamps, message count, pinned, starred, archived, model, project, deleted-at tombstone, server version): Client store on each synced surface (shape in packages/client/sync/src/conversations.ts:6-22); server copy read by apps/web/app/api/chat/sync/route.ts:89
- Workspace policy cache: Browser local storage via localStorageWorkspacePolicyCache, exported at packages/client/client-runtime/src/index.ts:161 (storage key not opened)
- Domain event names mapped from audit event types: Constant in apps/web/lib/audit-domain-events.ts:17-30; the audit log itself in apps/web/lib/security-audit.ts
- Identifier rules and config key rules: Read-only JSON data loaded by packages/contracts/types/src/identifier-contract.ts:12

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Team artifact sharing capability**: Turns sharing of a published artifact with the workspace on or off by plan (team_admin). (apps/web/lib/services/org-entitlements.ts:22 and :133-138)
- **Shared project and connector limits**: Number of projects and custom connectors a team may share; zero means none. (apps/web/lib/services/org-entitlements.ts:124-129 (from plan product limits))
- **Seats excluded from the personal plan**: A seat in a team never counts toward owning that team. (apps/web/lib/services/org-entitlements.ts:42)
- **Production test-key refusal and override**: Refuses test-mode payment keys in production. The env value AGI_ALLOW_INVALID_ENV=1 lets a billing-degraded incident deploy start anyway. (apps/web/lib/validate-env.ts:336-342 (reads VERCEL_ENV))
- **Production detection**: Marks a deploy as production from the VERCEL_ENV or NODE_ENV values. (apps/web/lib/validate-env.ts:386)
- **Workspace feature policy**: Turns workspace features on or off for a member; polled on an interval. (packages/client/client-runtime/src/index.ts:156-160 (isWorkspaceFeatureEnabled, disabledWorkspaceFeatures, WORKSPACE_POLICY_POLL_INTERVAL_MS))
- **Auth providers and passkey sign-in**: Chooses which sign-in providers are offered and whether passkey sign-in is on. (packages/client/client-runtime/src/index.ts:130-137 (parseAuthProviderIds, passkeySignInEnabled))
- **Mobile feature flags**: Imported by the mobile localisation module; the effect was not established. (apps/mobile/src/i18n/index.ts:7)

## Shared between apps

Shared TypeScript packages used by more than one app: @agiworkforce/cloud-contracts (device sign-in, sync, connectors, audit events, managed media); @agiworkforce/types (identifier contract, plan and limit helpers, product analytics, provider list); @agiworkforce/client-runtime (device sign-in, workspace policy, connectors, event reader, queue and agent activity); @agiworkforce/client/sync (conversation sync); @agiworkforce/ui (web primitives and provider marks, used by web and by desktop through the hosted web app); @agiworkforce/design-tokens (colours, radii, type; used by web, Chrome, VS Code and in part by mobile); @agiworkforce/i18n (strings for web and mobile, and the VS Code catalogue); the secret redaction code under packages/platform/utils. Rust code shared between the CLI and the protocol crate: apps/cli/src/cloud and crates/agiworkforce-protocol (generated TypeScript for the coding protocol). Separate per app: the Chrome side panel reducer (apps/extension/src/features/side-panel/chat-state.ts), the VS Code local runtime client, the Chrome cloud agent client, the Electron developer session service, the CLI's own state and workspace policy code (Rust), and the mobile streaming client.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- nothing noticed

## Not established

- Nothing was run. The task was read-only, so the guards, tests and builds named in the brief were not run; each check's pass or fail status comes from the brief, not from a run.
- The brief's per-app status lines are platform-level only. Which surface has which item is taken from the brief's Unfinished notes, not verified in each app.
- Storage for device sign-in codes and tokens (where refresh tokens are kept on each device) was not opened.
- The sync route's conflict, tombstone and cursor logic was not read in full; only the lines cited above were opened.
- packages/client/client-runtime/src/deviceAuthorization.ts, packages/client/client-runtime/src/workspacePolicy.ts and packages/platform/utils/src/secretRedaction.ts (beyond its first 30 lines) were not read in full.
- The approval page and the device approve route (apps/web/app/api/auth/device/approve) exist, but their code was not read.
- Package names for packages/platform/utils and packages/contracts/types were taken from import lines, not from package manifests.
- Most brief line numbers were not checked; only files in key_files and how_it_works were opened. The brief's error-utils.ts citations were checked and do not exist.
- The effect of the mobile feature flags import (apps/mobile/src/i18n/index.ts:7) was not established.
- The brief's statements about the Electron main process, the CLI and the Chrome sync code were not checked in code.
- The relayed request to test on localhost one surface at a time does not apply to this read-only job; no surface was tested.
