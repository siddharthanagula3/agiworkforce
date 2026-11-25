---
id: "GAPS-AREA-015"
type: "gap-list"
title: "Gaps: Model-selector interface"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 15. Model-selector interface

118 open gaps that touch this area. Area page: [20-features/015-model-selector-interface](../../20-features/015-model-selector-interface/README.md).

## CMP-CP127

**Fast mode command**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F015-09](../../20-features/015-model-selector-interface/F015-09-reasoning-effort-fast-mode-and-response-style.md), [F076-12](../../20-features/076-model-capability-registry/F076-12-serving-speed-and-batch.md)
- Detail: There is no separate /ultrafast tier /fast toggles fast mode; there is no separate /ultrafast tier.
- Evidence: apps/cli/src/repl/slash_commands.rs:454; tui/tui_app.rs:5766

## CMP-DP71

**Fast mode for the top model (lower latency, higher cost)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F015-09](../../20-features/015-model-selector-interface/F015-09-reasoning-effort-fast-mode-and-response-style.md), [F076-12](../../20-features/076-model-capability-registry/F076-12-serving-speed-and-batch.md)
- Detail: The code composer does not offer it Chat has fast mode; the code composer does not offer it.
- Evidence: apps/web/features/chat/hooks/use-fast-mode-availability.ts; searched: fast mode in apps/web/features/code/

## CMP-M195

**Switch models when a message is flagged**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F015-12](../../20-features/015-model-selector-interface/F015-12-switch-safety-fallback-and-substitution-notices.md)
- Detail: No setting to fall back to another model when a message is flagged.
- Evidence: searched: flagged, switch model in apps/mobile/src/features/settings, apps/mobile/src/features/model-picker

## CMP-M25

**Long-press send to pick a model for one message**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F015-06](../../20-features/015-model-selector-interface/F015-06-per-message-model-override.md)
- Detail: Send has no long-press menu; the model chip changes the model for the chat.
- Evidence: searched: onLongPress in SendButton.tsx, 'one message' model in apps/mobile/src/features/chat, model-picker

## CMP-MP27

**Context window size shown for the plan or model**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F015-07](../../20-features/015-model-selector-interface/F015-07-capability-and-cost-badges.md), [F015-12](../../20-features/015-model-selector-interface/F015-12-switch-safety-fallback-and-substitution-notices.md), [F076-01](../../20-features/076-model-capability-registry/F076-01-text-chat-input-and-output.md), [F076-02](../../20-features/076-model-capability-registry/F076-02-picture-and-document-input.md), [F076-04](../../20-features/076-model-capability-registry/F076-04-tool-calls-and-multi-step-tool-use.md), [F076-07](../../20-features/076-model-capability-registry/F076-07-context-window-and-output-limits.md), [F079-03](../../20-features/079-routing-and-model-neutral-orchestration/F079-03-understanding-the-request.md), [F079-07](../../20-features/079-routing-and-model-neutral-orchestration/F079-07-health-fallback-and-switch-offers.md), [F091-06](../../20-features/091-model-and-inference-components/F091-06-context-fitting-and-token-counting.md)
- Detail: The picker shows no per-model size Plans page shows plan context window; the picker shows no per-model size.
- Evidence: apps/mobile/src/features/settings/plans/index.tsx:71-74

## CMP-MP33

**PDF pages and embedded images read by the model**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F015-12](../../20-features/015-model-selector-interface/F015-12-switch-safety-fallback-and-substitution-notices.md), [F043-02](../../20-features/043-image-and-visual-understanding/F043-02-read-documents-charts-diagrams-and-handwriting-in.md), [F043-04](../../20-features/043-image-and-visual-understanding/F043-04-copy-text-out-of-an-image-ocr-on-mobile.md), [F076-01](../../20-features/076-model-capability-registry/F076-01-text-chat-input-and-output.md), [F076-02](../../20-features/076-model-capability-registry/F076-02-picture-and-document-input.md), [F076-04](../../20-features/076-model-capability-registry/F076-04-tool-calls-and-multi-step-tool-use.md), [F076-07](../../20-features/076-model-capability-registry/F076-07-context-window-and-output-limits.md), [F079-03](../../20-features/079-routing-and-model-neutral-orchestration/F079-03-understanding-the-request.md), [F079-07](../../20-features/079-routing-and-model-neutral-orchestration/F079-07-health-fallback-and-switch-offers.md)
- Detail: No page-count rule or image-reading promise is shown in the app PDFs upload within shared size and count limits; no page-count rule or image-reading promise is shown in the app.
- Evidence: apps/mobile/src/features/chat/utils/attachmentValidation.ts:26-46; searched: page limit in src

## CMP-V23

**Fast mode (/fast)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F015-09](../../20-features/015-model-selector-interface/F015-09-reasoning-effort-fast-mode-and-response-style.md), [F076-12](../../20-features/076-model-capability-registry/F076-12-serving-speed-and-batch.md)
- Detail: No fast-mode switch.
- Evidence: searched: fast mode, fastMode, /fast in apps/extension-vscode/src

## CMP-V42

**Fast mode for quicker replies**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F015-09](../../20-features/015-model-selector-interface/F015-09-reasoning-effort-fast-mode-and-response-style.md), [F076-12](../../20-features/076-model-capability-registry/F076-12-serving-speed-and-batch.md)
- Detail: The CLI lists /fast but the editor cannot run it and has no fast switch.
- Evidence: crates/agiworkforce-command-registry/src/lib.rs:164; searched: fastMode in apps/extension-vscode/src

## CMP-V46

**Offer a cheaper model near a usage limit**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F015-12](../../20-features/015-model-selector-interface/F015-12-switch-safety-fallback-and-substitution-notices.md), [F079-04](../../20-features/079-routing-and-model-neutral-orchestration/F079-04-pick-a-model-yourself-and-locks.md), [F079-07](../../20-features/079-routing-and-model-neutral-orchestration/F079-07-health-fallback-and-switch-offers.md), [F091-05](../../20-features/091-model-and-inference-components/F091-05-retries-fallback-and-provider-errors.md)
- Detail: The panel shows context use and a limit error with a recovery link, but never offers a cheaper model before the limit.
- Evidence: apps/extension-vscode/src/core/cloudUtilityErrorActions.ts:133; searched: 90%, nearLimit in apps/extension-vscode/src

## CMP-VP15

**Notice when a request is moved to another model**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F015-12](../../20-features/015-model-selector-interface/F015-12-switch-safety-fallback-and-substitution-notices.md), [F079-08](../../20-features/079-routing-and-model-neutral-orchestration/F079-08-which-model-answered-and-why.md)
- Detail: There is no separate reroute or verification notice Each reply records which model served it when Auto routing picks one; there is no separate reroute or verification notice.
- Evidence: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:5254-5297

