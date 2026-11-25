---
id: "F087-06"
type: "feature"
title: "Model, feature and tool access"
aliases: ["Models (console)", "Model policy", "Feature controls", "Policy page", "Exceptions", "Connectors page", "Connector policy", "Tool policy", "Needs approval", "S87.13", "S87.14", "S87.15"]
area: "87 Enterprise administration screens"
available_on: ["web", "desktop", "cli"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "partial", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S87.13", "S87.14", "S87.15"]
depends_on: ["surface:web", "surface:desktop", "surface:cli", "mode:cloud", "plan:team", "plan:enterprise", "api:PUT /api/settings/organization/model-policy", "api:PATCH /api/settings/organization/policy", "api:GET /api/settings/organization/policy/effective", "api:PUT /api/settings/organization/connector-policy", "api:POST /api/llm/v1/chat/completions", "table:organization_model_policies", "table:organization_connector_policies", "table:organization_admin_policies", "SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-connectors-plugins-and-skills", "SYS-execution-boundaries", "SYS-authorization-and-workspaces", "F087-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F087-06 Model, feature and tool access

Admins choose which providers and models members may use, switch product features on or off with exceptions for roles, groups or people, and set connector tool rules (always allow, needs approval, blocked). The server refuses what is blocked and refuses when the policy cannot be read. The CLI honours only the hooks feature and MCP controls, plus web site rules.

Area: [87. Enterprise administration screens](README.md). Requirement items: [S87.13](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8713), [S87.14](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8714), [S87.15](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8715).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Saves a model policy (allowed and blocked providers and models) and refuses blocked models on managed chat and other model routes with a reason (model-policy/route.ts:80-240; model-policy.ts:227-273); saves feature switches and exceptions that every gate reads (WorkspaceFeatureControls.tsx; managed-compute-gate.ts:205); and saves connector, plugin, MCP host, web domain and tool rules, with the strictest of workspace and member rules winning (connector-policy/route.ts; connector-tool-permissions.ts:503-540).

**Why it exists.** Organisations must control which AI providers see their data, which features exist for staff, and which actions an AI agent may take.

**Who uses it.** Owners and admins with policy.manage.

**Problems it solves**

- Staff using unapproved providers or models.
- Risky features such as computer use or remote control being open to all.
- Agents writing to connected apps without approval.

**Use cases**

- Block one provider for the whole workspace.
- Turn off Computer use for everyone but one group.
- Mark every write tool of a connector as 'Needs approval'.
- Explain to an employee why a model is refused.

## 2. User experience

**Where to find it**

- Web: console 'Controls' section: 'Models' (/workspace/models), 'Policy' (/workspace/policy), 'Connectors' (/workspace/connectors) (WorkspaceConsoleNav.tsx:73-95).
- Desktop: hosted web pages [inferred]; the internal desktop source hides sidebar features that are off (desktop/src/features/v3/useWorkspacePolicy.ts:53-64).
- CLI: no screens; the CLI reads the policy (cloud/workspace_policy.rs).
- Mobile, VS Code, Chrome: nothing found.

**Before you start**

- Team or Enterprise plan; policy.manage to change; any member may read the model and connector policy so clients can explain refusals (model-policy/route.ts:136-157).
- Feature switches only apply after a workspace policy is saved (WorkspaceFeatureControls.tsx:306).

**Screens and controls**

- Models page: provider and model lists, 'Filter models', 'Save model policy', note 'No restriction is in force. Every model in the catalog is available to members.' (WorkspaceModelPolicy.tsx:281,387,401).
- Policy page: feature switches for Work, Code, Research, Projects, Skills, Plugins, Hooks, Browser, Computer use, Remote control, Schedules, Event triggers, Artifact connectors, Fast mode; 'Save features and defaults'; 'Exceptions' with 'Exception applies to', 'Who the exception applies to', 'Save exception', 'Remove exception' (WorkspaceFeatureControls.tsx:35-49,324,531).
- Connectors page: 'Catalog connectors' with, per connector, Read-only tools and Write tools set to 'Member decides', 'Always allow', 'Needs approval', 'Blocked' (WorkspaceConnectorPolicy.tsx:411-424,669).
- 'Explain a member's policy' card (see F087-01).

**Journey**

1. Open Models; pick providers and models to allow or block; Save model policy.
2. Open Policy; save the base policy, then switch features and add exceptions; Save.
3. Open Connectors; choose connector rules and web or MCP host lists; save.
4. Members see changes on their next request; check with the diagnostics card.

**What the person sees and gets**

- Saving a model in both lists is refused: 'A model cannot be both approved and blocked'.
- Unknown model or provider ids are refused as governing nothing.
- For members: refusal text such as 'Your workspace administrator has blocked the model ...' (model-policy.ts:240).
- Policy page text: 'Members already using it are stopped on their next request.' (WorkspaceFeatureControls.tsx:189).

**Settings**

- Exception precedence: personal beats group beats role beats defaults (WorkspaceFeatureControls.tsx:403).
- Model catalog is the only source of selectable model ids (model-policy/route.ts:46-60).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Model policy GET/PUT with contradiction check, catalog check, privileged write, audit diff (model-policy/route.ts:93-240).
- Model refusal on chat (request-processor.ts:5050), embeddings, transcription, speech, artifact completion and other routes through buildModelPolicyGateResponse (managed-compute-gate.ts:411-436; callers found by search).
- Unavailable policy returns 503 with a retry header, not an allow (model-policy-gate.ts:26-34; managed-compute-gate.ts:168-175).
- Feature gate reused on 21 call sites via buildWorkspaceFeatureGateResponse (search count).
- Connector policy including tool rules, merged into each turn with stricter-wins (connector-tool-permissions.ts:503-540,655-657).
- Effective policy endpoint feeds clients (policy/effective/route.ts:23).
- CLI: feature 'hooks' and MCP controls from the effective policy, cached, sealed and refreshed hourly; fail closed when unknown (workspace_policy.rs:13-27,359-380,752-780).
- CLI also reads the connector policy for web site rules on web_search and web_fetch, refusing when unreadable (claude_parity.rs:2537-2700; features/exec/tools/web/site_rules.rs:98).

**Incomplete**

- CLI applies only hooks and MCP code controls from feature access; other switches are not read there (search of feature_enabled callers found only hooks).
- CLI shows connector tool rules in text but no CLI file was found applying allow, ask or block to connector tools on its own (claude_parity.rs:2808-2825); on managed turns the server decides [inferred].
- The brief's desktop evidence (developerSessionService.ts:725) does not contain a workspace gate; no workspace feature check was found in the Electron runtime files read.
- Missing feature entries default to enabled when a policy is present (workspace_policy.rs:128-133).

**Present but disconnected or switched off**

- The CLI's local policy.toml and managed policy files are a separate local mechanism, not this workspace policy (features/exec/tools/mod.rs:592-640).

**Not available**

- Mobile and Chrome: no workspace model or feature policy reads found in their source folders (search).
- Own-key and Local mode: model policy runs in the cloud routes; no on-device enforcement found.

## 4. Required behaviour

**Established requirements**

- An administrator allows or blocks providers and models, and requests for a blocked model are refused. (source: S87.13 Should)
- An administrator switches product features on or off (with exceptions) and each switched-off feature is refused wherever it runs. (source: S87.14 Should)
- An administrator decides which tools members and agents may use (allow, block or require approval) and the tool loop enforces it. (source: S87.15 Should)
- Source permissions and workspace policy apply to direct API calls as well as the UI; writes needing approval cannot run before it. (source: docs/product/experience-contract.md:787 (W14))
- Model, connector and sharing policy preserve isolation. (source: docs/product/experience-contract.md:795 (W22))

**Acceptance criteria**

1. A blocked model returns 403 with the administrator's reason on a chat request; Auto routing never lands on it.
2. A provider on the blocked list refuses all its models.
3. A feature turned off for the workspace is refused for a member and allowed for a person with an exception.
4. With the policy store unreadable a governed request returns 503, not success.
5. A connector write tool set to 'Blocked' is not offered to the model; set to 'Needs approval' it pauses for approval.
6. The CLI refuses hooks when the workspace turns hooks off and when the policy is unknown.
7. Saving a model in both lists returns 400.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Desktop and web parity on feature switches is by the shared server gates because the Electron window shows the hosted app [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make the CLI read every feature switch it can act on, or document that only hooks and MCP apply.
- [proposed] Show on mobile why a model or connector is unavailable.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Models page | `apps/web/app/workspace/models/page.tsx` | Console page. |
| component | WorkspaceModelPolicy | `apps/web/features/workspace-console/components/WorkspaceModelPolicy.tsx` | Model policy editor. |
| endpoint | GET/PUT /api/settings/organization/model-policy | `apps/web/app/api/settings/organization/model-policy/route.ts` | Read and save model policy. |
| service | model-policy-service | `apps/web/lib/services/model-policy-service.ts` | Read, upsert, diff, limits. |
| service | model-policy-gate | `apps/web/lib/services/model-policy-gate.ts` | Per request evaluation, 503 on unavailable. |
| service | evaluateModelAccess | `packages/ai/routing/src/model-policy.ts` | One evaluator used by routing and gates. |
| service | managed-compute-gate | `apps/web/lib/managed-compute-gate.ts` | Feature and model gate responses (403, 503). |
| component | WorkspaceFeatureControls | `apps/web/features/workspace-console/components/WorkspaceFeatureControls.tsx` | Feature switches and exceptions. |
| endpoint | GET/PATCH /api/settings/organization/policy | `apps/web/app/api/settings/organization/policy/route.ts` | Save workspace policy with revision headers. |
| endpoint | /api/settings/organization/policy/overrides | `apps/web/app/api/settings/organization/policy/overrides` | Exceptions for roles, groups, people. |
| endpoint | GET /api/settings/organization/policy/effective | `apps/web/app/api/settings/organization/policy/effective/route.ts` | Effective controls for clients including CLI and desktop. |
| service | organization-policy-gate | `apps/web/lib/services/organization-policy-gate.ts` | Reads layered policy and overrides, fail closed. |
| service | organization-policy-evaluator | `apps/web/lib/services/organization-policy-evaluator.ts` | Decision codes and rules. |
| screen | Connectors page | `apps/web/app/workspace/connectors/page.tsx` | Console page. |
| component | WorkspaceConnectorPolicy | `apps/web/features/workspace-console/components/WorkspaceConnectorPolicy.tsx` | Connector, domain and tool rule editor. |
| endpoint | GET/PUT /api/settings/organization/connector-policy | `apps/web/app/api/settings/organization/connector-policy/route.ts` | Read and save connector policy. |
| service | connector-policy-service | `apps/web/lib/services/connector-policy-service.ts` | Storage of connector, plugin, host, domain and tool rules. |
| service | connector-tool-permissions | `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts` | Merges workspace tool rules into each turn. |
| endpoint | POST /api/llm/v1/chat/completions | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Chat route that loads tool permissions and builds the catalog. |
| service | CLI workspace policy | `apps/cli/src/cloud/workspace_policy.rs` | Sealed cache, hooks and MCP refusal. |
| service | CLI connector policy and site rules | `apps/cli/src/claude_parity.rs` | Reads connector policy; web site rules. |
| hook | Desktop useWorkspacePolicy | `apps/desktop/src/features/v3/useWorkspacePolicy.ts` | Hides disabled features in the internal desktop sidebar. |
| table | organization_model_policies | `apps/web/lib/services/model-policy-service.ts` | Model policy storage. |
| table | organization_connector_policies | `apps/web/lib/services/connector-policy-service.ts` | Connector policy storage. |
| table | organization_admin_policies / organization_policy_overrides | `apps/web/lib/services/organization-policy-service.ts` | Feature switches and exceptions. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Admin saves a model policy; the route checks Team plan and policy.manage, validates against the catalog, writes with a privileged connection, and records an audit diff. | our servers | model-policy/route.ts:160-235 |
| A member sends a chat; the request processor resolves the model, then evaluates the workspace model policy and refuses with 403 and a code, or 503 if unreadable. | our servers | request-processor.ts:5050; model-policy-gate.ts:26-34,123-136 |
| Auto routing filters the plan against the policy before picking a model. | our servers | model-policy-evaluator.ts:1-12 (comment: evaluator lives with the router and resolveAutoRoute filters the plan) |
| A gated feature request calls the workspace feature gate; an unreadable policy is a refusal. | our servers | managed-compute-gate.ts:164-176,205 |
| On a chat turn, the member's saved tool verdicts and the workspace tool rules are merged, stricter wins; denied tools are not offered and ask-level tools pause for approval. | our servers | connector-tool-permissions.ts:503-540,655-657; completions/route.ts:841-853 |
| The CLI fetches the effective policy hourly, seals it on disk, and refuses hooks or MCP servers when the workspace disallows or the policy is unknown. | device and our servers | workspace_policy.rs:13-19,359-380,752-780,912 |
| Own-key or Local turns on a device do not pass these server gates; no on-device enforcement of model policy was found. | device | search of mobile, extension and desktop electron found no model-policy reads |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Model policy lists | table organization_model_policies | Server only; read by clients on demand | Retired model ids stay stored (model-policy/route.ts:46-52) |
| Feature switches, exceptions, revision | tables organization_admin_policies, organization_policy_overrides | Effective policy fetched by CLI and desktop | Revision history table organization_policy_revisions read by posture |
| Connector policy and tool rules | table organization_connector_policies | Fetched by CLI | unknown |
| CLI sealed policy cache | workspace-policy.json under the CLI cloud directory, sealed with a key in the OS credential store | Refreshed hourly | Rejected after 7 days (workspace_policy.rs:20-22) |

**Models and providers.** The policy lists provider and model ids chosen from the generated model catalog, not typed text. The evaluator is shared with routing so Auto never selects a blocked model. No specific provider code was needed.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in workspace member; the CLI needs a managed (Cloud) sign-in to read the policy (workspace_policy.rs:783-787). |
| Permissions | policy.manage to change; any member reads model and connector policy; diagnostics need policy.manage. |
| Subscription | Team or Enterprise for the console (team-admin-access.ts:70-84). Billing hold on a workspace can also refuse requests (organization-policy-gate.ts:126-131). |
| Limits and metering | Model policy list sizes bounded by MODEL_POLICY_LIMITS (model-policy/route.ts:41-44). Rate limit buckets settings-org and settings-org-patch. No usage metering for the policy itself. |
| Feature flags | none found in the code |
| Model compatibility | Policy ids must exist in the catalog; retired ids stay stored but cannot be newly added (model-policy/route.ts:46-52). |
| Provider restrictions | Allowed and blocked provider lists; blocked wins over allowed (model-policy.ts:167-273). |
| Local mode | The server gates do not run for Local inference on the device; no rule from this feature was found applying there. The CLI in non-managed modes does not fetch the workspace policy (workspace_policy.rs:783-787), but web site rules still bind Local and BYOK web tools (claude_parity.rs:2530-2535). Whether a workspace member may use Local or own-key at all is governed by privacy modes on the Policy page (posture row 'Allowed privacy modes', workspace-posture-service.ts:531-532); enforcement on device was not traced. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No policy configured | 'No restriction is in force'; posture shows Not configured. | WorkspaceModelPolicy.tsx:387 |
| Policy store unreadable | 503 with retry header; CLI treats as refuse. | model-policy-gate.ts:26-34; workspace_policy.rs:359-363 |
| Contradiction on save | 400 naming the model or provider. | model-policy/route.ts:93-117 |
| Unknown id | 400 'would govern nothing'. | model-policy/route.ts:197-209 |
| Feature controls before policy saved | Note says nothing is enforced yet. | WorkspaceFeatureControls.tsx:306 |
| Unsaved draft | Unsaved-changes guard on the console editors. | WorkspaceFeatureControls.tsx:4 (useUnsavedChangesGuard) |
| CLI cache too old or tampered | Ignored until a fresh read. | workspace_policy.rs:15-22,299-310 |
| Existing sessions | Stopped on the next request. | WorkspaceFeatureControls.tsx:189 |
| Offline | CLI: unread policy keeps MCP servers off with a message. Web: not handled beyond errors. | workspace_policy.rs:386-390 (unread_mcp_policy_refusal); web components searched, no offline handling found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/settings/organization/model-policy/__tests__/route.test.ts`: Model policy route.
- `apps/web/lib/services/__tests__/model-policy-evaluator.test.ts`: Evaluator.
- `apps/web/lib/services/__tests__/model-policy-gate.test.ts`: Gate.
- `packages/ai/routing/src/__tests__/model-policy-totality.test.ts`: Evaluator totality, by file name.
- `apps/web/lib/__tests__/managed-compute-gate.workspace-policy.test.ts`: Feature gate with workspace policy.
- `apps/web/lib/services/__tests__/organization-policy-evaluator.test.ts`: Policy decisions.
- `apps/web/lib/services/__tests__/organization-policy-gate.test.ts`: Policy gate.
- `apps/web/app/api/settings/organization/policy/__tests__/route.test.ts`: Policy route.
- `apps/web/app/api/settings/organization/policy/__tests__/effective-and-overrides.test.ts`: Effective policy and exceptions.
- `apps/web/app/api/settings/organization/connector-policy/__tests__/route.test.ts`: Connector policy route.
- `apps/web/lib/services/__tests__/connector-policy-gate.test.ts`: Connector gate.
- `apps/web/features/workspace-console/components/__tests__/WorkspaceModelPolicy.test.tsx`: Model UI.
- `apps/web/features/workspace-console/components/__tests__/WorkspaceFeatureControls.test.tsx`: Feature UI.
- `apps/web/features/workspace-console/components/__tests__/WorkspaceConnectorPolicy.test.tsx`: Connector UI.
- `apps/cli/src/cloud/workspace_policy.rs`: About 20 inline unit tests of the sealed cache and refusals.
- `apps/desktop/src/features/v3/__tests__/useWorkspacePolicy.test.tsx`: Desktop nav filtering.

**Test scenarios**

- **Blocked model**
  1. Block a model on Models and save.
  2. As a member send a chat naming it.
  - Expected: 403 with 'Your workspace administrator has blocked the model'.
- **Auto avoids blocked**
  1. Block the provider Auto would pick.
  2. Send a message with Auto.
  - Expected: Answer comes from an allowed model.
- **Feature off with exception**
  1. Turn Computer use off for everyone.
  2. Add an exception for one person.
  3. Check both with Explain.
  - Expected: Everyone else Refused; the person Allowed.
- **Fail closed**
  1. Make the policy tables unreadable in a test environment.
  2. Send a request.
  - Expected: 503 with retry hint.
- **Tool needs approval**
  1. Set Write tools of a connector to 'Needs approval'.
  2. Ask the assistant to perform a write.
  - Expected: The turn pauses for approval; 'Blocked' hides the tool.
- **CLI hooks**
  1. Turn Hooks off in the workspace.
  2. Run the CLI with a hook configured.
  - Expected: Hooks do not run and a warning prints.

**Where to look when it fails**

- Log '[model-policy] request refused by workspace model policy', '[managed-compute-gate] denied by workspace policy', '[connector-permissions] saved tool verdicts unavailable'.
- Decision codes model_blocked, model_not_allowed, provider_blocked, feature_disabled, workspace_policy_unavailable.
- Tables organization_model_policies, organization_connector_policies, organization_admin_policies.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/087-enterprise-administration-screens.md](../../70-qa/test-plans/web/087-enterprise-administration-screens.md)
- Desktop: [70-qa/test-plans/desktop/087-enterprise-administration-screens.md](../../70-qa/test-plans/desktop/087-enterprise-administration-screens.md)
- CLI: [70-qa/test-plans/cli/087-enterprise-administration-screens.md](../../70-qa/test-plans/cli/087-enterprise-administration-screens.md)

## 10. Gaps and dependencies

- **CLI enforces only hooks and MCP code controls from workspace features.** Affects: CLI users. Evidence: feature_enabled callers: hooks only (hooks.rs:1910; hooks_allowed). Work needed: Decide which switches the CLI must honour and wire them.
- **Brief cites a desktop feature gate in developerSessionService.ts that is not there.** Affects: Desktop. Evidence: no workspace policy in electron/runtime/developerSessionService.ts (grep). Work needed: Correct the brief; confirm desktop enforcement is server side.
- **No on-device model policy for Local or own-key turns.** Affects: Desktop and mobile local users in governed workspaces. Evidence: no policy reads in mobile, extension or electron. Work needed: Decide whether Local/BYOK should be governed by workspace policy; if so consent and boundary rules apply.
- **Mobile and Chrome do not explain refusals.** Affects: Mobile, Chrome. Evidence: no policy reads found. Work needed: Show server refusal text.
- **CLI tool rule enforcement for connector tools not found.** Affects: CLI. Evidence: claude_parity.rs only describes tool rules. Work needed: Verify server handles managed CLI turns.

**Depends on**

- surface:web
- surface:desktop
- surface:cli
- mode:cloud
- plan:team
- plan:enterprise
- api:PUT /api/settings/organization/model-policy
- api:PATCH /api/settings/organization/policy
- api:GET /api/settings/organization/policy/effective
- api:PUT /api/settings/organization/connector-policy
- api:POST /api/llm/v1/chat/completions
- table:organization_model_policies
- table:organization_connector_policies
- table:organization_admin_policies
- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-connectors-plugins-and-skills
- SYS-execution-boundaries
- SYS-authorization-and-workspaces
- F087-01

## Unknown

- Whether the Electron app enforces workspace features locally; only the hosted-app server gates were found.
- Privacy-mode (Local or own-key) restrictions: a posture row exists but the enforcement for on-device turns was not traced.
- Exact set of model routes covered by the model gate beyond those found.
- How the chat route handles a connector-policy read error (the read is not wrapped in the function seen).
- Test assertions were not opened.
