---
id: "F015-09"
type: "feature"
title: "Reasoning effort, fast mode and response style"
aliases: ["Reasoning effort", "Effort slider", "Extended thinking switch", "Thinking toggle", "Fast mode", "Fast pill", "Speed control (Mobile)", "Response style and length", "Style selector", "Output style (CLI)"]
area: "15 Model-selector interface"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S15.22", "S15.23", "S15.24"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-chat-turn-pipeline", "SYS-api-and-contracts", "SYS-authorization-and-workspaces", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "api:GET /api/billing/overage", "api:POST /api/llm/v1/chat/completions", "store:agi-thinking-store", "store:fast-mode-store"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F015-09 Reasoning effort, fast mode and response style

Lets a person choose how hard a reasoning model thinks, switch on a faster serving tier where a model offers one, and choose shorter or longer answers. Web and Desktop have effort, thinking, Fast mode and a style selector with length. Mobile has effort and Fast mode and a style list. CLI, VS Code and Chrome are partial.

Area: [15. Model-selector interface](README.md). Requirement items: [S15.22](../../10-requirements/capabilities/015-model-selector-interface.md#s1522), [S15.23](../../10-requirements/capabilities/015-model-selector-interface.md#s1523), [S15.24](../../10-requirements/capabilities/015-model-selector-interface.md#s1524).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives per-turn control over reasoning depth, serving speed and answer length without changing the model.

**Why it exists.** Harder questions need more thinking, simple ones do not; some models offer a faster, pricier tier; people differ on how long answers should be. Effort above a model's default is a compute escalation gated by plan (packages/contracts/types/src/model-catalog.ts:2610-2635 comment).

**Who uses it.** Chat users on every surface; paid users for Fast mode and higher effort.

**Problems it solves**

- Paying for deep reasoning on easy questions.
- Waiting for slow answers when speed matters.
- Getting answers that are too long or too short.

**Use cases**

- On Web, drag the effort slider from 'Medium' to 'High' for a hard maths question.
- On Mobile, tap the gauge button in the composer, pick a level, tap 'Done'.
- On Web with a paid plan and usage credits on, turn on 'Fast' for a quick answer.
- Pick 'Brief' in the Web style menu to get one-line answers.

## 2. User experience

**Where to find it**

- Web and Desktop: composer footer button 'Reasoning effort: <level>' opens a panel with the slider, 'Toggle extended thinking' switch, 'Use global default' button, a 'Fast mode' switch, and a separate 'Fast' pill (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1889,1917,1950,2010,2013,2060). Style menu with 'Response Length' buttons Brief, Default, Thorough (apps/web/features/chat/components/Composer/StyleSelector.tsx:30-36,248-278; apps/web/features/chat/stores/style-store.ts:338-346).
- Mobile: composer gauge button 'Reasoning effort: <level>' then a slider panel with 'Done' (apps/mobile/src/features/chat/components/ComposerEffort.tsx:28-58; ChatInput.tsx:1527-1532,2236-2240); in the model sheet, 'Effort' block and 'Speed' block with 'Fast' (ModelPickerSheet.tsx:836-872; components/SpeedControl.tsx:14-76); chat style sheet with Normal, Concise, Explanatory, Learning, Formal (apps/mobile/src/features/chat/components/StyleSelector.tsx:14-24).
- CLI: in /model picker, an effort bar 'Thinking: on · Effort: <level>' (apps/cli/src/tui/widgets/model_picker.rs:600-614); /fast (apps/cli/src/tui/tui_app.rs:5825-5840); flag --effort (apps/cli/src/lib.rs:8722-8745); /output-style (tui_app.rs:5726-5751).
- VS Code: command 'Effort' in the settings quick pick (apps/extension-vscode/src/core/commandSetup.ts:1925-1946).
- Chrome: 'Effort' heading with level rows in the model menu, 'Extended thinking' toggle, 'Quick' toggle (apps/extension/src/side_panel.ts:11088-11130,11315-11340).

**Before you start**

- The model must declare effort levels; otherwise no effort control appears (ComposerFooter.tsx:1320; Mobile test ComposerEffort.test.tsx 'offers nothing for a model with no effort levels').
- Fast mode needs a model with a fast tier, a paid plan, the workspace not blocking it, and usage credits on (packages/contracts/types/src/fast-mode.ts:26-32).
- Mobile effort button needs Cloud mode, text (not media) mode and more than one level (ChatInput.tsx:1527-1529).

**Screens and controls**

- Web effort panel text: 'Higher effort thinks longer before it answers.'; 'Always on for this model'; 'Off is not supported by this model' (ComposerFooter.tsx:1990-2000).
- Web gated levels show a lock on the slider and the text '<levels> effort(s) not included in your plan.' with an 'Upgrade' button (ComposerFooter.tsx:1960-1985,2038-2055).
- Web Fast switch text 'Faster answers at <N>x the usage, billed to usage credits.' or the block message (ComposerFooter.tsx:2032-2036).
- Mobile Fast helper text 'Faster answers from the same model, at <N>x the usage, billed to usage credits.' (SpeedControl.tsx:21-24).
- Mobile 'Fast' word next to the model name when on (ModelSelectorButton.tsx:72-85).

**Journey**

1. Pick a model that has effort levels.
2. Open the effort control and choose a level (Web, Mobile, Chrome) or press Left/Right in the CLI picker.
3. Optionally turn on Fast mode where the control is shown.
4. Optionally open the style menu and choose a style or length.
5. Send; the choice rides with the request.

**What the person sees and gets**

- Web: the footer button names the level, or 'Off'; the panel states whether this chat overrides the global default (ComposerFooter.tsx:2000-2010).
- Web: blocked Fast shows the reason in the pill title and panel (ComposerFooter.tsx:2013-2036,2060-2078).
- CLI: '/fast' prints 'Fast mode <status>' with credits per million tokens, or 'OFF, back to <model>' (tui_app.rs:5195-5200,5825-5840).

**Settings**

- Web: global thinking and effort defaults, per-chat overrides, 'fast' flag in the browser store named agi-thinking-store (apps/web/shared/stores/thinking-store.ts:20-34,120).
- Mobile: fast-mode-store (fastMode.ts:44-86) and agent-control-store for effort (EffortSlider.tsx:57-76).
- CLI: config key reasoning_effort via --effort; output style persisted per project (tui_app.rs:5748-5751).
- VS Code: setting agent.effort (apps/extension-vscode/src/features/settings/settingsProtocol.ts:135).
- Chrome: chrome.storage.local keys for effort and agi_thinking_enabled (side_panel.ts:11110,11330).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web effort levels come from each model's catalogue block; plan-gated levels are split out and shown locked (ComposerFooter.tsx:1306-1320; packages/contracts/types/src/model-catalog.ts:2618-2635).
- Web effort and thinking are stored per chat with a global fallback and a 'Use global default' reset (thinking-store.ts:20-90; ComposerFooter.tsx:1012-1030,2010).
- Web sends thinking_mode, effort and, when allowed, speed 'fast' in the request (apps/web/lib/hooks/useChatStream.ts:4668-4680).
- Server clamps effort to the plan (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1830-1841) and refuses Fast mode for a model without a fast tier, a free plan, a workspace that blocks it, or usage credits off (request-processor.ts:1881-1912,5775-5810); a capability switch can close it (request-processor.ts:3704-3710).
- Web Fast availability check calls GET /api/billing/overage and uses the shared rule (apps/web/features/chat/hooks/use-fast-mode-availability.ts:18-56).
- Web response length is a system instruction built from style and length and prepended to the request (style-store.ts:318-380; useChatStream.ts:4473-4540).
- Mobile effort slider and composer effort per conversation with a default (EffortSlider.tsx:57-76; ComposerEffort.tsx:19-27) and the effort goes into the request (stores/chat/chatExecutionStore.ts:3340-3387).
- Mobile Fast mode: switch, shared availability rule, workspace policy and usage-credit check, sends speed 'fast' for the picked model (fastMode.ts:44-159; services/streaming.ts:902-907; tests FastMode.test.tsx, fast-mode-stream.test.ts).
- Mobile style is added to the system prompt (chatExecutionStore.ts:1275-1283).
- CLI effort bar and --effort preset (model_picker.rs:295-303,755-766; lib.rs:8722-8745). CLI /fast switches the session to the provider's fast model and back (apps/cli/src/agent/mod.rs:2903-2967; model_catalog.rs:827).
- VS Code effort quick pick (commandSetup.ts:1925-1946).
- Chrome effort options, gated levels with plan badge, thinking toggle (managedModelPicker.ts:308-353; side_panel.ts:11088-11133).

**Incomplete**

- CLI /fast changes the model, it is not a same-model serving tier, and no plan or usage-credit check or speed field was found (agent/mod.rs:2931-2962; doc: docs/product/surface-feature-matrix.md, Fast mode, cli).
- Mobile effort shows no plan gating; the server clamps instead (EffortSlider.tsx:36-47; request-processor.ts:1840).
- VS Code effort is one global setting, not per model (platform/config.ts:219).

**Present but disconnected or switched off**

- Fast mode is registered as a beta feature and the UI shows its maturity label (ComposerFooter.tsx:1323-1326; SpeedControl.tsx:9-12; test ComposerFooter.reasoning-flyout.test.tsx:377-395).

**Not available**

- Mobile: no response-length control, only styles (StyleSelector.tsx:14-24).
- VS Code: no Fast mode and no response style or length control found.
- Chrome: no Fast mode (no fastTier use in apps/extension/src); no length control found.
- All apps except Web, Desktop and CLI: no explicit response-length setting.

## 4. Required behaviour

**Established requirements**

- For reasoning models the user can choose how hard the model thinks. (source: brief S15.22 (all apps done))
- Where a model offers a faster serving tier, the user can turn it on. (source: brief S15.23 (web, desktop done; cli partial; mobile, vscode missing in the brief))
- CLI Fast mode waits on a per-model fast tier and price in the registry, speed in the gateway, provider payloads and billing; then /fast switches to that tier of the same model. (source: brief S15.23 Unfinished)
- The user can set a preferred response length. (source: brief S15.24 (web, desktop, mobile, cli, api done; vscode, chrome missing))
- The selector shows effort values and default. (source: doc: docs/product/experience-contract.md section 7.3)
- Fast mode needs a paid plan, an admin-enabled workspace and usage credits. (source: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1875-1880 (code comment) and packages/contracts/types/src/fast-mode.ts:21-25)

**Acceptance criteria**

1. A model with six catalogue levels shows six marks on the Web slider; a model with no levels shows no effort control.
2. On a plan that gates higher levels, those levels are shown locked and the Upgrade button opens the upgrade flow.
3. A chat's effort override is kept after switching to another chat and a new chat starts from the global default.
4. Fast control is hidden for a model without a fast tier; on Free it is disabled and explains 'Fast mode is available on paid plans and is billed to usage credits.'
5. With usage credits off, the Fast switch is disabled with the 'Turn them on in Settings > Billing.' text (Web) or 'Turn on usage credits in Usage.' (Mobile).
6. A request with speed 'fast' from an ineligible account gets HTTP 403 or 422 with code 'fast_mode_unavailable'.
7. Choosing 'Brief' on Web prepends the brief instruction to the next request; choosing 'Default' prepends no length text.
8. On Mobile, effort, once chosen in a conversation, is used for the next turn of that conversation only.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The CLI /fast must keep its provider and trust boundary: the code refuses a fast model that routes through a different access mode (agent/mod.rs:2951-2958).
- Response length on Mobile is satisfied only by 'Concise' [inferred from StyleSelector.tsx options].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add Brief/Default/Thorough to the Mobile style sheet.
- [proposed] Show plan-gated effort levels on Mobile, as Web and Chrome do.
- [proposed] Hide the Web effort control while a local model is selected, if local models return (ComposerFooter.tsx:1320 has no local check).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ComposerFooter effort panel and Fast pill | `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | Slider, thinking switch, gated levels, Fast switch and pill (1306-1400,1889-2078). |
| hook | useFastModeAvailability | `apps/web/features/chat/hooks/use-fast-mode-availability.ts` | Web Fast eligibility, calls /api/billing/overage (18-56). |
| service | resolveFastModeAvailability | `packages/contracts/types/src/fast-mode.ts` | Shared Fast rule and block messages (1-38). |
| store | thinking-store | `apps/web/shared/stores/thinking-store.ts` | Per-chat and global thinking, effort and fast flag, persisted under agi-thinking-store (store:agi-thinking-store). |
| store | style-store | `apps/web/features/chat/stores/style-store.ts` | Style and length state, instruction text builder (318-380). |
| component | StyleSelector (Web) | `apps/web/features/chat/components/Composer/StyleSelector.tsx` | Style list and Response Length buttons. |
| service | request-processor Fast and effort gates | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | fastModeRefusal (1881), effort clamp (1840), Fast capability gate (3704), refusal (5780). |
| hook | useChatStream request build | `apps/web/lib/hooks/useChatStream.ts` | Adds thinking_mode, effort, speed and style to the request (4473-4540,4668-4680). |
| component | EffortSlider and scoped effort | `apps/mobile/src/features/model-picker/components/EffortSlider.tsx` | Effort steps, per-conversation effort (30-76). |
| component | ComposerEffort | `apps/mobile/src/features/chat/components/ComposerEffort.tsx` | Composer gauge button and panel. |
| store | fastMode store | `apps/mobile/src/features/model-picker/fastMode.ts` | Mobile Fast state persisted as fast-mode-store, availability, speed on send (store:fast-mode-store). |
| component | SpeedControl | `apps/mobile/src/features/model-picker/components/SpeedControl.tsx` | Mobile Fast switch in the model sheet. |
| service | mobile streaming speed | `apps/mobile/services/streaming.ts` | withPickerSpeed adds speed fast (902-907). |
| component | Mobile StyleSelector | `apps/mobile/src/features/chat/components/StyleSelector.tsx` | Five styles; no length. |
| component | CLI picker effort bar | `apps/cli/src/tui/widgets/model_picker.rs` | Effort bar and keys (295-303,600-614,755-766). |
| command | CLI /fast and toggle_fast_mode | `apps/cli/src/agent/mod.rs` | Swaps to the provider fast model and back (2903-2967). |
| command | VS Code setAgentEffort | `apps/extension-vscode/src/core/commandSetup.ts` | Effort quick pick (1925-1946). |
| service | Chrome effort state | `apps/extension/src/features/cloud-bridge/managedModelPicker.ts` | getManagedEffortControlState and outbound effort (308-366). |
| test | reasoning flyout test | `apps/web/features/chat/components/Composer/__tests__/ComposerFooter.reasoning-flyout.test.tsx` | Effort levels, Fast pill, maturity label. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks effort or Fast; the app stores it per chat or globally in the browser or app store. | device | thinking-store.ts:20-90; fastMode.ts:44-86; EffortSlider.tsx:57-76 |
| Web checks usage-credit status for Fast mode. | device and our servers | use-fast-mode-availability.ts:27-42 (GET /api/billing/overage) |
| Mobile checks usage credits and workspace policy when Fast could apply. | device and our servers | fastMode.ts:51-77 |
| On send, the request carries effort, thinking_mode and speed 'fast'; Web prepends the style and length instruction as a system message. | device | useChatStream.ts:4533-4540,4668-4680; streaming.ts:902-907 |
| Server clamps effort to the plan, refuses ineligible Fast requests, checks usage credits and the capability switch, then calls the provider with the effort and the fast tier. | our servers | request-processor.ts:1840,5775-5810,3704-3710 |
| Provider answers; a fast tier is billed at a multiple of the usage. | outside service | packages/contracts/types/src/model-catalog.ts:763-768 (fastTier priceMultiplier) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Effort, thinking and fast preference | Web localStorage key agi-thinking-store; Mobile MMKV keys fast-mode-store and agent-control-store; Chrome chrome.storage.local; VS Code setting agent.effort | No server sync found for these preferences | Kept until the person changes them or clears storage |
| Style and length selection | Web style-store; Mobile chat view store per conversation (stores/chat/chatViewStore.ts:337-338,446-460) | Web syncs custom styles to the account (style-store.ts:300-315); the selection itself is not shown to sync | Not deleted automatically |

**Models and providers.** Effort ladders, defaults and whether Off is allowed come from the model's catalogue reasoning block, not from the provider name. The fast tier and price multiplier come from the catalogue fastTier field. Provider payload shaping happens on the server.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Fast mode and effort above the default need a resolved paid plan on Web and Mobile; an unknown plan is never allowed (fast-mode.ts:26-31; ComposerFooter.tsx:1327-1330). |
| Permissions | Workspace administrators can turn Fast mode off; the client reads the policy (Mobile: fastMode.ts:58-73) and the server reads workspace controls (request-processor.ts:5785-5788). |
| Subscription | Effort levels above the model default are plan-gated by manualModelSelection (model-catalog.ts:2610-2635). Fast mode needs a paid plan (fast-mode.ts:28). |
| Limits and metering | Fast mode is billed to usage credits at a multiple shown in the UI (ComposerFooter.tsx:2034; SpeedControl.tsx:23). The server refuses when usage credits are off (request-processor.ts, after the refusal at 5780). |
| Feature flags | Server capability gate FAST_MODE_CAPABILITY is fail-closed (request-processor.ts:3704-3710). Feature maturity label 'beta' for Fast mode (ComposerFooter.tsx:1323-1326). |
| Model compatibility | Only models with effort levels show effort; only models with fastTier show Fast. A model with an always-on reasoning mode shows 'Always on' and no off switch (ComposerFooter.tsx:260-266,1990-1996; ModelRow.tsx:71-74). |
| Provider restrictions | Some models reject sampling parameters or certain effort values; the server drops unsupported effort for a provider (request-processor.ts:1830-1841). |
| Local mode | Mobile local scope shows no effort or speed controls (ModelPickerSheet.tsx:336 requires cloud scope; SpeedControl only when scope is cloud, line 872). CLI effort bar is shown only when the model reasons and the provider has an effort knob (model_picker.rs:295-303). Web effort control follows the stored model, with no local-model check found (ComposerFooter.tsx:1320). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Model has no effort | Control not shown. | ComposerFooter.tsx:1320; Mobile test ComposerEffort.test.tsx 'offers nothing for a model with no effort levels' |
| Saved level not offered by the model | Falls back to the model's default (Web: effectiveEffort; Mobile: resolveEffortStep). | ComposerFooter.tsx:1334-1340; EffortSlider.tsx:41-49 |
| Usage credit check fails | Web and Mobile leave the decision to the server when the check cannot be read. | use-fast-mode-availability.ts:36-38; FastMode.test.tsx:143 |
| Account switch on Mobile | Another account's Fast checks are dropped. | fastMode.ts:60-63; FastMode.test.tsx:153 |
| Plan not yet known | Fast is never sent. | FastMode.test.tsx:164; fast-mode.ts:31 |
| Free promotion model | Effort control hidden when the free promotion fixes reasoning. | ComposerFooter.tsx:1317-1321 |
| Accessibility | Slider has thumb label, effort button has aria-label with level; Mobile gauge and 'Done' have labels. | ComposerFooter.tsx:1889,1950-1960; ComposerEffort.tsx:36-40,66-72 |
| Offline, cancel, timeout | not handled in the code for these controls beyond the failed-check fallback. | Searched use-fast-mode-availability.ts, fastMode.ts and ComposerFooter.tsx; only the catch branches at use-fast-mode-availability.ts:36-38 and Promise.allSettled at fastMode.ts:56-59 were found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/__tests__/ComposerFooter.reasoning-flyout.test.tsx`: Exact level counts per model, no control for non-reasoning model, Fast beta label, Fast pill present or absent.
- `packages/contracts/types/src/__tests__/fast-mode.test.ts`: Fast rule order, messages, credit check timing.
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.fast-mode-gate.test.ts`: Server refusal and admission of Fast mode, switch handling.
- `apps/mobile/src/features/model-picker/__tests__/FastMode.test.tsx`: Mobile Fast UI states and sending.
- `apps/mobile/src/features/model-picker/__tests__/fast-mode-stream.test.ts`: speed 'fast' added only for the picked model and when allowed.
- `apps/mobile/__tests__/ComposerEffort.test.tsx`: Effort button, gauge, slider, per-conversation and default saving.
- `apps/web/features/chat/components/Composer/StyleSelector.test.tsx`: Web style selector (titles not read).
- `apps/web/features/chat/stores/style-store.writing-sample.test.ts`: Style instruction with a writing sample.
- `apps/extension/__tests__/managed-model-picker.test.ts`: Chrome picker logic; effort tests not confirmed.
- `apps/cli/src/onboarding.rs`: Inline tests of the Fast mode cost note (lines 1192-1240).

**Test scenarios**

- **Gated effort on a lower plan**
  1. Sign in on a plan that gates higher effort.
  2. Pick a reasoning model.
  3. Open the effort panel and drag to the locked mark.
  - Expected: Slider stops at the allowed levels; a lock mark and 'not included in your plan' text show; Upgrade opens the upgrade flow.
- **Fast on Free**
  1. Sign in on Free.
  2. Pick a model with a fast tier.
  3. Open the Fast pill.
  - Expected: Control disabled with 'Fast mode is available on paid plans and is billed to usage credits.'
- **Fast request refusal**
  1. Send a chat request with speed 'fast' from a Free account.
  - Expected: HTTP 403 with code fast_mode_unavailable.
- **Mobile effort per chat**
  1. Open chat A, set a high level.
  2. Open chat B.
  - Expected: B uses the default level; A keeps its own.
- **Brief length**
  1. Choose Brief on Web.
  2. Send a one-line question and read the network request.
  - Expected: A system message with the brief instruction precedes the user message.
- **CLI /fast**
  1. Run /fast, then /fast again.
  - Expected: First reply 'Fast mode ON ...' with credits per million tokens; second 'OFF, back to <original model>'.

**Where to look when it fails**

- Server response error code fast_mode_unavailable and param speed (request-processor.ts:5795-5802).
- Web: GET /api/billing/overage result; Mobile: fetchUsageSnapshot and workspace policy path.
- CLI: 'Fast mode failed: <error>' system message (tui_app.rs:5836).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/015-model-selector-interface.md](../../70-qa/test-plans/web/015-model-selector-interface.md)
- Desktop: [70-qa/test-plans/desktop/015-model-selector-interface.md](../../70-qa/test-plans/desktop/015-model-selector-interface.md)
- Mobile: [70-qa/test-plans/mobile/015-model-selector-interface.md](../../70-qa/test-plans/mobile/015-model-selector-interface.md)
- CLI: [70-qa/test-plans/cli/015-model-selector-interface.md](../../70-qa/test-plans/cli/015-model-selector-interface.md)
- VS Code: [70-qa/test-plans/vscode/015-model-selector-interface.md](../../70-qa/test-plans/vscode/015-model-selector-interface.md)
- Chrome: [70-qa/test-plans/chrome/015-model-selector-interface.md](../../70-qa/test-plans/chrome/015-model-selector-interface.md)

## 10. Gaps and dependencies

- **CLI Fast mode is a model swap, not a same-model tier, and has no plan or credit gate.** Affects: CLI. Evidence: agent/mod.rs:2931-2962; brief S15.23 Unfinished. Work needed: Follow the brief: per-model fast tier, speed field to the gateway, billing; then rewire /fast.
- **Mobile has no response-length setting.** Affects: Mobile. Evidence: apps/mobile/src/features/chat/components/StyleSelector.tsx:14-24. Work needed: Add Brief, Default, Thorough or document that Concise is the length control.
- **Mobile effort has no visible plan gating; users can pick a level the server will clamp.** Affects: Mobile. Evidence: EffortSlider.tsx:36-47; request-processor.ts:1840. Work needed: Use splitEffortsByEntitlement on the device and show the unlock text.
- **VS Code effort is global and not shaped by the model; no Fast or style or length.** Affects: VS Code. Evidence: commandSetup.ts:1925-1946; platform/config.ts:219. Work needed: Use the model's effort levels (helper supportedEffort exists in modelConstants.ts); add length if required.
- **Chrome has no Fast mode and no length control.** Affects: Chrome. Evidence: managedModelPicker.ts:308-366; side_panel.ts:11315-11340. Work needed: Add if required by parity; else record as not applicable.
- **Docs and brief are stale: surface-feature-matrix says Mobile Fast mode absent; brief cites request-processor.ts:343 for length.** Affects: Documentation readers. Evidence: docs/product/surface-feature-matrix.md Fast mode section vs fastMode.ts and streaming.ts:902-907. Work needed: Update the matrix and brief from code.
- **No test found for the Web request body carrying a style or length system message or for the CLI /fast swap round trip beyond agent/mod.rs unit tests.** Affects: Web, CLI. Evidence: Searched Composer and agent tests; agent/mod.rs:4890-4918 and 5101 have toggle tests. Work needed: Add an end-to-end check for style text in the request.

**Depends on**

- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-chat-turn-pipeline
- SYS-api-and-contracts
- SYS-authorization-and-workspaces
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- api:GET /api/billing/overage
- api:POST /api/llm/v1/chat/completions
- store:agi-thinking-store
- store:fast-mode-store

## Unknown

- Whether effort and thinking preferences sync to the account (no sync call found in the files read).
- How Mobile chat style reaches the request beyond the system prompt text (only buildChatViewSystemPrompt was read).
- Contents of /api/billing/overage beyond the 'enabled' field used by the client.
- Whether the CLI sends effort to the provider on every request (only the config and picker paths were read).
- Whether VS Code applies the model's own effort ladder when sending (helper exists, call site not found).
- How the server uses 'unsupportedRequestParameter' for sampling and effort conflicts.