## CMP-W320

**Capabilities: switch models when a message is flagged**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F015-12](../../20-features/015-model-selector-interface/F015-12-switch-safety-fallback-and-substitution-notices.md)
- Detail: No toggle to switch model when a message is flagged.
- Evidence: searched: switch models, flagged in apps/web/features/settings

## CMP-W86

**Interactive model and effort recommender**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F015-02](../../20-features/015-model-selector-interface/F015-02-browse-and-search-the-model-list.md), [F015-03](../../20-features/015-model-selector-interface/F015-03-favourites-recent-models-and-recommended-list.md)
- Detail: No recommender; the picker only gives one line per model.
- Evidence: searched: recommendModel, ModelAdvisor in apps/web, packages

## CMP-W90

**Show or hide older models**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F015-08](../../20-features/015-model-selector-interface/F015-08-speed-status-and-plan-labels.md), [F076-13](../../20-features/076-model-capability-registry/F076-13-regions-data-retention-routes-and-model-lifecycle.md), [F091-01](../../20-features/091-model-and-inference-components/F091-01-model-catalog-providers-and-lifecycle.md)
- Detail: The picker offers current catalog models only and labels retiring ones; there is no older-model switch.
- Evidence: apps/web/features/models/lib/model-presentation.ts:44-54

## CMP-WP307

**Admin Model Test: why a member cannot see a model**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F015-08](../../20-features/015-model-selector-interface/F015-08-speed-status-and-plan-labels.md)
- Detail: Not a per-member model lookup A policy diagnosis shows the effective controls, but not a per-member model lookup.
- Evidence: apps/web/features/workspace-console/components/WorkspacePolicyDiagnostics.tsx:97

## CMP-WP32

**Usage page: per-model weekly limits**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F015-07](../../20-features/015-model-selector-interface/F015-07-capability-and-cost-badges.md), [F015-08](../../20-features/015-model-selector-interface/F015-08-speed-status-and-plan-labels.md), [F082-03](../../20-features/082-usage-dashboard-and-limit-ui/F082-03-usage-by-model-feature-work-and-project.md)
- Detail: No row per model One extra weekly bar for flagship models when shown; no row per model.
- Evidence: apps/web/features/settings/sections/UsageSection.tsx:1381-1393

## CMP-WP58

**Switch models when a message is flagged (setting and label)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F015-12](../../20-features/015-model-selector-interface/F015-12-switch-safety-fallback-and-substitution-notices.md)
- Detail: There is no setting to turn switching on or off A notice and the answered-by chip show when another model replied; there is no setting to turn switching on or off. Searched.
- Evidence: searched: flagged, switchModelsWhenFlagged in apps/web/features/settings, lib/models; apps/web/features/chat/components/UnavailableModelNotice.tsx

## CMP-WP73

**Model lineup by plan**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F015-08](../../20-features/015-model-selector-interface/F015-08-speed-status-and-plan-labels.md), [F079-01](../../20-features/079-routing-and-model-neutral-orchestration/F079-01-auto-picks-the-model.md)
- Detail: The Free plan has no manual model choice (Auto and free-quota models) The Free plan has no manual model choice (Auto and free-quota models); paid plans choose any listed model.
- Evidence: packages/contracts/types/src/model-catalog.ts:1234-1250,1260-1270

## CMP-WP74

**Disabled model options explain why**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F015-08](../../20-features/015-model-selector-interface/F015-08-speed-status-and-plan-labels.md)
- Detail: Does not explain capacity or role blocks The picker names the plan needed for a locked model but does not explain capacity or role blocks.
- Evidence: packages/ui/unified-chat/src/components/ModelSelector.tsx:31,53

## CMP-WP76

**Setting that lets a fast model switch itself to thinking for hard questions**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F015-04](../../20-features/015-model-selector-interface/F015-04-auto-and-default-for-new-chats.md), [F079-01](../../20-features/079-routing-and-model-neutral-orchestration/F079-01-auto-picks-the-model.md), [F079-03](../../20-features/079-routing-and-model-neutral-orchestration/F079-03-understanding-the-request.md), [F079-04](../../20-features/079-routing-and-model-neutral-orchestration/F079-04-pick-a-model-yourself-and-locks.md)
- Detail: A chat on a fixed model has no switch that lets it escalate to thinking Auto mode picks the model and effort for each message, but a chat on a fixed model has no switch that lets it escalate to thinking.
- Evidence: searched: autoSwitch, auto-switch, escalat in apps/web/features/settings, apps/web/features/models, apps/web/features/chat/components/Composer; Auto row at apps/web/features/chat/components/Composer/ComposerFooter.tsx:1635

## GAP-AREA015-LW04

**Per-turn model override: the only use of modelOverrideId in the Web chat page is the free-quota media path, not a general per-message model switch.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-015
- Detail: Area 15. Model-selector interface
- Evidence: apps/web/features/chat/pages/WebChatPage.tsx:504, 2610-2613, 4385-4388

## GAP-CAP-model-selection-01

**Model picker on the composer: Chrome picker has no search. At 390 px wide on web the model name is hidden and only an icon shows (seen defect W-5 and W-6). Free picker shortlist hides the active model.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F015-01](../../20-features/015-model-selector-interface/F015-01-see-the-model-the-next-message-will-use.md), [F015-02](../../20-features/015-model-selector-interface/F015-02-browse-and-search-the-model-list.md), [F015-05](../../20-features/015-model-selector-interface/F015-05-pick-a-model-and-keep-it.md), [F079-04](../../20-features/079-routing-and-model-neutral-orchestration/F079-04-pick-a-model-yourself-and-locks.md)
- Requirement items: S15.01, S15.04, S15.10, S15.30, S79.02
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-model-selection-02

**Reasoning effort levels per model: Code sessions on cloud have no effort selector (DP69). Admin cap is one workspace-wide level, not per model (WP283). Top level stops at Max.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F015-09](../../20-features/015-model-selector-interface/F015-09-reasoning-effort-fast-mode-and-response-style.md), [F076-06](../../20-features/076-model-capability-registry/F076-06-reasoning-effort-and-sampling-controls.md)
- Requirement items: S15.22, S76.26
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-model-selection-04

