---
id: "F079-06"
type: "feature"
title: "Privacy-first routing"
aliases: ["privacy-first routing", "privacy-first profile", "zero data retention", "Zero data retention only", "no-training opt-out", "Only use models that do not train on your chats", "trust boundary", "privacy boundary", "Local / Your own keys / Cloud", "US-only provider routing", "validate_privacy_boundary"]
area: "79 Routing and model-neutral orchestration"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S79.08"]
depends_on: ["SYS-security-and-privacy", "SYS-execution-boundaries", "SYS-local-inference", "SYS-authorization-and-workspaces", "SYS-model-catalog-and-routing", "F079-01", "F079-04", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:local", "mode:own-key", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F079-06 Privacy-first routing

There is no single privacy-first button. Privacy comes from three modes (Local, own key, Cloud), a workspace zero-data-retention rule, a per-person no-training opt-out and a US-only option. Routing then keeps only routes that pass, and fails with a clear message when none do. On Desktop, chat is Cloud-only in code.

Area: [79. Routing and model-neutral orchestration](README.md). Requirement items: [S79.08](../../10-requirements/capabilities/079-routing-and-model-neutral-orchestration.md#s7908).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Removes routes and models that would keep, train on or move data against the person's or workspace's rules, and refuses requests that would cross a trust boundary without consent. [inferred from auto.ts:1099-1115, request-processor.ts:4694-4700, apps/cli/src/agent/mod.rs:1791-1825]

**Why it exists.** People and workspaces need to know where data goes. Local, own key and Cloud are separate trust boundaries; nothing may move a chat across silently (AGENTS.md §6; brief S79.08).

**Who uses it.** Privacy-conscious people, workspace admins, regulated teams, CLI developers working on private code.

**Problems it solves**

- A chat being used to train a provider's model.
- A Local session leaking to a cloud model.
- A workspace using providers that keep data.

**Use cases**

- Turn on 'Only use models that do not train on your chats'.
- An admin turns on 'Zero data retention only'.
- A CLI Local session refuses a cloud model and points to /continue-with-cloud.
- A Mobile Local Mode chat refuses a Cloud model.

## 2. User experience

**Where to find it**

- Web settings, Privacy section: toggle 'Only use models that do not train on your chats' (apps/web/features/settings/sections/PrivacySection.tsx:62-66).
- Web workspace policy: privacy modes 'Local', 'Your own keys', 'Cloud' and toggle 'Zero data retention only' (WorkspacePolicySection.tsx:73-86, 663-674).
- Web settings: US-only provider routing panel (apps/web/features/settings/components/UsOnlyRoutingPanel.tsx).
- Mobile: separate Local Mode and AGI Cloud chats (chatExecutionStore.ts:2262-2270; capabilities screen 'On this device' apps/mobile/src/features/settings/capabilities/index.tsx:86-100).
- VS Code: model picker section 'Needs setup on this machine' and refusal by privacy mode (reachability.ts:28-48).
- CLI: Local, own-key (BYOK) and Managed sessions; errors name /continue-with-cloud or /continue-with-byok (agent/mod.rs:1791-1810).

**Before you start**

- Admin rights to edit workspace policy; a signed-in account for Cloud.
- Mobile Local chats need an installed on-device model.

**Screens and controls**

- Toggles in Privacy and Workspace policy; privacy-mode list with hints 'On-device models. Nothing leaves the machine.', 'Calls go direct to the provider on your org's keys.', 'AGI-hosted inference, metered to your workspace.'

**Journey**

1. Choose a Local model or turn on the privacy toggles.
2. Send a message.
3. Routing keeps only routes that pass the rules.
4. If none pass, the person sees a message instead of a guess.

**What the person sees and gets**

- 403 no_training_model_available: 'No model on your plan keeps your chats out of training right now.' (request-processor.ts:3214-3232).
- Named model that may train: MODEL_MAY_TRAIN message (request-processor.ts:3239-3250).
- Workspace zero-retention text: 'Requests that cannot are refused, not rerouted.' (WorkspacePolicySection.tsx:665).
- CLI: 'Privacy boundary blocked: this session is Local, but model ... routes to ...' with the handoff command (agent/mod.rs:1795-1810).

**Settings**

- User setting keepOutOfProviderTraining (PrivacySection.tsx:62).
- Workspace policy fields allowedPrivacyModes, defaultPrivacyMode, zeroDataRetentionOnly (WorkspacePolicySection.tsx:73-86, 232-245, 664).
- US-only routing preference for the max and enterprise tiers (routing-policies.json providerPolicies.usOnly).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Zero data retention keeps only routes whose retention class is zero, or conditional with the harness honouring it per request, or a provider listed by an override (packages/ai/routing/src/auto.ts:1099-1111).
- No-training admission applies at model level and route level, also to a named model (auto.ts:1112, 1374; comment lines 182-195).
- Web reads the opt-out and fails closed to 'opt-out on' if the read fails; Health space and Google user data also force it (request-processor.ts:3590-3625).
- If no managed provider survives the opt-out the request returns 403 no_training_model_available (request-processor.ts:4694-4700).
- On Free, an opted-out account is moved to a no-training chat model for its plan or refused (request-processor.ts:3665-3673).
- The out-of-credit swap and failover re-check the opt-out (request-processor.ts:6060-6075; managed-failover.ts header).
- Workspace model policy is read before routing and a policy that cannot be read refuses the turn (request-processor.ts:4690-4693).
- Workspace residency pin and US-only add region and jurisdiction rules (request-processor.ts:4712-4730, auto.ts:1378-1385).
- CLI validate_privacy_boundary runs before each turn and blocks Local-to-cloud, mismatched modes and outside-boundary memory (apps/cli/src/agent/mod.rs:1791-1825; agent/chat.rs:977, 1158, 1727, 2184).
- CLI --auto is forced to Managed, never to own key or Local (lib.rs:8073).
- VS Code allows local only in a Local privacy mode, local plus own key in own-key mode, all in Cloud mode (reachability.ts:28-48).
- Mobile Local Mode chats refuse Cloud models (chatExecutionStore.ts:2262-2270).

**Incomplete**

- Mobile's on-device Auto call passes no no-training or zero-retention flag (cloudDispatchRouting.ts:82-96); [inferred] the server enforces them when the named model arrives.
- Zero data retention is a workspace rule only; no per-person control was found in the Privacy section (PrivacySection.tsx toggles read).
- Desktop Electron cannot run Local chat: the shell refuses on-device inference and reports localModels false; local sessions go through the bundled CLI (apps/desktop/electron/runtime/dispatcher.ts:2298, 3235-3243).

**Present but disconnected or switched off**

- allowedTrustModes on the router is never set by a production caller (auto.ts:342; grep).
- Workspace allowedPrivacyModes enforcement on the server routing path was not found; it is read by client-runtime workspace policy code (packages/client/client-runtime/src/__tests__/workspacePolicy.test.ts exists).

**Not available**

- Chrome: Cloud-only product, no local or own-key mode (docs/product/experience-contract.md section 12.6).
- A single 'privacy-first' profile or button does not exist; brief lists the item as done, but it is composed from the controls above.

## 4. Required behaviour

**Established requirements**

- A privacy-first profile keeps requests on local models or zero-retention routes. (source: brief S79.08)
- Local, own key and Cloud are separate trust boundaries; nothing may silently route a Local chat, file or session to own key or managed cloud; a Local-to-own-key move is an explicit fork with consent and a visible provider label. (source: doc: AGENTS.md §6)
- Security behaviour fails closed; routing never relies on registry membership to cross boundaries. (source: doc: AGENTS.md §6)
- Avoid silent cloud routing in developer workflows. (source: doc: docs/product/requirements.md:372)
- The Settings founder decision lists privacy-related routing profiles among cells covered for Chrome and others. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:370-390 (S79.08))

**Acceptance criteria**

1. With the no-training toggle on, a Web turn is answered only by a provider that keeps inputs out of training; if none exists the person sees 403 no_training_model_available.
2. With workspace zero data retention on, a request whose every route lacks zero retention is refused, not rerouted.
3. In a CLI Local session, choosing a model that routes to Cloud gives 'Privacy boundary blocked' and names /continue-with-cloud.
4. A Mobile Local chat cannot send to a Cloud model.
5. Naming a model that may train, with the opt-out on, is refused with the may-train message.
6. When the opt-out cannot be read, the turn behaves as if it were on.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Desktop 'Local' premise (free local inference on desktop) conflicts with the Cloud-only Electron chat; the local path for desktop is the bundled CLI. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add one visible 'Private' choice that sets the Local/own-key/Cloud boundary, zero retention and no-training together and shows the provider label.
- [proposed] Give individuals a zero-data-retention toggle.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | route admission rules | `packages/ai/routing/src/auto.ts` | Zero retention, no-training, region, policy on routes and models (1060-1125, 1340-1390). |
| service | trustModeRejection | `packages/ai/routing/src/auto.ts` | Refuses a disallowed trust mode, also for named models (line 1691). |
| service | managedCloudRoutingRequest and admission | `apps/web/lib/server/managed-cloud-routing/admission.ts` | Builds per-account policy into routing for side calls and refuses when unreadable. |
| service | policy-source | `apps/web/lib/server/managed-cloud-routing/policy-source.ts` | Reads opt-out, zero retention, model policy, region and US-only with safe defaults. |
| service | provider-training-opt-out | `apps/web/lib/server/provider-training-opt-out.ts` | readProviderTrainingOptOut and model keeps-out check. |
| service | chat route privacy handling | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Opt-out read, 403 text, free-plan model, credit swap guard (3214-3250, 3590-3673, 4690-4730, 6052-6075). |
| service | managed-failover | `apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.ts` | Re-checks no-training on every hop. |
| component | PrivacySection | `apps/web/features/settings/sections/PrivacySection.tsx` | Toggle 'Only use models that do not train on your chats'. |
| component | WorkspacePolicySection | `apps/web/features/settings/sections/WorkspacePolicySection.tsx` | Privacy modes and zero data retention toggle. |
| component | UsOnlyRoutingPanel | `apps/web/features/settings/components/UsOnlyRoutingPanel.tsx` | US-only provider routing control. |
| service | organization-policy-gate | `apps/web/lib/services/organization-policy-gate.ts` | resolveZeroDataRetentionPolicy. |
| service | CLI privacy boundary | `apps/cli/src/agent/mod.rs` | validate_privacy_boundary (1791-1825). |
| service | CLI turn guards | `apps/cli/src/agent/chat.rs` | Calls the boundary check before turns (977, 1158, 1727, 2184). |
| command | /continue-with-cloud and /continue-with-byok | `apps/cli/src/agent/mod.rs` | Named in the refusal text as the consented handoff. |
| service | VS Code reachability | `apps/extension-vscode/src/features/model-picker/reachability.ts` | PRIVACY_ALLOWS table and refused boundary (28-48). |
| service | mobile Local/Cloud guard | `apps/mobile/stores/chat/chatExecutionStore.ts` | Refuses Cloud model in Local chat (2262-2270). |
| screen | mobile capabilities | `apps/mobile/src/features/settings/capabilities/index.tsx` | 'On this device' section and Cloud sign-in state. |
| service | desktop local inference refusal | `apps/desktop/electron/runtime/dispatcher.ts` | Refuses on-device inference commands (3235-3243). |
| config | usOnly provider policy | `packages/ai/model-registry/catalog/routing-policies.json` | Allowed tiers and excluded providers for US-only. |
| test | trust boundary tests | `apps/web/__tests__/trust-boundary.test.ts` | Per-surface trust boundary test (one per app). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Server reads training opt-out (and Health and Google-data conditions), zero-retention rule, workspace model policy and region in parallel before routing. | our servers | request-processor.ts:3590-3625, 4640-4700 |
| Managed providers are filtered to those that keep inputs out of training when the opt-out is on; none left gives 403. | our servers | request-processor.ts:4694-4701 |
| Router drops routes without zero retention and routes or models that may train, for Auto and for named models. | our servers | auto.ts:1099-1115, 1374 |
| Failover and the credit swap re-check the same rule on every hop. | our servers | managed-failover.ts:1-40; request-processor.ts:6060-6075 |
| CLI checks the session's trust mode against the model's provider before each turn and refuses on mismatch. | device | agent/mod.rs:1791-1825; chat.rs:977 |
| Mobile Local chats run on-device models and refuse Cloud ones; Cloud chats send to our servers. | device | chatExecutionStore.ts:2262-2270 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Training opt-out per user | Read by readProviderTrainingOptOut (apps/web/lib/server/provider-training-opt-out.ts) | Server side | unknown |
| Workspace policy (privacy modes, zero retention, model policy) | Workspace policy storage read by readWorkspaceModelPolicy and resolveZeroDataRetentionPolicy | Server side | unknown table name |
| CLI Local session transcripts and memory | Device session files | Not synced across boundaries; refused by validate_privacy_boundary | On the device |

**Models and providers.** Whether a provider keeps inputs out of training comes from the model registry governance records (providerKeepsInputsOutOfTraining, modelKeepsInputsOutOfTraining). Local models run on-device through the local inference runtime (Mobile) or the bundled CLI (Desktop coding sessions). No model names are written here.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud needs sign-in. Local Mobile chats and Local CLI sessions: sign-in requirement for on-device use was not established. |
| Permissions | Workspace policy edits need admin rights (canEdit in WorkspacePolicySection.tsx); members are governed by the policy. |
| Subscription | US-only is limited to tiers listed in the registry (max, enterprise) (routing-policies.json providerPolicies). Local use has no payment rule found in this feature's code. |
| Limits and metering | none found specific to privacy rules. |
| Feature flags | none found; stage switches in F079-01 do not affect these rules. |
| Model compatibility | A model must have a route that passes all privacy rules; otherwise it is refused. |
| Provider restrictions | Providers that may train on inputs are excluded under the opt-out; providers without recorded training policy are refused (auto.ts:182-195). |
| Local mode | Mobile: on-device models in Local Mode chats; Cloud models refused there. CLI: Local sessions never send to Cloud or own key without the explicit handoff. Desktop Electron: chat is Cloud-only, on-device inference refused in the shell. Web: no Local model runs in the browser path read here (a ComposerFooter.localModels test exists; not read). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Opt-out unreadable | Treated as on (fail closed) with a warning log. | request-processor.ts:3606-3616 |
| Workspace policy unreadable | Turn refused with MODEL_POLICY_UNAVAILABLE. | request-processor.ts:4690-4693 |
| No provider keeps inputs out of training | 403 no_training_model_available. | request-processor.ts:4698-4700 |
| Named model may train | Refused with the may-train message; Health or Google data wording differs. | request-processor.ts:3239-3250 |
| Credit swap target may train | Swap skipped and the monthly-limit refusal returned. | request-processor.ts:6060-6075 |
| CLI Local session, cloud model | Blocked with handoff command; memory from another boundary also blocks. | agent/mod.rs:1791-1825 |
| Mobile Local chat, Cloud model | Error and no send. | chatExecutionStore.ts:2262-2270 |
| Offline | Local CLI and Mobile Local keep working in principle; not verified. | not examined |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ai/routing/src/__tests__/zero-data-retention.test.ts`: Retention class from governance record, conditional routes, refusal when no zero-retention route, provider agreement override.
- `packages/ai/routing/src/__tests__/auto-no-training-admission.test.ts`: A route that may train is moved off or refused; never selects a vendor or transport that may train across tiers, tasks and aliases.
- `packages/ai/routing/src/__tests__/auto-router-trust-mode.test.ts`: Disallowed trust mode refused for Auto and named models.
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.training-opt-out.test.ts`: Main chat route treats the opt-out as admission; out-of-credit move goes only to a no-training model.
- `apps/web/lib/server/managed-cloud-routing/__tests__/admission.test.ts`: Refusal when policy, region or retention cannot be read.
- `apps/web/features/settings/sections/WorkspacePolicySection.test.tsx`: Workspace policy controls (security toggles, spend cap; zero retention row not confirmed).
- `apps/cli/src/agent/chat.rs`: In-file tests: local session cloud fallback blocked by privacy boundary (4525); compact and memory extraction stay on device (5987, 6010).
- `apps/web/__tests__/trust-boundary.test.ts`: Web trust boundary test; one exists per app (mobile, extension, vscode, packages/contracts/types).

**Test scenarios**

- **No-training opt-out**
  1. Turn on 'Only use models that do not train on your chats'.
  2. Send on Auto, then name a model you know may train.
  - Expected: Auto answers from a no-training provider; the named model is refused with the may-train message.
- **No provider left**
  1. In a test deployment with only may-train providers, turn on the opt-out and send.
  - Expected: 403 no_training_model_available.
- **Zero data retention**
  1. As admin turn on 'Zero data retention only'.
  2. A member sends on Auto.
  - Expected: Only zero-retention routes serve; if none exist the request is refused, not rerouted.
- **CLI Local boundary**
  1. Start a Local session.
  2. Switch to a model that routes to Cloud and send.
  - Expected: 'Privacy boundary blocked' naming /continue-with-cloud; nothing leaves the device.
- **Mobile Local mode**
  1. Open a Local Mode chat; try a Cloud model.
  - Expected: 'This is a Local Mode chat. Start a separate AGI Cloud chat to use Cloud models.'

**Where to look when it fails**

- Error code no_training_model_available; logs 'Provider training opt-out unreadable'.
- Admission log '[managed-cloud-routing] call refused' with reason no_training_route or no_route.
- CLI error text 'Privacy boundary blocked'.
- Trust-boundary tests per surface and guard check:trust-boundaries named in AGENTS.md §6.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/web/079-routing-and-model-neutral-orchestration.md)
- Desktop: [70-qa/test-plans/desktop/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/desktop/079-routing-and-model-neutral-orchestration.md)
- Mobile: [70-qa/test-plans/mobile/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/mobile/079-routing-and-model-neutral-orchestration.md)
- CLI: [70-qa/test-plans/cli/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/cli/079-routing-and-model-neutral-orchestration.md)
- VS Code: [70-qa/test-plans/vscode/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/vscode/079-routing-and-model-neutral-orchestration.md)

