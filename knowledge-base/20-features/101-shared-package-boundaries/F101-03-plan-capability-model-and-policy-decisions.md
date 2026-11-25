---
id: "F101-03"
type: "feature"
title: "Plan, capability, model and policy decisions"
aliases: ["entitlement resolution", "org entitlements", "capability handshake", "effective workspace policy", "workspace policy", "shared model metadata", "S101.06", "S101.07", "S101.08", "S101.09"]
area: "101 Shared package boundaries"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S101.06", "S101.07", "S101.08", "S101.09"]
depends_on: ["SYS-subscriptions-entitlements-and-usage", "SYS-authorization-and-workspaces", "SYS-model-catalog-and-routing", "SYS-authentication-and-identity", "table:subscriptions", "table:organizations", "surface:web", "surface:cli", "file:apps/web/lib/services/entitlement-resolution.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F101-03 Plan, capability, model and policy decisions

The server decides what a plan allows, what each app may do and which workspace policy keys apply; clients read that answer. One web entry point resolves plans, including team seats. A shared poller and the CLI enforce workspace policy. Model lists in the Tauri renderer still keep their own copy.

Area: [101. Shared package boundaries](README.md). Requirement items: [S101.06](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10106), [S101.07](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10107), [S101.08](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10108), [S101.09](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10109).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Resolves a user's or organization's plan in one module (apps/web/lib/services/entitlement-resolution.ts:384-437), derives workspace sharing limits from it (apps/web/lib/services/org-entitlements.ts:119-131), serves the capability document to apps, and serves the effective workspace policy that clients and the CLI apply (apps/web/app/api/settings/organization/policy/effective/route.ts:15-59).

**Why it exists.** A module that reads plan_tier itself and decides what it allows tells every seat holder they are on Free (scripts/check-entitlement-entry-point.mjs:3-9). A client that decides a capability again can disagree with the server (scripts/check-capability-consumption.mjs:1-8).

**Who uses it.** Workspace admins who set policy; paid and team users who see options switched on or off; engineers; the CLI and VS Code local runtime that refuse a blocked MCP server.

**Problems it solves**

- Seat holders resolved as Free
- Admin-not-owner seeing 'no subscription' because a scoped connection could not read the owner's row (apps/web/lib/services/org-entitlements.ts:46-60)
- Clients re-deciding capabilities from a static table
- A policy switch the server cannot refuse because the action runs on the user's machine (scripts/config/workspace-policy-enforcement-baseline.json:5)

**Use cases**

- An admin turns off MCP servers for the workspace; the CLI refuses to start one (apps/cli/src/cloud/workspace_policy.rs:371-378)
- A team on a plan with team_admin shares an artifact with the workspace; a plan without it gets a plan-labelled message (apps/web/lib/services/org-entitlements.ts:133-144)
- An admin shares a project; a limit of zero says the plan does not include shared projects (apps/web/lib/services/org-entitlements.ts:155-161)
- A visitor to the marketing page sees the provider list drawn from the catalogue (apps/web/features/marketing/components/RouteFlow.tsx:1-8)

## 2. User experience

**Where to find it**

- Web workspace console: components WorkspaceFeatureControls, WorkspaceCodeControls, WorkspaceConnectorPolicy, WorkspacePolicyDiagnostics (apps/web/features/workspace-console/components)
- Connector policy choices 'Member decides', 'Always allow', 'Needs approval', 'Blocked' (apps/web/features/workspace-console/components/WorkspaceConnectorPolicy.tsx:420-423)
- Web marketing route diagram (apps/web/features/marketing/components/RouteFlow.tsx)
- CLI: refusal text when an MCP server is blocked (apps/cli/src/cloud/workspace_policy.rs:371)
- Desktop: hook apps/desktop/src/features/v3/useWorkspacePolicy.ts

**Before you start**

- A signed-in account; for policy, membership of a workspace; changing policy needs team admin access and the policy.manage permission (apps/web/app/api/settings/organization/connector-policy/route.ts:95-110)

**Screens and controls**

- Workspace console policy panels listed above
- Policy diagnostics surface choices begin 'Web app' (apps/web/features/workspace-console/components/WorkspacePolicyDiagnostics.tsx:43)
- Other visible labels in these panels were not opened

**Journey**

1. Admin changes a policy key in the workspace console
2. Server stores it and bumps a revision
3. Each client polls the effective policy about every 60 seconds and applies it (packages/client/client-runtime/src/workspacePolicy.ts:12)
4. The CLI refreshes hourly and refuses a blocked MCP server (apps/cli/src/cloud/workspace_policy.rs:15-16,371)
5. A user who tries a blocked action sees a refusal or a disabled control

**What the person sees and gets**

- Plan-labelled messages: 'Sharing a published artifact with your workspace is available on ... plans.' (apps/web/lib/services/org-entitlements.ts:140-144)
- Shared project or connector limit messages (apps/web/lib/services/org-entitlements.ts:155-169)
- Effective policy response with ETag and 304 (apps/web/app/api/settings/organization/policy/effective/route.ts:25-33)

**Settings**

- Workspace policy keys: feature access switches and code controls allowMcpServers, allowedMcpServers (apps/web/app/api/settings/organization/policy/effective/route.ts:39-50)
- Connector admin allowlist at /api/settings/organization/connector-policy (scripts/config/workspace-policy-enforcement-baseline.json:9)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- resolveEntitlementBundle, resolveEffectiveSubscription and resolveEntitledPlanTier are exported from one file, and the guard demands they stay (apps/web/lib/services/entitlement-resolution.ts:384,420,431; scripts/check-entitlement-entry-point.mjs:19-24)
- Seats can be turned off with includeSeats:false so an owner's own plan is read (apps/web/lib/services/entitlement-resolution.ts:256,396-399; apps/web/lib/services/org-entitlements.ts:38-43)
- Organization plan resolves on the privileged connection from the owner's subscription row, with fallback when an anchored row no longer exists (apps/web/lib/services/org-entitlements.ts:70-117)
- Team artifact sharing uses the team_admin capability (apps/web/lib/services/org-entitlements.ts:22,133-138)
- Shared project and connector limits come from plan product limits; negotiated Enterprise limits become null (no ceiling) and unknown limits become 0 (apps/web/lib/services/org-entitlements.ts:124-129; apps/web/lib/services/__tests__/org-entitlements-limits.test.ts:8-33)
- Every surface has a recorded reader of the capability document, and the recorded-exception list is empty (scripts/check-capability-consumption.mjs:22-105)
- Effective policy route returns governed true with revision, controls and code controls, or an ungoverned body (apps/web/app/api/settings/organization/policy/effective/route.ts:35-58)
- Shared poller with cache, ETag and a stale flag (packages/client/client-runtime/src/workspacePolicy.ts:12-60)
- CLI keeps a sealed local policy copy, valid 7 days, and refuses an MCP server unless allowed (apps/cli/src/cloud/workspace_policy.rs:20,168,371-378)
- Web marketing and admin panel read the shared catalogue (apps/web/features/marketing/components/RouteFlow.tsx:1; apps/web/features/admin/components/RouteEconomicsPanel.tsx:4)

**Incomplete**

- The Tauri renderer keeps its own Provider union (apps/desktop/src/types/provider.ts:1-27). The brief names also types/media.ts, OnboardingWizard key-prefix detection and a Mobile providerStreamClient.ts; the Mobile file was not found by name (search of apps)
- The baseline says local MCP policy is advisory: it binds the shipped clients, not a person who controls the machine (scripts/config/workspace-policy-enforcement-baseline.json:9)
- The Electron desktop starts no local MCP servers, and the Tauri build does not enforce these keys (scripts/config/workspace-policy-enforcement-baseline.json:9)

**Present but disconnected or switched off**

- Workspace MCP keys do not govern chat connectors; those answer to the connector allowlist (scripts/config/workspace-policy-enforcement-baseline.json:9)

**Not available**

- Per-plan names and numbers were not opened for this page; see SYS-subscriptions-entitlements-and-usage

## 4. Required behaviour

**Established requirements**

- Capabilities are resolved once on the server and every client reads that decision instead of deciding locally. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S101.07)
- Plan entitlements are resolved through one server entry point from one shared plan vocabulary. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S101.08)
- Workspace policy keys are declared once and every declared key is enforced by the server. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S101.09)
- Model metadata comes from one compiled registry shared by TypeScript and Rust, with no private copies in clients. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S101.06)
- A seat in the organization being asked about must never entitle its holder to own it. (source: apps/web/lib/services/org-entitlements.ts:34-36)
- Local is free to use where technically available; the subscription system covers every capability on every app. (source: (doc: docs/product/commercial.md:22))