**Automatic model choice (Auto): Free plan: no Auto entry on web (seen). A fixed-model chat cannot escalate itself to thinking (WP76). Seen: Auto answered a trivial question with Thought for 5s.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F015-04](../../20-features/015-model-selector-interface/F015-04-auto-and-default-for-new-chats.md), [F079-01](../../20-features/079-routing-and-model-neutral-orchestration/F079-01-auto-picks-the-model.md), [F079-03](../../20-features/079-routing-and-model-neutral-orchestration/F079-03-understanding-the-request.md), [F079-04](../../20-features/079-routing-and-model-neutral-orchestration/F079-04-pick-a-model-yourself-and-locks.md)
- Requirement items: S15.08, S79.01, S79.04, S79.09, S79.12, S79.14, S79.16, S79.30
- Detail: Claude unknown, ChatGPT partly; AGI built

## GAP-CAP-model-selection-05

**Which model answered, and why Auto chose it: Seen: the Auto chose line turns into a plain model name after reload (cosmetic defect). VS Code has no separate reroute notice.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F015-12](../../20-features/015-model-selector-interface/F015-12-switch-safety-fallback-and-substitution-notices.md), [F079-08](../../20-features/079-routing-and-model-neutral-orchestration/F079-08-which-model-answered-and-why.md)
- Requirement items: S15.32, S15.33, S79.26, S79.27, S79.28
- Detail: Claude partly, ChatGPT unknown; AGI partly built

## GAP-CAP-model-selection-06

**Which models each plan gets: Web comparison row WP73 says Free has no manual choice, but the person saw Free pick a second model from All models. Code tier policy says Free is auto only. Which one is intended is not recorded. Seen: silent 403 on a free-model endpoint for a Premium user.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F015-08](../../20-features/015-model-selector-interface/F015-08-speed-status-and-plan-labels.md)
- Requirement items: S15.18
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-model-selection-07

**Locked or unavailable model explains why: Picker names the plan only; it does not explain capacity or role blocks (WP74). Seen: locked pill overlaps icons and clips at 390 px.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F015-08](../../20-features/015-model-selector-interface/F015-08-speed-status-and-plan-labels.md)
- Requirement items: S15.18, S15.21
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-model-selection-09

**Heavier models use the allowance faster: Mobile and Chrome pickers show no cost cue. No per-model weekly bar (WP32).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F015-07](../../20-features/015-model-selector-interface/F015-07-capability-and-cost-badges.md), [F015-08](../../20-features/015-model-selector-interface/F015-08-speed-status-and-plan-labels.md)
- Requirement items: S15.16, S15.17
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-model-selection-10

**Fast speed tier: No same-model fast tier on the CLI; none in VS Code; code composer has no Fast; registry has no serving-speed tiers (S76.36 missing).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F015-09](../../20-features/015-model-selector-interface/F015-09-reasoning-effort-fast-mode-and-response-style.md), [F076-12](../../20-features/076-model-capability-registry/F076-12-serving-speed-and-batch.md)
- Requirement items: S15.23, S76.36
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-model-selection-14

**Automatic switch to another model for safety: No setting to switch or pause on flagged messages on web, desktop or mobile; no fallback notice on mobile (S15.33) or VS Code.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F015-12](../../20-features/015-model-selector-interface/F015-12-switch-safety-fallback-and-substitution-notices.md)
- Requirement items: S15.33
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-model-selection-15

**Fallback to another model at a limit or outage: VS Code does not offer a cheaper model near a limit (V46). Seen: Stop shows a misleading model failed message (W-18).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F015-12](../../20-features/015-model-selector-interface/F015-12-switch-safety-fallback-and-substitution-notices.md), [F079-04](../../20-features/079-routing-and-model-neutral-orchestration/F079-04-pick-a-model-yourself-and-locks.md), [F079-07](../../20-features/079-routing-and-model-neutral-orchestration/F079-07-health-fallback-and-switch-offers.md), [F091-05](../../20-features/091-model-and-inference-components/F091-05-retries-fallback-and-provider-errors.md)
- Requirement items: S15.33, S79.16, S79.20, S91.22
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-model-selection-16

**Model cannot do what the message needs: Mobile, CLI and Chrome have no incompatibility dialog or attachment choice. Registry does not record maximum file, image, audio or video sizes (S76.30 missing). Output and tool badges missing on mobile.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F015-12](../../20-features/015-model-selector-interface/F015-12-switch-safety-fallback-and-substitution-notices.md), [F076-01](../../20-features/076-model-capability-registry/F076-01-text-chat-input-and-output.md), [F076-02](../../20-features/076-model-capability-registry/F076-02-picture-and-document-input.md), [F076-04](../../20-features/076-model-capability-registry/F076-04-tool-calls-and-multi-step-tool-use.md), [F076-07](../../20-features/076-model-capability-registry/F076-07-context-window-and-output-limits.md), [F079-03](../../20-features/079-routing-and-model-neutral-orchestration/F079-03-understanding-the-request.md), [F079-07](../../20-features/079-routing-and-model-neutral-orchestration/F079-07-health-fallback-and-switch-offers.md)
- Requirement items: S15.34, S15.35, S76.01, S76.03, S76.06, S76.21, S76.30, S79.11, S79.21
- Detail: Claude partly, ChatGPT partly; AGI partly built

## GAP-CAP-model-selection-17

**Retry or regenerate with a different model: No per-turn model switch on CLI and VS Code. Seen: Retry on a failed turn regenerated the first message and hid later turns (W-9 defect).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F015-06](../../20-features/015-model-selector-interface/F015-06-per-message-model-override.md)
- Requirement items: S15.31
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-model-selection-18

**Default model, effort and new-chat start: Mobile has no lasting-default setting; project default not in CLI or Chrome. Free: new chat inherits last model (seen).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F015-04](../../20-features/015-model-selector-interface/F015-04-auto-and-default-for-new-chats.md), [F015-05](../../20-features/015-model-selector-interface/F015-05-pick-a-model-and-keep-it.md), [F079-05](../../20-features/079-routing-and-model-neutral-orchestration/F079-05-project-default-model.md)
- Requirement items: S15.09, S15.29, S15.30, S79.03
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-model-selection-21

**Model retirement and replacement notices: No retiring notice on mobile, VS Code, Chrome. No older-model toggle (W90).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F015-08](../../20-features/015-model-selector-interface/F015-08-speed-status-and-plan-labels.md), [F076-13](../../20-features/076-model-capability-registry/F076-13-regions-data-retention-routes-and-model-lifecycle.md), [F091-01](../../20-features/091-model-and-inference-components/F091-01-model-catalog-providers-and-lifecycle.md)
- Requirement items: S15.20, S76.37, S91.05, S91.06
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-model-selection-23

