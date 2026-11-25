---
id: "F109-11"
type: "feature"
title: "Hybrid local and cloud task, and approval before cloud escalation"
aliases: ["Hybrid local/cloud task mode", "Explicit cloud-escalation approval", "Cloud escalation", "Local to cloud handoff"]
area: "109 Optional native and ambient extensions"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "missing", cli: "missing", vscode: "missing", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S109.23", "S109.24"]
depends_on: ["surface:mobile", "surface:cli", "surface:vscode", "mode:local", "mode:cloud", "SYS-execution-boundaries", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-chat-turn-pipeline", "SYS-local-inference", "F109-09"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F109-11 Hybrid local and cloud task, and approval before cloud escalation

Not built. The idea is that one task could use an on-device model and the cloud together, and that the app would ask before sending a local task to the cloud. No screen or code path for this was found on mobile, the CLI or VS Code. Related but different: the CLI can hand a task to a cloud Code session after a review.

Area: [109. Optional native and ambient extensions](README.md). Requirement items: [S109.23](../../10-requirements/capabilities/109-optional-native-and-ambient-extensions.md#s10923), [S109.24](../../10-requirements/capabilities/109-optional-native-and-ambient-extensions.md#s10924).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Nothing today. Intended: split work between a local model and a cloud model in one run, and ask for approval before the cloud step (doc: knowledge-base/data/area-briefs/109-optional-native-and-ambient-extensions.md, S109.23 and S109.24).

**Why it exists.** Local models are private and free but weaker. A user may want cloud help for a hard step without silently losing privacy. The repository rule says nothing may silently route Local chat, files or sessions to BYOK or managed cloud; a move needs an explicit fork with consent and a visible provider label (doc: AGENTS.md section 6).

**Who uses it.** Not applicable until built; intended for local-model users on mobile, CLI and VS Code.

**Problems it solves**

- A local model cannot finish a hard task.
- Fear that private content leaves the device unannounced.

**Use cases**

- A phone drafts locally, then asks 'send this step to AGI Cloud?'
- A CLI session on a local server model hands one step to a cloud model after approval.

## 2. User experience

**Where to find it**

- None. No screen, command or setting was found on mobile, CLI or VS Code (searches of apps/mobile, apps/cli/src and apps/extension-vscode/src for escalation and hybrid terms returned only unrelated matches such as approval notifications and exec policy).

**Before you start**

- Not applicable.

**Screens and controls**

- None. Related existing controls: CLI 'agi code start' and 'handoff', which show a review of what moves to the cloud (apps/cli/src/lib.rs:1167-1196); VS Code message that a feature 'runs only on AGI Cloud' when the default model is Local (apps/extension-vscode/src/core/cloudModelBoundary.ts:36).

**Journey**

1. Not reachable.

**What the person sees and gets**

- Not applicable. Closest existing outputs: mobile 'Local Mode is active, but no on-device model is ready yet.' (apps/mobile/stores/chat/chatExecutionStore.ts:459-460).

**Settings**

- None.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing for this feature.

**Incomplete**

- Related guard exists: mobile keeps local conversations local and rejects cross-mode sends (apps/mobile/__tests__/local-byok-handoff.test.ts:159-244, test names only). It shows no hybrid path.

**Present but disconnected or switched off**

- none found.

**Not available**

- Mobile, CLI and VS Code: hybrid task mode and cloud-escalation approval are missing (area brief S109.23, S109.24).
- The CLI 'code start' and 'handoff' commands move a whole task to a cloud session after a review; they are not a hybrid run (apps/cli/src/lib.rs:1167-1196).

## 4. Required behaviour

**Established requirements**

- A task can run partly on a local model and partly in the cloud in one hybrid mode. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S109.23)
- Before a local task is sent to the cloud, the app asks the user to approve the escalation. (source: S109.24 (same brief))
- Nothing may silently route a Local chat, file or session to BYOK or managed cloud; a Local to BYOK move is an explicit fork with consent and a visible provider label. (source: AGENTS.md section 6)
- An action the user cannot undo asks first and names the consequence. (source: AGENTS.md section 9)

**Acceptance criteria**

1. Not testable yet. Once built: a local task that needs the cloud shows an approval naming what leaves the device, the provider and the plan cost; declining keeps everything local.
2. With approval declined, no network request carries local content.
3. The approval offers 'AGI Cloud' only to signed-in accounts on a plan that allows the model.
4. The cloud step is labelled in the transcript with the provider.
5. Free local-only use is unaffected by the new mode.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The approval should reuse the existing confirm-action pattern named in AGENTS.md section 9 [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Start with a per-message 'Ask AGI Cloud' button that forks the chat, rather than mid-run splitting.
- [proposed] Show the plan and credit use before approval.
- [proposed] Record the decision in the compliance ledger already used for provider consent (apps/mobile/services/complianceLedger.ts).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | No implementation | `none found` (not found) | Searches of apps/mobile, apps/cli/src and apps/extension-vscode/src found no gate. |
| test | local-byok-handoff test | `apps/mobile/__tests__/local-byok-handoff.test.ts` | Shows local forks stay local and cross-mode sends are rejected (test names read only). |
| service | cloudModelBoundary (VS Code) | `apps/extension-vscode/src/core/cloudModelBoundary.ts` | Refuses to swap a Local model for a cloud one silently. |
| command | agi code start / handoff | `apps/cli/src/lib.rs` | Existing explicit move of a task to a cloud session after review (lines 1167-1196). |
| service | providerConsent | `apps/mobile/services/providerConsent.ts` | Existing consent ledger for named providers, a possible reuse. |
| config | Trust boundary rule | `AGENTS.md` | Section 6 states the rule a future escalation must follow. |
| store | chatExecutionStore local turn | `apps/mobile/stores/chat/chatExecutionStore.ts` | Where a local turn runs today; no cloud branch for local turns found. |
| service | selector localGenerate | `packages/platform/local-llm/src/selector.ts` | Local generation with no cloud fallback; failures raise errors (lines 105-163). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Not applicable: no hybrid flow exists. A local turn runs fully on the device through the local runtime and fails with a message if it cannot finish. | device | apps/mobile/stores/chat/chatExecutionStore.ts:3093-3123, :1371-1416 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Nothing is created by this feature. | not applicable | not applicable | not applicable |

**Models and providers.** A future hybrid mode would use a local model and a cloud model together. Model and provider choice would come from the model catalog and routing (SYS-model-catalog-and-routing) and the cloud step would be metered by the AGI subscription system. None of this exists now.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Not applicable now. A cloud step would need a signed-in account [inferred]. |
| Permissions | Not applicable now; the user's explicit approval is required by AGENTS.md section 6. |
| Subscription | none found in the code. A cloud step would be a managed-cloud call governed by the plan and credits [inferred]. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | unknown |
| Provider restrictions | none found in the code. |
| Local mode | Local mode stays fully local today; there is no escalation. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Local model cannot answer | The turn fails with a mapped message; no cloud fallback is attempted. | chatExecutionStore.ts:1371-1416 |
| Offline | not handled in the code for escalation. | no escalation code |
| Cross-mode send | Rejected by the mobile store (per test name). | apps/mobile/__tests__/local-byok-handoff.test.ts:244 |
| Approval declined or timeout | not handled in the code. | no escalation code |
| Accessibility | not handled in the code. | no escalation code |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/local-byok-handoff.test.ts`: Local forks stay local and cross-mode sends are rejected (test names only; bodies not opened).

**Test scenarios**

- **Confirm absence**
  1. On mobile, CLI and VS Code, use a local model on a task it cannot finish.
  - Expected: An error message appears; no cloud call is made and no approval prompt appears.
- **No silent routing**
  1. In Local mode send a message with the network monitor on.
  - Expected: No request to our servers carries the message.
- **Future approval**
  1. After build: trigger an escalation and decline.
  - Expected: Content stays local and the run ends or continues locally.

**Where to look when it fails**

- Search the code for escalation terms again after any build.
- Compliance ledger entries for named-provider consent.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Hybrid local and cloud mode is not built.** Affects: Mobile, CLI and VS Code local-model users.. Evidence: area brief S109.23. Work needed: Design the run split, routing, metering and transcript labelling.
- **Cloud-escalation approval is not built.** Affects: Same users.. Evidence: area brief S109.24. Work needed: Build a consent dialog meeting AGENTS.md sections 6 and 9, with a record of consent.
- **No product decision found on which surface goes first.** Affects: Planning.. Evidence: no document under docs/product or docs/decisions was read for this. Work needed: Search docs/product and docs/decisions and decide.
- Not built on: Mobile, CLI, VS Code (from the capability ledger).

**Depends on**

- surface:mobile
- surface:cli
- surface:vscode
- mode:local
- mode:cloud
- SYS-execution-boundaries
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-chat-turn-pipeline
- SYS-local-inference
- F109-09

## Unknown

- Whether any product document describes the intended hybrid design.
- Whether Desktop (not in the brief for these items) has any such path.
- The exact searches were word searches; a differently named gate could exist but none was seen.
