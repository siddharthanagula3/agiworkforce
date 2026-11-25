---
id: "F079-02"
type: "feature"
title: "Instant, Best and Economy choices"
aliases: ["Instant", "Best", "Economy", "routing profile choice", "routing_profile", "speed", "quality", "cost", "Auto · Instant", "Auto · Best", "Auto · Economy", "Quick (Chrome)", "/route", "auto-economy", "auto-premium", "speed-first profile", "quality-first profile", "cost-first profile"]
area: "79 Routing and model-neutral orchestration"
available_on: ["web", "desktop", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S79.05", "S79.06", "S79.07"]
depends_on: ["F079-01", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-api-and-contracts", "surface:web", "surface:desktop", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "api:POST /api/llm/v1/chat/completions", "file:packages/contracts/types/src/routing-profile-choice.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F079-02 Instant, Best and Economy choices

Beside Auto, a paid person can bias routing toward speed (Instant), capability (Best) or low cost (Economy). The choice only narrows the cost band and ordering; it never lets a model past plan or workspace limits. Web, Desktop, VS Code, the CLI and the API have it; Chrome has a Quick toggle; Mobile removed it by decision.

Area: [79. Routing and model-neutral orchestration](README.md). Requirement items: [S79.05](../../10-requirements/capabilities/079-routing-and-model-neutral-orchestration.md#s7905), [S79.06](../../10-requirements/capabilities/079-routing-and-model-neutral-orchestration.md#s7906), [S79.07](../../10-requirements/capabilities/079-routing-and-model-neutral-orchestration.md#s7907).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Sends a routing_profile of speed, quality or cost with the Auto request. The server swaps the Auto alias for the economy or premium alias and, for speed, asks the router to look at the fastest slots first. [inferred from request-processor.ts:3633-3637, 4769]

**Why it exists.** Some people want a faster answer, the strongest model, or the cheapest model for a turn without picking one model by name (brief S79.05, S79.06, S79.07).

**Who uses it.** Paid-plan people on Web and Desktop, VS Code users, CLI users with a saved Cloud session, Chrome users who want quicker cheaper answers, API callers.

**Problems it solves**

- Waiting on a heavy model for a simple question.
- Overpaying for a simple task.
- Needing the strongest model for one hard task without leaving Auto.

**Use cases**

- Choose Instant for summaries.
- Choose Best before a hard design question.
- Choose Economy for bulk low-stakes questions.
- In the CLI run /route speed before a quick lookup.

## 2. User experience

**Where to find it**

- Web and Desktop: model picker, rows 'Instant', 'Best', 'Economy' directly under the 'Auto' row (ComposerFooter.tsx:1656-1680; labels in packages/contracts/types/src/routing-profile-choice.ts:11-33).
- VS Code: quick pick rows 'Auto · Instant', 'Auto · Best', 'Auto · Economy' (modelConstants.ts:447-453).
- CLI: /route inside a session lists profiles 'Auto (auto)', speed, quality, cost and /route <profile> sets one (agent/mod.rs:2268-2350).
- Chrome: model dropdown toggle 'Quick' with the text 'Answers faster on a cheaper route, good for summaries and quick lookups' (apps/extension/_locales/en/messages.json:580-583, 756-759; side_panel.ts:11308-11318).
- Mobile: none; Instant and Economy are filters on the model list, not routing (docs/decisions/2026-11-12-founder-decisions.md D-2026-11-12-07).

**Before you start**

- Web: a resolved paid plan; rows are hidden on Free or while the plan is unresolved (ComposerFooter.tsx:1048, 1656).
- CLI: Cloud (Managed) session, session saving on, and a plan that can run the alias (agent/mod.rs:2290-2306, 2356-2358).
- Chrome: Auto selected and the account's allowed Auto modes include the economy alias (side_panel.ts:11308; managedModelPicker.ts:268-272).
- VS Code: each row is plan locked separately by isAutoReachableForTier (modelConstants.ts:67-79).

**Screens and controls**

- Web: RoutingProfileRow buttons with label and description: Instant 'Answers fastest, on the quickest models your plan includes.', Best 'The most capable model your plan includes, for harder work.', Economy 'The lowest-cost model that can handle the task.' (routing-profile-choice.ts:19-33).
- VS Code: quick pick rows with the same descriptions.
- Chrome: a toggle row 'Quick' that is disabled when not eligible (side_panel.ts:11308-11318).

**Journey**

1. Open the model picker.
2. Choose Instant, Best or Economy (or Quick in Chrome, or run /route in the CLI).
3. Send a message.
4. The client sends routing_profile with the request; Auto then routes inside the chosen band.
5. The answer shows the model used.

**What the person sees and gets**

- Selected row is marked in the picker; the profile is remembered in the browser (model-store.ts:376-385).
- CLI /route answers 'Routing set to <label> (<id>): ...' or 'That routing profile cannot run on your plan: <error>' (agent/mod.rs:2331-2365).
- Chrome Quick leaves the saved picker selection unchanged (docs/product/experience-contract.md:618).

**Settings**

- Persisted routing profile key in agi-model-store (model-store.ts:325-390).
- Chrome stores the Quick toggle in chrome.storage.local key agi_quick_mode and syncs it (apps/extension/src/background.ts:6147-6155; features/background/synced-preferences.ts:6).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Contract: choices auto, speed, quality, cost with labels Auto, Instant, Best, Economy (packages/contracts/types/src/routing-profile-choice.ts:3-33).
- Mapping: speed and cost go to the economy alias, quality to the premium alias (routing-profile-choice.ts:42-54).
- Server accepts routing_profile (request-processor.ts:714), swaps the alias only when the model is the default Auto alias (3633-3637), and for speed passes speedFirstSlots() as preferSlots (4769; packages/ai/routing/src/speed-first-slots.ts:1-20).
- Web sends routing_profile only when it is not auto (apps/web/lib/hooks/useChatStream.ts:4646-4649).
- VS Code sends model 'auto' with routingProfile (ChatStateManager.ts:5406-5413).
- CLI maps profiles to aliases and sends routing_profile to the gateway (apps/cli/src/routing/profile.rs:18-33, apps/cli/src/agent/chat.rs:913-920).
- Chrome Quick resolves to the economy alias after an admission check (managedChatHandler.ts:665-692).

**Incomplete**

- Speed and cost differ only by preferSlots; both use the economy band (routing-profile-choice.ts:42-46).
- Best on a tier whose ceiling is economy is clamped by the router (auto.ts:1198-1216); whether the Web picker hides or labels that case was not verified.

**Present but disconnected or switched off**

- Mobile request type has routing_profile (apps/mobile/services/streaming.ts:567) but no sender was found in apps/mobile; the decision says Mobile no longer sends one.

**Not available**

- Mobile: no Instant, Best or Economy routing (decision D-2026-11-12-07).
- Free plan on Web: rows hidden (ComposerFooter.tsx:1656).
- CLI without a saved Managed session: /route refuses (agent/mod.rs:2290-2306).

## 4. Required behaviour

**Established requirements**

- A speed-first profile prefers the fastest eligible route. (source: brief S79.05)
- A quality-first profile prefers the most capable eligible route. (source: brief S79.06)
- A cost-first profile prefers the cheapest eligible route. (source: brief S79.07)
- Web and desktop still offer Instant, Best and Economy under Auto; Mobile uses filters instead. (source: doc: docs/decisions/2026-11-12-founder-decisions.md (D-2026-11-12-07))
- Chrome Quick is a per-turn Auto Economy override that keeps the saved selection and passes normal admission. (source: doc: docs/product/experience-contract.md:618)

**Acceptance criteria**

1. On a paid Web plan, choosing Instant sends routing_profile 'speed' and the answering model is one of the faster slots the plan allows.
2. Choosing Best on a plan whose ceiling is premium sends routing_profile 'quality' and uses the premium band.
3. Choosing Auto sends no routing_profile.
4. On Free, the three rows are not shown.
5. In the CLI, /route bogus answers 'Unknown routing profile' and lists auto, speed, quality, cost.
6. In Chrome, Quick on does not change the saved model selection.
7. No profile ever returns a model the workspace policy forbids.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Best on a plan that cannot use the premium band should say so rather than silently use a lower band. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Hide or label the Best row when the tier ceiling is economy, as VS Code already locks rows by plan.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | ROUTING_PROFILE_CHOICES and options | `packages/contracts/types/src/routing-profile-choice.ts` | Single owner of choice ids, labels, descriptions and band mapping. |
| component | ComposerFooter RoutingProfileRow | `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | Web picker rows (1635-1680). |
| store | useModelStore routingProfile | `apps/web/shared/stores/model-store.ts` | Holds and persists the chosen profile. |
| hook | useChatStream routing_profile | `apps/web/lib/hooks/useChatStream.ts` | Adds routing_profile to the request (4646). |
| endpoint | chat completions schema | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Accepts routing_profile, swaps alias, passes speed slots (714, 3633, 4769). |
| service | speedFirstSlots | `packages/ai/routing/src/speed-first-slots.ts` | Lists slots by catalogued speed very-fast then fast. |
| config | Auto aliases auto-economy and auto-premium | `packages/ai/model-registry/catalog/routing-policies.json` | Labels Economy and Best; not directly selectable (lines 537-575). |
| component | VS Code AUTO_CHOICE_ROWS | `apps/extension-vscode/src/features/model-picker/modelConstants.ts` | Rows 'Auto · Instant/Best/Economy' and sentinel id auto-speed (439-463). |
| service | VS Code turn start | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Sends model auto plus routingProfile (5370-5413). |
| service | VS Code chat participant | `apps/extension-vscode/src/features/chat-participant/chatParticipant.ts` | Same profile pass-through for the chat participant (87-90, 605). |
| command | /route | `apps/cli/src/claude_parity.rs` | Slash command wiring (line 191). |
| command | AgentSession::routing_profile | `apps/cli/src/agent/mod.rs` | Parses, validates and applies a profile (2268-2370). |
| service | CLI profile mapping | `apps/cli/src/routing/profile.rs` | PROFILE_IDS, gateway_request, auto_selection. |
| service | app-server routing_profile | `apps/cli/src/app_server/developer_host.rs` | Maps a turn's routing_profile to a selection (4169-4200, 6702-6708). |
| component | Chrome Quick toggle | `apps/extension/src/side_panel.ts` | Toggle row and applyQuickMode (11195-11318). |
| service | Chrome managed chat handler | `apps/extension/src/features/cloud-bridge/managedChatHandler.ts` | Quick to economy alias with admission check (665-692). |
| config | openapi routing_profile | `apps/web/public/openapi.json` | Public API shape lists the field. |
| service | named routing profiles | `packages/ai/routing/src/profiles/index.ts` | Different concept: four named profiles with weights; not what the picker sends. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks a row; the web store keeps the profile and the Auto model id. | device | ComposerFooter.tsx:1656-1678; model-store.ts:353-356 |
| On send, the client adds routing_profile unless it is auto. | device | useChatStream.ts:4646-4649 |
| Server replaces the default Auto alias with the economy or premium alias and, for speed, asks for fast slots first. | our servers | request-processor.ts:3633-3637, 4769 |
| Router clamps the band to the plan ceiling and routes as in F079-01. | our servers | auto.ts:1198-1216 |
| CLI: the session resolves the alias locally to check the plan, then sends 'auto' with routing_profile to the gateway. | device and our servers | agent/mod.rs:2330-2365; agent/chat.rs:896-920 |
| Chrome: Quick turns the Auto selection into the economy alias after an access check, then routes on device and again on the server. | device and our servers | managedChatHandler.ts:665-697, 772 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Chosen routing profile | store:agi-model-store (browser localStorage); CLI saved session; chrome.storage.local key agi_quick_mode | Chrome syncs agi_quick_mode via synced preferences; Web store is browser-only | Until browser data is cleared or the preference is changed |

**Models and providers.** Profiles change which Auto alias is used, not which providers exist. Speed order comes from catalogued model speed metadata (speed-first-slots.ts:1-20). No model names are listed here.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in Cloud account. |
| Permissions | Workspace policy still applies after alias swap (request-processor.ts after 5030 policy check). |
| Subscription | Rows need a paid plan on Web; the band is clamped by tier ceiling (routing-policies.json:433-440); VS Code locks rows per plan; Chrome needs the economy alias in the account's allowed Auto modes. |
| Limits and metering | Same credit accounting as Auto; no profile-specific limit found. |
| Feature flags | none found in the code for the picker rows themselves; routing stage switches apply as in F079-01. |
| Model compatibility | Router capability checks unchanged. |
| Provider restrictions | Same admission rules as Auto. |
| Local mode | Not applicable: profiles only exist for Cloud Auto; the CLI refuses /route in Local or own-key sessions (agent/mod.rs:2290-2296). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unknown profile in CLI | 'Unknown routing profile ...' with the valid list. | agent/mod.rs:2300-2305 |
| CLI with session saving off | Refuses: profiles are kept with the saved session. | agent/mod.rs:2307-2309 |
| Profile sent while a specific model is selected | Ignored by the server because the swap needs the default Auto id. | request-processor.ts:3633-3637 |
| Chrome Quick not eligible | Toggle disabled; request returns model_not_admitted with 'Quick routing is not available for this account.' | side_panel.ts:11308-11318; managedChatHandler.ts:669-676 |
| Free plan on Web | Rows not shown; a request naming an Auto alias is served the plan default. | ComposerFooter.tsx:1656; request-processor.ts:3346-3352 |
| Accessibility | unknown; not checked. | not examined |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ai/routing/src/__tests__/slot-preference.test.ts`: preferSlots (used for speed) only reorders and cannot widen admission.
- `packages/ai/routing/src/__tests__/auto.test.ts`: Economy profile honoured even when the tier allows premium; tier clamp.
- `apps/web/shared/stores/model-store.test.ts`: Auto routing profiles use canonical labels and descriptions with no web-owned copy.
- `apps/extension-vscode/src/__tests__/modelPickerTierGate.test.ts`: VS Code picker tier gating (name matched references to the profile rows; detail not read).

**Test scenarios**

- **Instant sends speed**
  1. Paid Web account; open the picker; choose Instant.
  2. Send a message with network inspector open.
  - Expected: Request body has routing_profile 'speed'; response x_agi_workforce.routing.slot is a fast slot.
- **Auto sends none**
  1. Choose Auto.
  2. Send a message.
  - Expected: No routing_profile field in the body.
- **Best on a lower tier**
  1. Use a basic-plan account; choose Best if shown.
  2. Send a coding prompt.
  - Expected: Answer comes from the economy band at most, per the tier ceiling; note whether the UI explains this.
- **CLI profile**
  1. Start a Cloud session with saving on.
  2. Run /route quality, then /route nonsense.
  - Expected: First sets the profile with a confirmation line; second prints the unknown-profile message.
- **Chrome Quick**
  1. Select Auto, switch Quick on, send a message.
  2. Switch Quick off.
  - Expected: The saved model selection is unchanged; the Quick turn uses the economy alias.

**Where to look when it fails**

- Request/response body fields routing_profile and x_agi_workforce.routing.
- CLI /route output text.
- Chrome error codes model_not_admitted and routing_unavailable (managedChatHandler.ts:669-712).
- Server warn 'Auto route decision for a continuing conversation' shows the reason (request-processor.ts:4990).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/web/079-routing-and-model-neutral-orchestration.md)
- Desktop: [70-qa/test-plans/desktop/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/desktop/079-routing-and-model-neutral-orchestration.md)
- CLI: [70-qa/test-plans/cli/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/cli/079-routing-and-model-neutral-orchestration.md)
- VS Code: [70-qa/test-plans/vscode/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/vscode/079-routing-and-model-neutral-orchestration.md)
- Chrome: [70-qa/test-plans/chrome/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/chrome/079-routing-and-model-neutral-orchestration.md)

## 10. Gaps and dependencies

- **Mobile has no Instant, Best or Economy routing choice.** Affects: Mobile. Evidence: decision D-2026-11-12-07; apps/mobile/services/streaming.ts:567 type only.. Work needed: None required by decision; remove the unused request field to avoid a dead path.
- **Speed and Economy both use the economy band and differ only by slot order.** Affects: Web, VS Code, CLI. Evidence: routing-profile-choice.ts:42-46; request-processor.ts:4769.. Work needed: Confirm that is the intended difference, or give speed its own band.
- **Best row on tiers whose ceiling is economy is not verified to be hidden or explained on Web.** Affects: Web basic-plan users. Evidence: ComposerFooter.tsx:1656 shows rows for any paid plan; auto.ts:1198-1216 clamps silently.. Work needed: Check the shortList.auto filter and add a lock or note.
- **Name clash: the picker's Instant is not the named profile 'instant' in packages/ai/routing/src/profiles/index.ts.** Affects: Engineers and testers reading the code. Evidence: profiles/index.ts:48-62 versus routing-profile-choice.ts:19-23.. Work needed: Rename one of them or document the difference.
- **No Web test found for the profile rows.** Affects: Web. Evidence: search for RoutingProfileRow in tests found none.. Work needed: Add a component test that checks the request field.

**Depends on**

- F079-01
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-api-and-contracts
- surface:web
- surface:desktop
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- api:POST /api/llm/v1/chat/completions
- file:packages/contracts/types/src/routing-profile-choice.ts

## Unknown

- Whether the Web picker hides Best on tiers whose ceiling is economy.
- Exact speed metadata of the catalog today and so which slots speedFirstSlots returns.
- Whether Desktop Electron needs any extra step to show the rows; it loads the hosted web app.
- Accessibility of the rows.
- Which tests exercise the VS Code profile rows; modelPickerTierGate.test.ts was not read.