**Context window shown per model: Comparison row notes the cited picker is not in web chat; mobile shows plan window only. No long-context variant pick (D15).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F015-07](../../20-features/015-model-selector-interface/F015-07-capability-and-cost-badges.md), [F076-07](../../20-features/076-model-capability-registry/F076-07-context-window-and-output-limits.md), [F091-06](../../20-features/091-model-and-inference-components/F091-06-context-fitting-and-token-counting.md)
- Requirement items: S15.15, S76.28, S76.29, S91.18
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-model-selection-24

**Model guidance and recommender: Ledger S15.11 expects a description; D-2026-11-12-05 removes descriptions from rows. No recommender (W86).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F015-02](../../20-features/015-model-selector-interface/F015-02-browse-and-search-the-model-list.md), [F015-03](../../20-features/015-model-selector-interface/F015-03-favourites-recent-models-and-recommended-list.md)
- Requirement items: S15.07, S15.11
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-model-selection-28

**Bring your own provider or gateway: No provider or route lock on web, desktop, API by decision D-2026-09-28-07.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F015-10](../../20-features/015-model-selector-interface/F015-10-sampling-and-provider-route-developer-controls.md), [F015-11](../../20-features/015-model-selector-interface/F015-11-local-and-own-key-routes.md), [F079-04](../../20-features/079-routing-and-model-neutral-orchestration/F079-04-pick-a-model-yourself-and-locks.md)
- Requirement items: S15.26, S15.28, S79.17, S79.18
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-model-selection-29

**Local on-device model selection: None seen in the ledger, but no person has run local selection or the Local-never-leaves check.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F015-11](../../20-features/015-model-selector-interface/F015-11-local-and-own-key-routes.md), [F079-06](../../20-features/079-routing-and-model-neutral-orchestration/F079-06-privacy-first-routing.md)
- Requirement items: S15.27, S79.08
- Detail: Claude no, ChatGPT no; AGI partly built

## GAP-CAP-research-15

**Which model runs research: The context threshold is a constant in code (500,000); the project says limits should be configuration. Not checked against the catalogue guard.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F015-12](../../20-features/015-model-selector-interface/F015-12-switch-safety-fallback-and-substitution-notices.md), [F017-01](../../20-features/017-assistant-message-components/F017-01-who-answered-and-live-status.md), [F079-03](../../20-features/079-routing-and-model-neutral-orchestration/F079-03-understanding-the-request.md)
- Requirement items: S15.32, S17.36, S79.10
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-F015-01-01

**The local-model reassurance is only in the tooltip and hidden receipt, not in the visible label.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-01](../../20-features/015-model-selector-interface/F015-01-see-the-model-the-next-message-will-use.md)
- Detail: Affects: Web and Desktop users with a local model. Work needed: Decide whether the visible Local badge is enough, or add visible boundary text.
- Evidence: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1274-1275, 1459-1460

## GAP-F015-01-02

**The CLI header shows the model id, not the display name.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-01](../../20-features/015-model-selector-interface/F015-01-see-the-model-the-next-message-will-use.md)
- Detail: Affects: CLI. Work needed: Resolve the display name from the catalogue for the header.
- Evidence: apps/cli/src/tui/tui_app.rs:1054, 2460-2463

## GAP-F015-01-03

**No test compares the label to the model actually sent in the request.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-01](../../20-features/015-model-selector-interface/F015-01-see-the-model-the-next-message-will-use.md)
- Detail: Affects: All apps. Work needed: Add a test per app that reads the request model after a pick.
- Evidence: No such test found in the folders searched

## GAP-F015-01-04

**Desktop internal Tauri build was not inspected.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-01](../../20-features/015-model-selector-interface/F015-01-see-the-model-the-next-message-will-use.md)
- Detail: Affects: Retained internal Desktop. Work needed: Read it or mark it out of scope.
- Evidence: apps/desktop/src/features/v3/DesktopShellV3.tsx lists a picker; behaviour not read

## GAP-F015-02-01

**The CLI overlay disappears when a search matches nothing and shows no message.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-02](../../20-features/015-model-selector-interface/F015-02-browse-and-search-the-model-list.md)
- Detail: Affects: CLI. Work needed: Render the search bar and a no-match line when rows are empty.
- Evidence: apps/cli/src/tui/widgets/model_picker.rs:348

## GAP-F015-02-02

**The brief says Chrome search is missing, but it exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-02](../../20-features/015-model-selector-interface/F015-02-browse-and-search-the-model-list.md)
- Detail: Affects: Documentation and Chrome. Work needed: Update the brief; add a Chrome search entry to the surface matrix.
- Evidence: apps/extension/src/side_panel.ts:11265-11280

## GAP-F015-02-03

**VS Code sidebar popover has no search; only the quick pick filters.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-02](../../20-features/015-model-selector-interface/F015-02-browse-and-search-the-model-list.md)
- Detail: Affects: VS Code. Work needed: Add a search field or document that the quick pick is the searchable path.
- Evidence: webviewContent.ts:3288; ChatStateManager.ts:1997-2030

## GAP-F015-02-04

**Web catalogue search does not match the purpose phrase, while the short-list search does.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-02](../../20-features/015-model-selector-interface/F015-02-browse-and-search-the-model-list.md)
- Detail: Affects: Web and Desktop. Work needed: Pick one matching rule and share it.
- Evidence: ModelCatalogue.tsx:387-389 versus ComposerFooter.tsx:1260-1270

## GAP-F015-02-05

**Web and Desktop hide the on-device section on the Free plan, against the rule that local inference needs no paid plan.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-02](../../20-features/015-model-selector-interface/F015-02-browse-and-search-the-model-list.md)
- Detail: Affects: Free Desktop and Web users with local models. Work needed: Decide if local models must be listed on Free and remove the plan gate.
- Evidence: ComposerFooter.tsx:1721, 1766 [inferred conflict]

## GAP-F015-02-06

**CLI rows have no per-row purpose phrase; Mobile has none by decision.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-02](../../20-features/015-model-selector-interface/F015-02-browse-and-search-the-model-list.md)
- Detail: Affects: CLI and Mobile. Work needed: Record the brief item S15.11 as not applicable on Mobile; decide for CLI.
- Evidence: model_picker.rs:547-593; D-2026-11-12-05

## GAP-F015-02-NOTBUILT

**Browse and search the model list: not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F015-02](../../20-features/015-model-selector-interface/F015-02-browse-and-search-the-model-list.md)
- Requirement items: S15.04
- Detail: Chrome: S15.04

## GAP-F015-03-01