## 10. Gaps and dependencies

- **No single privacy-first control; it is composed from several settings.** Affects: All apps. Evidence: PrivacySection.tsx:54-66; WorkspacePolicySection.tsx:73-86, 664. Work needed: Product decision on a combined control and a visible provider label.
- **Desktop Electron chat is Cloud-only and refuses on-device inference, against the premise of free local inference on desktop.** Affects: Desktop. Evidence: apps/desktop/electron/runtime/dispatcher.ts:2298, 3235-3243. Work needed: Product decision: keep Cloud-only desktop chat or add local inference; record it in the decisions.
- **Workspace allowed trust modes are not passed to the router in production.** Affects: Workspace admins. Evidence: auto.ts:342; no non-test caller. Work needed: Wire allowedPrivacyModes into routing or document where it is enforced.
- **Mobile Auto on-device decision ignores no-training and zero retention.** Affects: Mobile. Evidence: cloudDispatchRouting.ts:82-96. Work needed: Pass flags or send the Auto alias.
- **Zero data retention is not available to individual accounts.** Affects: Individuals. Evidence: only WorkspacePolicySection.tsx:664 control found. Work needed: Decide whether to offer it.
- **Chrome has no privacy mode choice.** Affects: Chrome. Evidence: experience-contract.md section 12.6 Cloud-only. Work needed: None if Cloud-only is intended.

**Depends on**

- SYS-security-and-privacy
- SYS-execution-boundaries
- SYS-local-inference
- SYS-authorization-and-workspaces
- SYS-model-catalog-and-routing
- F079-01
- F079-04
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:local
- mode:own-key
- mode:cloud

## Unknown

- Table and column names that store the training opt-out and workspace policy.
- Whether on-device use needs sign-in on Mobile and CLI.
- Whether Web has any Local model path (a ComposerFooter.localModels test exists; not read).
- Retention period of stored policy and trace data.
- Where workspace allowedPrivacyModes is enforced on the server.
- Accessibility of the privacy toggles.