**Acceptance criteria**

1. A module under apps/web/lib or apps/web/app that reads plan_tier from subscriptions and calls a plan predicate fails check:entitlement-entry-point unless listed with a reason
2. A seat holder in a team gets the workspace's plan, not Free
3. An organization admin who is not the owner sees the owner's plan on the organization routes
4. With sharing off on the plan, artifact sharing returns the plan-labelled message
5. A shared project limit of 0 shows the 'does not include shared projects' message
6. A signed-in CLI user with no fresh or sealed policy starts no MCP server after a 5 second wait
7. A signed-out CLI is ungoverned (apps/cli/src/cloud/workspace_policy.rs:107-112)

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Model metadata in the Tauri build should come from the shared catalogue [inferred from S101.06]
- Policy refusal text for the CLI should name the workspace as the reason [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Replace the Tauri Provider union with the shared one or mark the Tauri build as out of scope
- [proposed] Show the policy revision a client applied in policy diagnostics

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | Entitlement resolution | `apps/web/lib/services/entitlement-resolution.ts` | Single entry point for plan tier, seats and bundles |
| service | Organization entitlements | `apps/web/lib/services/org-entitlements.ts` | Org plan, shared project and connector limits, artifact sharing |
| command | check:entitlement-entry-point | `scripts/check-entitlement-entry-point.mjs` | Fails private plan decisions |
| command | check:capability-consumption | `scripts/check-capability-consumption.mjs` | Each surface must read the capability document |
| endpoint | Effective workspace policy | `apps/web/app/api/settings/organization/policy/effective/route.ts` | Serves policy with ETag |
| endpoint | Connector policy | `apps/web/app/api/settings/organization/connector-policy/route.ts` | Admin read and write of the connector allowlist |
| schema | Workspace controls types | `packages/contracts/types/src/enterprise/workspace-controls.ts` | Policy path, schema version 3, feature list |
| service | Shared policy poller | `packages/client/client-runtime/src/workspacePolicy.ts` | Polls, caches and exposes snapshots to web and desktop |
| hook | Web workspace policy hook | `apps/web/shared/hooks/use-workspace-policy.ts` | Wires the poller to the web app |
| hook | Desktop workspace policy hook | `apps/desktop/src/features/v3/useWorkspacePolicy.ts` | Desktop use of the policy |
| service | CLI workspace policy | `apps/cli/src/cloud/workspace_policy.rs` | Fetch, seal, cache and enforce policy in Rust |
| config | Policy enforcement baseline | `scripts/config/workspace-policy-enforcement-baseline.json` | Records keys served to clients and why |
| component | Marketing route diagram | `apps/web/features/marketing/components/RouteFlow.tsx` | Reads PROVIDERS_IN_ORDER |
| component | Admin route economics panel | `apps/web/features/admin/components/RouteEconomicsPanel.tsx` | Reads COMPAT_CAPABILITY_SOURCES |
| component | Workspace connector policy panel | `apps/web/features/workspace-console/components/WorkspaceConnectorPolicy.tsx` | Admin choices for connectors |
| hook | Client capability readers | `apps/mobile/src/features/billing/store.ts` | Mobile reads capability_handshake (guard reader) |
| table | subscriptions | `apps/web/lib/services/org-entitlements.ts` | Owner's plan row read for organization plan |
| table | organizations | `apps/web/lib/services/org-entitlements.ts` | Holds owner and the subscription anchor |
| component | Tauri provider types | `apps/desktop/src/types/provider.ts` | Private provider union (gap) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A client calls /api/me and reads capability_handshake | device and our servers | scripts/check-capability-consumption.mjs:22-104 |
| The server resolves the plan through the entry point, including seat plans | our servers | apps/web/lib/services/entitlement-resolution.ts:384-437 |
| For an organization it resolves the owner's plan on a privileged connection after membership was checked | our servers | apps/web/lib/services/org-entitlements.ts:46-69 |
| Client polls the effective policy and uses the cached copy if the call fails | device and our servers | packages/client/client-runtime/src/workspacePolicy.ts:12-60 |
| The CLI fetches the policy, seals a cache copy and checks each MCP server before start | device and our servers | apps/cli/src/cloud/workspace_policy.rs:14-20,371-378,783 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Subscription and organization rows | table:subscriptions and table:organizations | server only | unknown here; see SYS-subscriptions-entitlements-and-usage |
| Web policy cache | browser storage key prefix 'agi.workspace-policy.' | no | overwritten by each fetch (apps/web/shared/hooks/use-workspace-policy.ts:14) |
| CLI sealed policy cache | workspace-policy.json in the CLI cloud directory, sealed with a key in the OS credential store | no | valid 7 days; older needs a fresh read (apps/cli/src/cloud/workspace_policy.rs:20,60-95,168) |

**Models and providers.** The plan decides which models and routes are offered; that table is owned by SYS-model-catalog-and-routing. The files opened here only read provider lists (RouteFlow.tsx:1-8).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required for entitlements and policy; a signed-out CLI is ungoverned (apps/cli/src/cloud/workspace_policy.rs:107-112). |
| Permissions | Reading organization policy needs membership; changing connector policy needs team admin access and policy.manage (apps/web/app/api/settings/organization/connector-policy/route.ts:95-110). |
| Subscription | team_admin capability gates workspace artifact sharing (apps/web/lib/services/org-entitlements.ts:22,133-138). Plan names and per-plan limits: see SYS-subscriptions-entitlements-and-usage. |
| Limits and metering | Shared project and shared connector limits per plan (apps/web/lib/services/org-entitlements.ts:124-129); policy polling every 60 seconds on shared clients, hourly on the CLI (packages/client/client-runtime/src/workspacePolicy.ts:12; apps/cli/src/cloud/workspace_policy.rs:15). |
| Feature flags | none found in the code for this feature's own logic. |
| Model compatibility | none found in the code. |
| Provider restrictions | Workspace model policy panel exists (apps/web/features/workspace-console/components/WorkspaceModelPolicy.tsx) but was not opened. |
| Local mode | A signed-out CLI gets a policy marked ungoverned (apps/cli/src/cloud/workspace_policy.rs:107-112). For a signed-in account with no fresh or sealed policy, the CLI starts no MCP server (scripts/config/workspace-policy-enforcement-baseline.json:9). Other Local mode behaviour: none found in the code. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Seat holder | Gets the workspace plan through the entry point | apps/web/lib/services/entitlement-resolution.ts:140-147 |
| Org anchor points at a subscription that no longer exists | Falls back to the owner's row | apps/web/lib/services/org-entitlements.ts:61-69,81-90 |
| No subscription | Free plan | apps/web/lib/services/org-entitlements.ts:115 |
| Policy unchanged | 304 on matching ETag | apps/web/app/api/settings/organization/policy/effective/route.ts:30-33 |
| Offline CLI, first run, signed in | No MCP server starts after a 5 second wait | scripts/config/workspace-policy-enforcement-baseline.json:9; apps/cli/src/cloud/workspace_policy.rs:17 |
| Cached policy older than 7 days or tampered | Ignored; a fresh read is needed | apps/cli/src/cloud/workspace_policy.rs:20,163-169 |
| Limit message when limit is null | Says 'cannot share more projects right now' | apps/web/lib/services/org-entitlements.ts:156 |
| Accessibility of policy panels | not handled in the code opened; panels not opened | apps/web/features/workspace-console/components (listing only) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/org-entitlements-plan.test.ts`: Organization plan resolution
- `apps/web/lib/services/__tests__/org-entitlements-limits.test.ts`: Limit conversion: Enterprise null, unknown 0, no redeclared conversion
- `apps/web/lib/services/__tests__/entitlement-resolution.characterization.test.ts`: Entitlement resolution behaviour
- `packages/client/client-runtime/src/__tests__/workspacePolicy.test.ts`: Shared policy poller
- `packages/client/client-runtime/src/__tests__/workspacePolicy.serverAgreement.test.ts`: Poller agrees with the server body
- `apps/web/shared/hooks/useWorkspacePolicy.test.tsx`: Web policy hook
- `scripts/check-entitlement-entry-point.test.mjs`: Entry-point guard
- `scripts/check-capability-consumption.test.mjs`: Capability reader guard
- `scripts/check-workspace-policy-enforcement.test.mjs`: Policy enforcement guard

**Test scenarios**

- **Seat holder plan**
  1. Add a user as a seat on a paid team
  2. Sign in as that user and open a paid feature
  - Expected: The feature is on; plan is the team's
- **Admin not owner**
  1. Sign in as an admin who is not the owner of an Enterprise workspace
  2. Open workspace settings
  - Expected: Workspace shows its plan, not 'no subscription'
- **MCP policy in CLI**
  1. As admin turn off MCP servers
  2. Wait for refresh or restart the CLI
  3. Start a session with an MCP server
  - Expected: The CLI refuses with a workspace policy reason
- **Offline first run**
  1. Sign in the CLI with no cached policy and no network
  2. Start an MCP server
  - Expected: No server starts after about 5 seconds
- **Share limit zero**
  1. Use a plan whose shared project limit is 0
  2. Try to share a project
  - Expected: Message says the plan does not include shared projects

**Where to look when it fails**

- Guard output of check:entitlement-entry-point
- Response ETag and revision from /api/settings/organization/policy/effective
- Error code P0001 org_resource_limit_reached (apps/web/lib/services/org-entitlements.ts:146-153)

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Tauri renderer keeps private provider and media type lists** Affects: Desktop (internal Tauri build). Evidence: apps/desktop/src/types/provider.ts:1-27. Work needed: Read provider ids from the shared catalogue
- **Brief lists a Mobile provider stream client with its own list; not found by name** Affects: Mobile. Evidence: search of apps for providerStreamClient found nothing. Work needed: Locate the file or correct the brief
- **Local MCP policy is advisory only** Affects: CLI, VS Code local runtime. Evidence: scripts/config/workspace-policy-enforcement-baseline.json:9. Work needed: Accept as documented, or add a server-side control
- **null limit text is ambiguous: a null limit with a limit error reads as 'cannot share right now'** Affects: Workspace admins. Evidence: apps/web/lib/services/org-entitlements.ts:156,164. Work needed: Decide the wording for an unbounded plan

**Depends on**

- SYS-subscriptions-entitlements-and-usage
- SYS-authorization-and-workspaces
- SYS-model-catalog-and-routing
- SYS-authentication-and-identity
- table:subscriptions
- table:organizations
- surface:web
- surface:cli
- file:apps/web/lib/services/entitlement-resolution.ts

## Unknown

- Plan names and per-plan numbers (not opened; plan:<name> not used)
- Whether every surface other than CLI enforces each policy key in the UI
- Where the Mobile provider stream client lives
- Whether the entry-point and capability guards pass today; nothing was run
- How Mobile and Chrome show a plan-gated option
- Contents of Tauri types/media.ts and the OnboardingWizard key-prefix check