**CLI, VS Code and Chrome have no favourites, and CLI, VS Code and Chrome have no recents.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-03](../../20-features/015-model-selector-interface/F015-03-favourites-recent-models-and-recommended-list.md)
- Detail: Affects: CLI, VS Code, Chrome. Work needed: Build favourites on each surface from the shared account namespace.
- Evidence: managedModelPicker.ts:154, 214 (empty favourites); no favourite or recent code in apps/cli/src or apps/extension-vscode/src/features/model-picker

## GAP-F015-03-02

**Web recents are device-only while favourites sync.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-03](../../20-features/015-model-selector-interface/F015-03-favourites-recent-models-and-recommended-list.md)
- Detail: Affects: Web and Desktop users on several devices. Work needed: Decide whether recents should sync; if so add a preference key.
- Evidence: modelStore.ts:217-223

## GAP-F015-03-03

**Mobile recents list on-device models only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-03](../../20-features/015-model-selector-interface/F015-03-favourites-recent-models-and-recommended-list.md)
- Detail: Affects: Mobile Cloud users. Work needed: Confirm that this is intended by decision D-2026-11-12-05, or list cloud recents.
- Evidence: ModelPickerSheet.tsx:396-404

## GAP-F015-03-04

**Local models on Web and Desktop have no star.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-03](../../20-features/015-model-selector-interface/F015-03-favourites-recent-models-and-recommended-list.md)
- Detail: Affects: Desktop users with local models. Work needed: Decide if local models can be favourites; ids are not in the catalogue.
- Evidence: ComposerFooter.tsx:529-620 (no toggle)

## GAP-F015-03-05

**The three-favourite short-list cap hides the rest from the quick list.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-03](../../20-features/015-model-selector-interface/F015-03-favourites-recent-models-and-recommended-list.md)
- Detail: Affects: Web and Desktop heavy users. Work needed: Show an 'N more' hint using favouritesOverflow.
- Evidence: model-picker.ts:363-364 (favouritesOverflow is computed)

## GAP-F015-03-NOTBUILT

**Favourites, recent models and recommended list: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F015-03](../../20-features/015-model-selector-interface/F015-03-favourites-recent-models-and-recommended-list.md)
- Requirement items: S15.05, S15.06, S15.07
- Detail: CLI: S15.05, S15.06, S15.07; VS Code: S15.05, S15.06; Chrome: S15.05, S15.06

## GAP-F015-04-01

**CLI /model overlay has no Auto row; Auto is reachable only by the launch flag.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-04](../../20-features/015-model-selector-interface/F015-04-auto-and-default-for-new-chats.md)
- Detail: Affects: CLI. Work needed: Add Auto to the overlay for managed sessions or document the flag.
- Evidence: apps/cli/src/tui/widgets/model_picker.rs:126-193; apps/cli/src/lib.rs:470-478

## GAP-F015-04-02

**No default-model setting on Mobile or Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-04](../../20-features/015-model-selector-interface/F015-04-auto-and-default-for-new-chats.md)
- Detail: Affects: Mobile and Chrome. Work needed: Decide if the last-choice behaviour satisfies S15.09 and update the brief.
- Evidence: No setting found; Mobile restores per-mode last choice (store.ts:205-234); Chrome stored choice (side_panel.ts:11487-11500)

## GAP-F015-04-03

**The brief's CLI line references are stale.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-04](../../20-features/015-model-selector-interface/F015-04-auto-and-default-for-new-chats.md)
- Detail: Affects: Documentation. Work needed: Regenerate the brief's code column.
- Evidence: apps/cli/src/lib.rs:461, 1194, 2264, 4317, 4350 are unrelated code

## GAP-F015-04-04

**Whether /model choices in the CLI become the saved default is not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-04](../../20-features/015-model-selector-interface/F015-04-auto-and-default-for-new-chats.md)
- Detail: Affects: CLI. Work needed: Confirm and, if intended, add a save step or a command.
- Evidence: apps/cli/src/tui/tui_app.rs:5073-5109 does not write config

## GAP-F015-04-05

**Free Web users cannot use Auto even though a free routing option may be wanted by the product.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-04](../../20-features/015-model-selector-interface/F015-04-auto-and-default-for-new-chats.md)
- Detail: Affects: Free Web and Desktop users. Work needed: Product decision; not a code defect if intended.
- Evidence: ComposerFooter.tsx:1346-1348

## GAP-F015-05-01

**No incompatibility dialog on Mobile or the CLI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-05](../../20-features/015-model-selector-interface/F015-05-pick-a-model-and-keep-it.md)
- Detail: Affects: Mobile and CLI users who switch mid-chat. Work needed: Add a shared compatibility check and a confirm step.
- Evidence: Brief S15.34 lists Mobile and CLI missing; no check in ModelPickerSheet.tsx:443-563 or model_picker.rs:769-798

## GAP-F015-05-02

**CLI model choice is not persisted outside the session in the code read.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-05](../../20-features/015-model-selector-interface/F015-05-pick-a-model-and-keep-it.md)
- Detail: Affects: CLI. Work needed: Confirm and decide on saving or a flag.
- Evidence: apps/cli/src/tui/tui_app.rs:5073-5109

## GAP-F015-05-03

**Desktop local model choice is lost on reload.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-05](../../20-features/015-model-selector-interface/F015-05-pick-a-model-and-keep-it.md)
- Detail: Affects: Desktop. Work needed: Decide per-chat persistence consistent with the trust rules.
- Evidence: apps/web/features/desktop-host/lib/local-model-selection.ts

## GAP-F015-05-04

**Chrome applies a regenerate-with-model as a lasting choice.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-05](../../20-features/015-model-selector-interface/F015-05-pick-a-model-and-keep-it.md)
- Detail: Affects: Chrome. Work needed: Separate a one-turn choice from the stored choice if one-turn is wanted.
- Evidence: apps/extension/src/side_panel.ts:6017-6032, 9595

## GAP-F015-05-05

**The draft's cited lines for commit and same-model checks were stale.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-05](../../20-features/015-model-selector-interface/F015-05-pick-a-model-and-keep-it.md)
- Detail: Affects: Documentation. Work needed: Use the lines in this page.
- Evidence: Real lines are ComposerFooter.tsx:1141-1195

## GAP-F015-06-01

**No one-off model choice exists for a new message.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-06](../../20-features/015-model-selector-interface/F015-06-per-message-model-override.md)
- Detail: Affects: All apps. Work needed: Decide the control and the request field.
- Evidence: No composer control found; only regenerate paths (WebChatPage.tsx:5877-5885)

## GAP-F015-06-02

**Mobile and Chrome retry-with-model keep the new model afterwards, so they are not per-turn overrides.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-06](../../20-features/015-model-selector-interface/F015-06-per-message-model-override.md)
- Detail: Affects: Mobile and Chrome. Work needed: Separate the one-turn path or rename the action.
- Evidence: apps/mobile/app/(app)/chat/[id].tsx:1429-1448; apps/extension/src/side_panel.ts:6017-6032, 9595

## GAP-F015-06-03

**On Web a usage limit card makes the retry change the conversation model silently.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-06](../../20-features/015-model-selector-interface/F015-06-per-message-model-override.md)
- Detail: Affects: Web and Desktop. Work needed: Tell the person that the conversation model changed.
- Evidence: WebChatPage.tsx:5880-5882

## GAP-F015-06-04

**The brief's per-turn evidence mixes media fields and regenerate paths.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-06](../../20-features/015-model-selector-interface/F015-06-per-message-model-override.md)
- Detail: Affects: Documentation. Work needed: Correct the brief code column for S15.31.
- Evidence: WebChatPage.tsx:503-504 versus 5704-5885

## GAP-F015-06-05

**CLI and VS Code have no per-turn override.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-06](../../20-features/015-model-selector-interface/F015-06-per-message-model-override.md)
- Detail: Affects: CLI and VS Code. Work needed: Decide whether they need it.
- Evidence: No code found in apps/cli/src or apps/extension-vscode/src

## GAP-F015-06-NOTBUILT

**Per-message model override: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F015-06](../../20-features/015-model-selector-interface/F015-06-per-message-model-override.md)
- Requirement items: S15.31
- Detail: Mobile: S15.31; CLI: S15.31; VS Code: S15.31; Chrome: S15.31

## GAP-F015-07-01

**Short-list rows carry no visible capability badges; capabilities are screen-reader text only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-07](../../20-features/015-model-selector-interface/F015-07-capability-and-cost-badges.md)
- Detail: Affects: Web and Desktop users scanning the short list. Work needed: Decide the visible form, draw the existing glyphs, update the test.
- Evidence: ComposerFooter.tsx:660,695; ComposerFooter.picker-parity.test.tsx:294

## GAP-F015-07-02

**No video-input or document-input chips, though the brief lists them.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-07](../../20-features/015-model-selector-interface/F015-07-capability-and-cost-badges.md)
- Detail: Affects: Web and Desktop. Work needed: Add chips from catalogue modality data and extend the server capability projection if needed.
- Evidence: ModelCatalogue.tsx:124-160

## GAP-F015-07-03

**Mobile has no output, tool, context or cost information.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-07](../../20-features/015-model-selector-interface/F015-07-capability-and-cost-badges.md)
- Detail: Affects: Mobile. Work needed: Add a detail view or row text from shared metadata; add tests.
- Evidence: ModelRow.tsx:1-392; modelFilters.ts:12-38

## GAP-F015-07-04

**CLI picker rows lack input and tool badges; only /models has them. Local rows have blank context.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-07](../../20-features/015-model-selector-interface/F015-07-capability-and-cost-badges.md)
- Detail: Affects: CLI. Work needed: Show flags in the picker detail line; fill context for discovered local models when the server reports it.
- Evidence: model_picker.rs:511-594; provider.rs:184-188; tui_app.rs:3384-3410

## GAP-F015-07-05

**VS Code lacks input, output and tool badges; the brief's cite for a usage hint points at the plan label, not a cost hint.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-07](../../20-features/015-model-selector-interface/F015-07-capability-and-cost-badges.md)
- Detail: Affects: VS Code. Work needed: Add capability text to the description or detail line; add a test (no test found for the quick-pick text).
- Evidence: modelConstants.ts:112-123,276-300

## GAP-F015-07-06

**Chrome shows only a capability filter, no context or cost.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-07](../../20-features/015-model-selector-interface/F015-07-capability-and-cost-badges.md)
- Detail: Affects: Chrome. Work needed: Add context and cost text from the shared metadata.
- Evidence: side_panel.ts:11031,11285-11300

## GAP-F015-07-07

**The usage-rate hint exists only on the Web short list.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-07](../../20-features/015-model-selector-interface/F015-07-capability-and-cost-badges.md)
- Detail: Affects: Web catalogue, Mobile, CLI, VS Code, Chrome. Work needed: Expose the shared tier function and show the hint in each picker.
- Evidence: ComposerFooter.tsx:697-701; no equivalent found in the other files read

## GAP-F015-07-08

**Brief line cites for this feature are stale (for example tui_app.rs:3454-3458, modelConstants.ts:94).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-07](../../20-features/015-model-selector-interface/F015-07-capability-and-cost-badges.md)
- Detail: Affects: Documentation readers. Work needed: Refresh the brief from current code.
- Evidence: Code read in this review

## GAP-F015-07-NOTBUILT

**Capability and cost badges: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F015-07](../../20-features/015-model-selector-interface/F015-07-capability-and-cost-badges.md)
- Requirement items: S15.12, S15.13, S15.14, S15.15
- Detail: CLI: S15.13; VS Code: S15.12, S15.13, S15.14, S15.15

## GAP-F015-08-01

**Web short-list rows of a degraded provider stay selectable.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-08](../../20-features/015-model-selector-interface/F015-08-speed-status-and-plan-labels.md)
- Detail: Affects: Web and Desktop. Work needed: Treat outage as a soft lock or add a confirmation; add a test.
- Evidence: ComposerFooter.tsx:629-770 (isHardDisabled excludes outage)

## GAP-F015-08-02

**Web catalogue shows no leaving date although the data is present.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-08](../../20-features/015-model-selector-interface/F015-08-speed-status-and-plan-labels.md)
- Detail: Affects: Web and Desktop. Work needed: Render 'Leaving <date>' in catalogue rows.
- Evidence: apps/web/lib/server/model-catalogue.ts (deprecatedOn); ModelCatalogue.tsx

## GAP-F015-08-03

**No dedicated speed label on Web; CLI uses the quality tier as speed.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-08](../../20-features/015-model-selector-interface/F015-08-speed-status-and-plan-labels.md)
- Detail: Affects: Web, Desktop, CLI. Work needed: Read the catalogue speed field like VS Code and Chrome do.
- Evidence: model-picker.ts:151-164; design_system.rs:361-385

## GAP-F015-08-04

**Mobile lock names no plan and has no preview badge; with store purchases off the tap is a dead end.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-08](../../20-features/015-model-selector-interface/F015-08-speed-status-and-plan-labels.md)
- Detail: Affects: Mobile. Work needed: Add the plan name in text; add the stage label.
- Evidence: ModelRow.tsx:271-285; ModelPickerSheet.tsx:465-466

## GAP-F015-08-05

**Environment-gated models are always locked everywhere because availability is hard-coded to not configured.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-08](../../20-features/015-model-selector-interface/F015-08-speed-status-and-plan-labels.md)
- Detail: Affects: Web, Desktop, Mobile, CLI. Work needed: Wire a real environment signal or remove the dead gate.
- Evidence: model-plan-admission.ts:20-22; service.ts:78-80; model_picker.rs:41-46

## GAP-F015-08-06

**CLI, VS Code and Chrome have no outage state; VS Code and Chrome have no deprecation or preview marks.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-08](../../20-features/015-model-selector-interface/F015-08-speed-status-and-plan-labels.md)
- Detail: Affects: CLI, VS Code, Chrome. Work needed: Share the outage signal and retirement date.
- Evidence: model_picker.rs:511-594; modelConstants.ts; managedModelPicker.ts:85

## GAP-F015-08-07

**The brief lists Mobile retirement as missing but the code has it; brief cites are stale.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-08](../../20-features/015-model-selector-interface/F015-08-speed-status-and-plan-labels.md)
- Detail: Affects: Documentation readers. Work needed: Update the brief statuses.
- Evidence: ModelRow.tsx:85,241-249

## GAP-F015-08-NOTBUILT

**Speed, status and plan labels: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F015-08](../../20-features/015-model-selector-interface/F015-08-speed-status-and-plan-labels.md)
- Requirement items: S15.19, S15.20, S15.21
- Detail: Mobile: S15.19, S15.20; CLI: S15.21; VS Code: S15.19, S15.20, S15.21; Chrome: S15.19, S15.20, S15.21

## GAP-F015-09-01

**CLI Fast mode is a model swap, not a same-model tier, and has no plan or credit gate.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-09](../../20-features/015-model-selector-interface/F015-09-reasoning-effort-fast-mode-and-response-style.md)
- Detail: Affects: CLI. Work needed: Follow the brief: per-model fast tier, speed field to the gateway, billing; then rewire /fast.
- Evidence: agent/mod.rs:2931-2962; brief S15.23 Unfinished

## GAP-F015-09-02

**Mobile has no response-length setting.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-09](../../20-features/015-model-selector-interface/F015-09-reasoning-effort-fast-mode-and-response-style.md)
- Detail: Affects: Mobile. Work needed: Add Brief, Default, Thorough or document that Concise is the length control.
- Evidence: apps/mobile/src/features/chat/components/StyleSelector.tsx:14-24

## GAP-F015-09-03

**Mobile effort has no visible plan gating; users can pick a level the server will clamp.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-09](../../20-features/015-model-selector-interface/F015-09-reasoning-effort-fast-mode-and-response-style.md)
- Detail: Affects: Mobile. Work needed: Use splitEffortsByEntitlement on the device and show the unlock text.
- Evidence: EffortSlider.tsx:36-47; request-processor.ts:1840

## GAP-F015-09-04

**VS Code effort is global and not shaped by the model; no Fast or style or length.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-09](../../20-features/015-model-selector-interface/F015-09-reasoning-effort-fast-mode-and-response-style.md)
- Detail: Affects: VS Code. Work needed: Use the model's effort levels (helper supportedEffort exists in modelConstants.ts); add length if required.
- Evidence: commandSetup.ts:1925-1946; platform/config.ts:219

## GAP-F015-09-05

**Chrome has no Fast mode and no length control.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-09](../../20-features/015-model-selector-interface/F015-09-reasoning-effort-fast-mode-and-response-style.md)
- Detail: Affects: Chrome. Work needed: Add if required by parity; else record as not applicable.
- Evidence: managedModelPicker.ts:308-366; side_panel.ts:11315-11340

## GAP-F015-09-06

**Docs and brief are stale: surface-feature-matrix says Mobile Fast mode absent; brief cites request-processor.ts:343 for length.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-09](../../20-features/015-model-selector-interface/F015-09-reasoning-effort-fast-mode-and-response-style.md)
- Detail: Affects: Documentation readers. Work needed: Update the matrix and brief from code.
- Evidence: docs/product/surface-feature-matrix.md Fast mode section vs fastMode.ts and streaming.ts:902-907

## GAP-F015-09-07

**No test found for the Web request body carrying a style or length system message or for the CLI /fast swap round trip beyond agent/mod.rs unit tests.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-09](../../20-features/015-model-selector-interface/F015-09-reasoning-effort-fast-mode-and-response-style.md)
- Detail: Affects: Web, CLI. Work needed: Add an end-to-end check for style text in the request.
- Evidence: Searched Composer and agent tests; agent/mod.rs:4890-4918 and 5101 have toggle tests

## GAP-F015-09-NOTBUILT

**Reasoning effort, fast mode and response style: not built on Mobile, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, VS Code, Chrome
- Features: [F015-09](../../20-features/015-model-selector-interface/F015-09-reasoning-effort-fast-mode-and-response-style.md)
- Requirement items: S15.23, S15.24
- Detail: Mobile: S15.23; VS Code: S15.23, S15.24; Chrome: S15.24

## GAP-F015-09-PARTLY

**Reasoning effort, fast mode and response style: partly built on CLI**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F015-09](../../20-features/015-model-selector-interface/F015-09-reasoning-effort-fast-mode-and-response-style.md)
- Requirement items: S15.23
- Detail: CLI S15.23: Waits on the c-platform fast tier (per-model fast tier and price in the registry, speed or service_tier in the gateway, provider payloads and billing); then /fast switches to that tier of the same model.

## GAP-F015-10-01

**Top-p cannot be set in the CLI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-10](../../20-features/015-model-selector-interface/F015-10-sampling-and-provider-route-developer-controls.md)
- Detail: Affects: CLI developers. Work needed: Add a flag and config key if parity with the API is wanted.
- Evidence: No top_p in apps/cli/src (only model_catalog.rs:457 comment)

## GAP-F015-10-02

**No UI for sampling on Web, Desktop, Mobile, VS Code, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-10](../../20-features/015-model-selector-interface/F015-10-sampling-and-provider-route-developer-controls.md)
- Detail: Affects: Developers on those apps. Work needed: Decide whether these surfaces need it; if so, drive it from request_parameters.
- Evidence: No control found in files read; brief marks missing

## GAP-F015-10-03

**Provider-route choice is only implicit in the CLI (section under which a row sits); explicit choice among providers for one model was not verified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-10](../../20-features/015-model-selector-interface/F015-10-sampling-and-provider-route-developer-controls.md)
- Detail: Affects: CLI. Work needed: Verify with a model served by two providers; add a route chooser if needed.
- Evidence: model_picker.rs:119-170

## GAP-F015-10-04

**The brief marks the API as missing for provider-route selection; the models list gives no route choice.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-10](../../20-features/015-model-selector-interface/F015-10-sampling-and-provider-route-developer-controls.md)
- Detail: Affects: API users. Work needed: Decide the API contract; keep supplier names out of customer output per the catalogue rule.
- Evidence: route.ts:102-103 uses the default route only

## GAP-F015-10-05

**CLI temperature help says 0.0-1.0 while the server allows up to 2.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-10](../../20-features/015-model-selector-interface/F015-10-sampling-and-provider-route-developer-controls.md)
- Detail: Affects: CLI and API consistency. Work needed: Align or document.
- Evidence: lib.rs:252; request-processor.ts:632

## GAP-F015-10-NOTBUILT

**Sampling and provider route (developer controls): not built on Web, Desktop, Mobile, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, VS Code, Chrome
- Features: [F015-10](../../20-features/015-model-selector-interface/F015-10-sampling-and-provider-route-developer-controls.md)
- Requirement items: S15.25, S15.26
- Detail: Web: S15.25, S15.26; Desktop: S15.25, S15.26; Mobile: S15.25, S15.26; VS Code: S15.25, S15.26; Chrome: S15.25, S15.26

## GAP-F015-11-01

**Public Desktop (Electron) cannot use local models; the brief marks Desktop done.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-11](../../20-features/015-model-selector-interface/F015-11-local-and-own-key-routes.md)
- Detail: Affects: Desktop users; requirement that local inference be free of paid plans on desktop. Work needed: Owner decision: reverse the Cloud-only decision or reclassify; if reversed, route local commands in Electron.
- Evidence: dispatcher.ts:3236-3244,3366-3368,2298; host-bridge.ts:690-692

## GAP-F015-11-02

**Web local section is hidden for the Free plan.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-11](../../20-features/015-model-selector-interface/F015-11-local-and-own-key-routes.md)
- Detail: Affects: Free users on shells with local mode. Work needed: Remove the plan condition for local models.
- Evidence: ComposerFooter.tsx:1721,1766

## GAP-F015-11-03

**CLI local rows show no context or capability.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-11](../../20-features/015-model-selector-interface/F015-11-local-and-own-key-routes.md)
- Detail: Affects: CLI. Work needed: Fill facts from the local server where available.
- Evidence: tui_app.rs:3384-3410

## GAP-F015-11-04

**Own-key route is absent on Web, Mobile and Chrome and its key state is not shown in the CLI picker.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-11](../../20-features/015-model-selector-interface/F015-11-local-and-own-key-routes.md)
- Detail: Affects: Those apps. Work needed: Decide per surface; show key state on own-key rows.
- Evidence: Picker files read; docs/product/requirements.md M-MODEL-004

## GAP-F015-11-05

**No test confirms the Electron refusal of local commands.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-11](../../20-features/015-model-selector-interface/F015-11-local-and-own-key-routes.md)
- Detail: Affects: Desktop. Work needed: Add or confirm a test.
- Evidence: apps/desktop/electron/__tests__/dispatcher.test.ts grep for the refusal text not done

## GAP-F015-11-06

**Brief cites for this feature point to unrelated code (dispatcher.ts:799, VS Code capabilityManagement.ts:1106, localRuntimeClient.ts:1479).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-11](../../20-features/015-model-selector-interface/F015-11-local-and-own-key-routes.md)
- Detail: Affects: Documentation readers. Work needed: Refresh cites.
- Evidence: Files opened at those lines

## GAP-F015-11-NOTBUILT

**Local and own-key routes: not built on Desktop, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop, Chrome
- Features: [F015-11](../../20-features/015-model-selector-interface/F015-11-local-and-own-key-routes.md)
- Requirement items: S15.27, S15.28
- Detail: Desktop: S15.27, S15.28; Chrome: S15.27, S15.28

## GAP-F015-12-01

**Mobile has no switch dialog or keep-or-remove attachment choice; CLI has no switch check.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-12](../../20-features/015-model-selector-interface/F015-12-switch-safety-fallback-and-substitution-notices.md)
- Detail: Affects: Mobile, CLI. Work needed: Decide the shape per surface and implement with shared findings.
- Evidence: ChatInput.tsx:1749-1760; tui_app.rs:5073-5100

## GAP-F015-12-02

**VS Code compares models, not the real chat, and has no test for the dialog.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-12](../../20-features/015-model-selector-interface/F015-12-switch-safety-fallback-and-substitution-notices.md)
- Detail: Affects: VS Code. Work needed: Add a test; feed real chat facts.
- Evidence: modelConstants.ts:347-372; no test file references describeModelSwitchLosses

## GAP-F015-12-03

**Chrome shows no switch dialog or fallback disclosure and resets stale selections silently.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-12](../../20-features/015-model-selector-interface/F015-12-switch-safety-fallback-and-substitution-notices.md)
- Detail: Affects: Chrome. Work needed: Add disclosure.
- Evidence: managedModelPicker.ts:275-287

## GAP-F015-12-04

**No fallback disclosure found in VS Code; served-model label unverified for VS Code and Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-12](../../20-features/015-model-selector-interface/F015-12-switch-safety-fallback-and-substitution-notices.md)
- Detail: Affects: VS Code, Chrome. Work needed: Verify the chat views; add the shared notice.
- Evidence: Searches of commandSetup.ts, modelConstants.ts, managedModelPicker.ts

## GAP-F015-12-05

**No test confirmed for the Web attachment conflict card.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-12](../../20-features/015-model-selector-interface/F015-12-switch-safety-fallback-and-substitution-notices.md)
- Detail: Affects: Web, Desktop. Work needed: Add a test for the three actions.
- Evidence: Test files listed do not name the card; ChatComposerNew.test.tsx not searched in full

## GAP-F015-12-06

**Brief line cites are stale (ChatComposerNew.tsx:4017-4059, request-processor.ts, commandSetup.ts:1206).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F015-12](../../20-features/015-model-selector-interface/F015-12-switch-safety-fallback-and-substitution-notices.md)
- Detail: Affects: Documentation readers. Work needed: Refresh the brief.
- Evidence: Lines opened

## GAP-F015-12-NOTBUILT

**Switch safety, fallback and substitution notices: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F015-12](../../20-features/015-model-selector-interface/F015-12-switch-safety-fallback-and-substitution-notices.md)
- Requirement items: S15.32, S15.33, S15.34, S15.35
- Detail: Mobile: S15.33, S15.34, S15.35; CLI: S15.34, S15.35; VS Code: S15.32, S15.33, S15.35; Chrome: S15.32, S15.33, S15.34, S15.35
