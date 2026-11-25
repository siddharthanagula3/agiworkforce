---
id: "GAPS-AREA-079"
type: "gap-list"
title: "Gaps: Routing and model-neutral orchestration"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 79. Routing and model-neutral orchestration

95 open gaps that touch this area. Area page: [20-features/079-routing-and-model-neutral-orchestration](../../20-features/079-routing-and-model-neutral-orchestration/README.md).

## CMP-C117

**Effort level that plans a workflow for every task (ultracode)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F079-10](../../20-features/079-routing-and-model-neutral-orchestration/F079-10-specialist-workers-with-their-own-model.md)
- Detail: Ours effort levels stop at max; no setting turns every task into a workflow.
- Evidence: apps/cli/src/design_system.rs:392; searched: ultracode

## CMP-C125

**One default model for all subagents**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F079-10](../../20-features/079-routing-and-model-neutral-orchestration/F079-10-specialist-workers-with-their-own-model.md)
- Detail: A subagent runs on the parent session model unless its own agent file names one; there is no global subagent default.
- Evidence: apps/cli/src/subagent.rs:29-35; searched: SUBAGENT_MODEL in apps/cli/src

## CMP-D16

**Advisor model that reviews the main model**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F079-11](../../20-features/079-routing-and-model-neutral-orchestration/F079-11-not-built.md)
- Detail: No advisor setting or command.
- Evidence: searched: advisor in apps/web/features and packages/ui

## CMP-DP28

**Custom agents defined with name, instructions, skills and model**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F079-10](../../20-features/079-routing-and-model-neutral-orchestration/F079-10-specialist-workers-with-their-own-model.md)
- Detail: They are standalone assistants, not helpers a running task can call Agents page builds custom agents with instructions, skills, knowledge and deployments, but they are standalone assistants, not helpers a running task can call.
- Evidence: apps/web/features/agents/components/AgentConfigForm.tsx; apps/web/features/agents/components/AgentDeploymentsPanel.tsx

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

## CMP-V26

**Separate reasoning effort for plan mode**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F079-01](../../20-features/079-routing-and-model-neutral-orchestration/F079-01-auto-picks-the-model.md)
- Detail: Plan mode uses the same effort as the session.
- Evidence: searched: plan_mode_reasoning, plan effort in apps/extension-vscode/src, apps/cli/src

## CMP-V31

**Ultracode effort and keyword for a workflow on every task**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F079-10](../../20-features/079-routing-and-model-neutral-orchestration/F079-10-specialist-workers-with-their-own-model.md)
- Detail: No ultracode effort level or keyword; the effort picker has its own ladder only.
- Evidence: searched: ultracode in apps/extension-vscode/, apps/cli/src/, crates

## CMP-V46

**Offer a cheaper model near a usage limit**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F015-12](../../20-features/015-model-selector-interface/F015-12-switch-safety-fallback-and-substitution-notices.md), [F079-04](../../20-features/079-routing-and-model-neutral-orchestration/F079-04-pick-a-model-yourself-and-locks.md), [F079-07](../../20-features/079-routing-and-model-neutral-orchestration/F079-07-health-fallback-and-switch-offers.md), [F091-05](../../20-features/091-model-and-inference-components/F091-05-retries-fallback-and-provider-errors.md)
- Detail: The panel shows context use and a limit error with a recovery link, but never offers a cheaper model before the limit.
- Evidence: apps/extension-vscode/src/core/cloudUtilityErrorActions.ts:133; searched: 90%, nearLimit in apps/extension-vscode/src

## CMP-VP14

**Model and reasoning effort for each subagent**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F079-10](../../20-features/079-routing-and-model-neutral-orchestration/F079-10-specialist-workers-with-their-own-model.md)
- Detail: Not a reasoning effort An agent file can set a model for the subagent, but not a reasoning effort.
- Evidence: apps/cli/src/agents.rs:30,99

## CMP-VP15

**Notice when a request is moved to another model**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F015-12](../../20-features/015-model-selector-interface/F015-12-switch-safety-fallback-and-substitution-notices.md), [F079-08](../../20-features/079-routing-and-model-neutral-orchestration/F079-08-which-model-answered-and-why.md)
- Detail: There is no separate reroute or verification notice Each reply records which model served it when Auto routing picks one; there is no separate reroute or verification notice.
- Evidence: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:5254-5297

## CMP-W55

**Unlimited everyday chat on a base model**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F079-01](../../20-features/079-routing-and-model-neutral-orchestration/F079-01-auto-picks-the-model.md), [F082-02](../../20-features/082-usage-dashboard-and-limit-ui/F082-02-usage-meters-and-reset-times.md)
- Detail: Free chat runs on a daily quota and no plan advertises unlimited base-model chat.
- Evidence: apps/web/lib/free-quota-authorization.ts; searched: unlimited, instant in apps/web/lib/billing

## CMP-W92

**Ultra effort that delegates to parallel subagents**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F079-10](../../20-features/079-routing-and-model-neutral-orchestration/F079-10-specialist-workers-with-their-own-model.md)
- Detail: Our top effort is Max; no mode splits a chat task across subagents automatically.
- Evidence: packages/contracts/types/src/reasoning-settings.ts:3-11

## CMP-WP134

**Pick model, effort, repositories and environment for each scheduled run**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md), [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md), [F063-04](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md), [F063-06](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md), [F063-07](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md), [F079-10](../../20-features/079-routing-and-model-neutral-orchestration/F079-10-specialist-workers-with-their-own-model.md)
- Detail: Has no reasoning effort, repository or sandbox environment choice A schedule picks a model and a project or agent, but has no reasoning effort, repository or sandbox environment choice.
- Evidence: apps/web/features/schedules/types/index.ts (model, projectId, agentId; no effort or repo fields)

## CMP-WP73

**Model lineup by plan**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F015-08](../../20-features/015-model-selector-interface/F015-08-speed-status-and-plan-labels.md), [F079-01](../../20-features/079-routing-and-model-neutral-orchestration/F079-01-auto-picks-the-model.md)
- Detail: The Free plan has no manual model choice (Auto and free-quota models) The Free plan has no manual model choice (Auto and free-quota models); paid plans choose any listed model.
- Evidence: packages/contracts/types/src/model-catalog.ts:1234-1250,1260-1270

## CMP-WP76

**Setting that lets a fast model switch itself to thinking for hard questions**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F015-04](../../20-features/015-model-selector-interface/F015-04-auto-and-default-for-new-chats.md), [F079-01](../../20-features/079-routing-and-model-neutral-orchestration/F079-01-auto-picks-the-model.md), [F079-03](../../20-features/079-routing-and-model-neutral-orchestration/F079-03-understanding-the-request.md), [F079-04](../../20-features/079-routing-and-model-neutral-orchestration/F079-04-pick-a-model-yourself-and-locks.md)
- Detail: A chat on a fixed model has no switch that lets it escalate to thinking Auto mode picks the model and effort for each message, but a chat on a fixed model has no switch that lets it escalate to thinking.
- Evidence: searched: autoSwitch, auto-switch, escalat in apps/web/features/settings, apps/web/features/models, apps/web/features/chat/components/Composer; Auto row at apps/web/features/chat/components/Composer/ComposerFooter.tsx:1635

## GAP-AREA079-LW02

**On the web, a person who named a model and has no credits left can get a cheaper model instead (reason 'insufficient_credits'), unless a route was pinned. It is reported in message metadata, but it is still a swap of a chosen model.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-079
- Detail: Area 79. Routing and model-neutral orchestration
- Evidence: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6052-6113

## GAP-AREA079-LW04

**The user routing preference (us_only) is read on every chat turn, but its own comment says nothing yet offers a control to set it and the route has no caller.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-079
- Detail: Area 79. Routing and model-neutral orchestration
- Evidence: apps/web/lib/services/user-routing-preferences.ts:11-20

## GAP-AREA079-LW05

**The migration that creates the decision trace table says 'NOT YET APPLIED: draft only', which may be stale or true; the code writes to the table either way.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-079
- Detail: Area 79. Routing and model-neutral orchestration
- Evidence: apps/web/db/neon/0212_routing_decision_traces.sql:4; apps/web/lib/services/model-rollout/routing-decision-trace-service.ts:47

## GAP-AREA079-LW07

**The CLI fallback-trigger enum is marked allow(dead_code), which hints some variants are unused.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-079
- Detail: Area 79. Routing and model-neutral orchestration
- Evidence: apps/cli/src/routing/fallback.rs:19

## GAP-AREA079-LW08

**The classifier's header says its accuracy is far lower than its old 75 to 85 percent claim, and it has no model fallback. Routing quality for ambiguous text depends on a weak heuristic.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-079
- Detail: Area 79. Routing and model-neutral orchestration
- Evidence: packages/ai/routing/src/classify.ts:6-9

## GAP-AREA079-LW09

**In the CLI, per-turn re-resolution only changes the model for own-key sessions. Cloud, Local and on-device sessions return without switching (Cloud is left to the server).**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-079
- Detail: Area 79. Routing and model-neutral orchestration
- Evidence: apps/cli/src/agent/chat.rs:660-728

## GAP-CAP-model-selection-01

**Model picker on the composer: Chrome picker has no search. At 390 px wide on web the model name is hidden and only an icon shows (seen defect W-5 and W-6). Free picker shortlist hides the active model.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F015-01](../../20-features/015-model-selector-interface/F015-01-see-the-model-the-next-message-will-use.md), [F015-02](../../20-features/015-model-selector-interface/F015-02-browse-and-search-the-model-list.md), [F015-05](../../20-features/015-model-selector-interface/F015-05-pick-a-model-and-keep-it.md), [F079-04](../../20-features/079-routing-and-model-neutral-orchestration/F079-04-pick-a-model-yourself-and-locks.md)
- Requirement items: S15.01, S15.04, S15.10, S15.30, S79.02
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

## GAP-CAP-model-selection-08

**Free plan default model and what Free users can pick: Free has no Auto choice and a new chat inherits the last model (seen). Default label reads the model name, not Auto. Whether Free should see Auto is undecided. No unlimited base-model promise (W55).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F079-01](../../20-features/079-routing-and-model-neutral-orchestration/F079-01-auto-picks-the-model.md)
- Requirement items: S79.14
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-model-selection-12

**Max effort that delegates to subagents (Ultra, Ultracode): No ultra or ultracode level.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F079-10](../../20-features/079-routing-and-model-neutral-orchestration/F079-10-specialist-workers-with-their-own-model.md)
- Requirement items: S79.23
- Detail: Claude yes, ChatGPT yes; AGI not built

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

## GAP-CAP-model-selection-18

**Default model, effort and new-chat start: Mobile has no lasting-default setting; project default not in CLI or Chrome. Free: new chat inherits last model (seen).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F015-04](../../20-features/015-model-selector-interface/F015-04-auto-and-default-for-new-chats.md), [F015-05](../../20-features/015-model-selector-interface/F015-05-pick-a-model-and-keep-it.md), [F079-05](../../20-features/079-routing-and-model-neutral-orchestration/F079-05-project-default-model.md)
- Requirement items: S15.09, S15.29, S15.30, S79.03
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-model-selection-25

**Advisor model second opinion: The decision says neither leader offers an advisor, but Claude Code does. Decision is stale for the coding tool.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F079-11](../../20-features/079-routing-and-model-neutral-orchestration/F079-11-not-built.md)
- Requirement items: S79.22
- Detail: Claude yes, ChatGPT unknown; AGI partly built

## GAP-CAP-model-selection-26

**Plan with a large model, run with a smaller one: No plan versus execute model split.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F079-01](../../20-features/079-routing-and-model-neutral-orchestration/F079-01-auto-picks-the-model.md)
- Requirement items: S79.04
- Detail: Claude yes, ChatGPT unknown; AGI not built

## GAP-CAP-model-selection-27

**Model and effort for subagents and agents: Scheduled runs pick a model but no effort (WP134). Owner decided no per-routine effort (2026-09-27).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F079-10](../../20-features/079-routing-and-model-neutral-orchestration/F079-10-specialist-workers-with-their-own-model.md)
- Requirement items: S79.23
- Detail: Claude yes, ChatGPT partly; AGI partly built

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

## GAP-CAP-model-selection-32

**Compare answers from several models: Absent on three apps.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F079-09](../../20-features/079-routing-and-model-neutral-orchestration/F079-09-compare-models-side-by-side.md)
- Requirement items: S79.24
- Detail: Claude unknown, ChatGPT unknown; AGI partly built

## GAP-CAP-research-15

**Which model runs research: The context threshold is a constant in code (500,000); the project says limits should be configuration. Not checked against the catalogue guard.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F015-12](../../20-features/015-model-selector-interface/F015-12-switch-safety-fallback-and-substitution-notices.md), [F017-01](../../20-features/017-assistant-message-components/F017-01-who-answered-and-live-status.md), [F079-03](../../20-features/079-routing-and-model-neutral-orchestration/F079-03-understanding-the-request.md)
- Requirement items: S15.32, S17.36, S79.10
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-F079-01-01

**Named profiles Instant, High, Code, Research are not used to order candidates.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-01](../../20-features/079-routing-and-model-neutral-orchestration/F079-01-auto-picks-the-model.md)
- Detail: Affects: Web, Desktop, API and every surface that expects task-family weights to bite. Work needed: Either feed weightedScore into the task-family ordering or remove the unused weights and say routing is band plus cost only.
- Evidence: weightedScore only in packages/ai/routing/src/profiles/index.ts:169, index.ts:324 and tests; auto.ts:1466 only labels the decision.

## GAP-F079-01-02

**Mobile Auto is decided on the device without budget, training, zero-retention, policy or region inputs, then sent as a named model.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-01](../../20-features/079-routing-and-model-neutral-orchestration/F079-01-auto-picks-the-model.md)
- Detail: Affects: Mobile users on paid plans, workspace members. Work needed: Send the Auto alias and let the server route, or pass the same inputs on the device.
- Evidence: cloudDispatchRouting.ts:82-96; chatExecutionStore.ts:3360-3379.

## GAP-F079-01-03

**Rust resolver lacks budget, no-training, zero-retention and workspace-policy inputs.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-01](../../20-features/079-routing-and-model-neutral-orchestration/F079-01-auto-picks-the-model.md)
- Detail: Affects: CLI own-key Auto and launch-time resolution. Work needed: Decide the canonical resolver (design question OQ-1) and close the field gap.
- Evidence: crates/agiworkforce-model-registry/src/lib.rs:122-139; packages/ai/routing/src/task-family-routing.ts header notes the two resolvers diverged and OQ-1 is undecided.

## GAP-F079-01-04

**Free plan has no Auto and the product premise says Auto is the default.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-01](../../20-features/079-routing-and-model-neutral-orchestration/F079-01-auto-picks-the-model.md)
- Detail: Affects: Free users on Web, Desktop, Mobile. Work needed: Product decision: keep a fixed free default or give Free a labelled Auto over free models.
- Evidence: routing-policies.json:544 minTier basic; request-processor.ts:3346-3352.

## GAP-F079-01-05

**No test found for the Web 'Auto' picker rows being hidden on Free in combination with the server swap.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-01](../../20-features/079-routing-and-model-neutral-orchestration/F079-01-auto-picks-the-model.md)
- Detail: Affects: Web Free users. Work needed: Read or add a test that asserts both sides.
- Evidence: ComposerFooter tests exist (ComposerFooter.free-section.test.tsx) but their content was not read.

## GAP-F079-01-06

**Deployed values of routing kill switches are not recorded in the repository.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-01](../../20-features/079-routing-and-model-neutral-orchestration/F079-01-auto-picks-the-model.md)
- Detail: Affects: All surfaces served by the managed route. Work needed: Record deployed settings in the runbook or the operations page.
- Evidence: routing-stages.ts:1-18.

## GAP-F079-02-01

**Mobile has no Instant, Best or Economy routing choice.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-02](../../20-features/079-routing-and-model-neutral-orchestration/F079-02-instant-best-and-economy-choices.md)
- Detail: Affects: Mobile. Work needed: None required by decision; remove the unused request field to avoid a dead path.
- Evidence: decision D-2026-11-12-07; apps/mobile/services/streaming.ts:567 type only.

## GAP-F079-02-02

**Speed and Economy both use the economy band and differ only by slot order.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-02](../../20-features/079-routing-and-model-neutral-orchestration/F079-02-instant-best-and-economy-choices.md)
- Detail: Affects: Web, VS Code, CLI. Work needed: Confirm that is the intended difference, or give speed its own band.
- Evidence: routing-profile-choice.ts:42-46; request-processor.ts:4769.

## GAP-F079-02-03

**Best row on tiers whose ceiling is economy is not verified to be hidden or explained on Web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-02](../../20-features/079-routing-and-model-neutral-orchestration/F079-02-instant-best-and-economy-choices.md)
- Detail: Affects: Web basic-plan users. Work needed: Check the shortList.auto filter and add a lock or note.
- Evidence: ComposerFooter.tsx:1656 shows rows for any paid plan; auto.ts:1198-1216 clamps silently.

## GAP-F079-02-04

**Name clash: the picker's Instant is not the named profile 'instant' in packages/ai/routing/src/profiles/index.ts.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-02](../../20-features/079-routing-and-model-neutral-orchestration/F079-02-instant-best-and-economy-choices.md)
- Detail: Affects: Engineers and testers reading the code. Work needed: Rename one of them or document the difference.
- Evidence: profiles/index.ts:48-62 versus routing-profile-choice.ts:19-23.

## GAP-F079-02-05

**No Web test found for the profile rows.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-02](../../20-features/079-routing-and-model-neutral-orchestration/F079-02-instant-best-and-economy-choices.md)
- Detail: Affects: Web. Work needed: Add a component test that checks the request field.
- Evidence: search for RoutingProfileRow in tests found none.

## GAP-F079-03-01

**The research pattern contains the year 2026.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-03](../../20-features/079-routing-and-model-neutral-orchestration/F079-03-understanding-the-request.md)
- Detail: Affects: All apps from 2027. Work needed: Drop the year or compute it, and add a test.
- Evidence: packages/ai/routing/src/classify.ts:97

## GAP-F079-03-02

**Classification is English keywords only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-03](../../20-features/079-routing-and-model-neutral-orchestration/F079-03-understanding-the-request.md)
- Detail: Affects: Non-English prompts on all apps. Work needed: Measure misroutes on a multilingual set before changing.
- Evidence: classify.ts:20-100; indic.ts only logs.

## GAP-F079-03-03

**Header comment says 5-turn sticky logic; code uses 3.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-03](../../20-features/079-routing-and-model-neutral-orchestration/F079-03-understanding-the-request.md)
- Detail: Affects: Engineers. Work needed: Correct the comment.
- Evidence: classify.ts:229 versus the doc block above it.

## GAP-F079-03-04

**VS Code classifies without history.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-03](../../20-features/079-routing-and-model-neutral-orchestration/F079-03-understanding-the-request.md)
- Detail: Affects: VS Code. Work needed: Pass recent turns if long-context routing is wanted there.
- Evidence: routingTask.ts:26-27

## GAP-F079-03-05

**Heuristics are weaker than their older claim.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-03](../../20-features/079-routing-and-model-neutral-orchestration/F079-03-understanding-the-request.md)
- Detail: Affects: All apps. Work needed: Use the semantic-decisions spec to decide on any change.
- Evidence: classify.ts header says measured held-out accuracy is far below the old 75 to 85 percent claim.

## GAP-F079-03-06

**Source parity tests between the Rust and TypeScript classifiers were not located.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-03](../../20-features/079-routing-and-model-neutral-orchestration/F079-03-understanding-the-request.md)
- Detail: Affects: CLI. Work needed: Name the test and run it.
- Evidence: routing/classify.rs header says tests check parity.

## GAP-F079-04-01

**Out-of-credit swap replaces a named model on Web when no route is pinned.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-04](../../20-features/079-routing-and-model-neutral-orchestration/F079-04-pick-a-model-yourself-and-locks.md)
- Detail: Affects: Web, Desktop, API. Work needed: Decide if a named model should be refused or confirmed instead; check how the UI words the notice.
- Evidence: request-processor.ts:6052-6113

## GAP-F079-04-02

**Mobile and Chrome replace a named model with Auto on capability mismatch.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-04](../../20-features/079-routing-and-model-neutral-orchestration/F079-04-pick-a-model-yourself-and-locks.md)
- Detail: Affects: Mobile, Chrome. Work needed: Align with Web, which refuses.
- Evidence: cloudDispatchRouting.ts:94; managedChatRouting.ts:55; auto.ts:1822-1840

## GAP-F079-04-03

**Route-pin storage and error text exist with no control to set them.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-04](../../20-features/079-routing-and-model-neutral-orchestration/F079-04-pick-a-model-yourself-and-locks.md)
- Detail: Affects: Web, API. Work needed: Remove the dead path or build the control, subject to the decision against provider locks.
- Evidence: 0293 migration; request-processor.ts:4965-4972; no UI caller of setSelectedModelId with a route.

## GAP-F079-04-04

**Provider lock is CLI only, and the CLI help lists four providers while twelve or more provider folders exist.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-04](../../20-features/079-routing-and-model-neutral-orchestration/F079-04-pick-a-model-yourself-and-locks.md)
- Detail: Affects: CLI. Work needed: Confirm the help text is current.
- Evidence: lib.rs:194; packages/ai/providers directory listing.

## GAP-F079-04-05

**Chrome silently reconciles a stored model back to Auto when it is no longer admitted.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-04](../../20-features/079-routing-and-model-neutral-orchestration/F079-04-pick-a-model-yourself-and-locks.md)
- Detail: Affects: Chrome. Work needed: Show a note when the selection is changed.
- Evidence: managedModelPicker.ts:273-287

## GAP-F079-04-NOTBUILT

**Pick a model yourself, and locks: not built on Mobile, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, VS Code, Chrome
- Features: [F079-04](../../20-features/079-routing-and-model-neutral-orchestration/F079-04-pick-a-model-yourself-and-locks.md)
- Requirement items: S79.17, S79.18
- Detail: Mobile: S79.17, S79.18; VS Code: S79.17, S79.18; Chrome: S79.17, S79.18

## GAP-F079-05-01

**No default model on CLI or Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-05](../../20-features/079-routing-and-model-neutral-orchestration/F079-05-project-default-model.md)
- Detail: Affects: CLI, Chrome. Work needed: Decide whether those surfaces read project defaults; Chrome has no projects in this scope.
- Evidence: brief S79.03 status; no references in apps/cli or apps/extension.

## GAP-F079-05-02

**VS Code does not switch to the default, only offers the picker, and can only set the user's own model.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-05](../../20-features/079-routing-and-model-neutral-orchestration/F079-05-project-default-model.md)
- Detail: Affects: VS Code. Work needed: Wire a direct switch and a model choice list.
- Evidence: projectActions.ts:320-342, 405-416

## GAP-F079-05-03

**Mobile has no control to set the default.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-05](../../20-features/079-routing-and-model-neutral-orchestration/F079-05-project-default-model.md)
- Detail: Affects: Mobile. Work needed: Add a control or record that Web owns it.
- Evidence: only read paths in cloudProjectStore.ts and chat.tsx

## GAP-F079-05-04

**No direct test found for ProjectDefaultModelField or the new-chat apply effect.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-05](../../20-features/079-routing-and-model-neutral-orchestration/F079-05-project-default-model.md)
- Detail: Affects: Web. Work needed: Add component and page tests.
- Evidence: search of web tests for the field name found none

## GAP-F079-05-05

**Server validation of defaultModelId against plan was not found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-05](../../20-features/079-routing-and-model-neutral-orchestration/F079-05-project-default-model.md)
- Detail: Affects: Web, API. Work needed: Check and add validation if missing.
- Evidence: route.ts:212 writes the value as given

## GAP-F079-05-NOTBUILT

**Project default model: not built on CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, Chrome
- Features: [F079-05](../../20-features/079-routing-and-model-neutral-orchestration/F079-05-project-default-model.md)
- Requirement items: S79.03
- Detail: CLI: S79.03; Chrome: S79.03

## GAP-F079-06-01

**No single privacy-first control; it is composed from several settings.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-06](../../20-features/079-routing-and-model-neutral-orchestration/F079-06-privacy-first-routing.md)
- Detail: Affects: All apps. Work needed: Product decision on a combined control and a visible provider label.
- Evidence: PrivacySection.tsx:54-66; WorkspacePolicySection.tsx:73-86, 664

## GAP-F079-06-02

**Desktop Electron chat is Cloud-only and refuses on-device inference, against the premise of free local inference on desktop.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-06](../../20-features/079-routing-and-model-neutral-orchestration/F079-06-privacy-first-routing.md)
- Detail: Affects: Desktop. Work needed: Product decision: keep Cloud-only desktop chat or add local inference; record it in the decisions.
- Evidence: apps/desktop/electron/runtime/dispatcher.ts:2298, 3235-3243

## GAP-F079-06-03

**Workspace allowed trust modes are not passed to the router in production.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-06](../../20-features/079-routing-and-model-neutral-orchestration/F079-06-privacy-first-routing.md)
- Detail: Affects: Workspace admins. Work needed: Wire allowedPrivacyModes into routing or document where it is enforced.
- Evidence: auto.ts:342; no non-test caller

## GAP-F079-06-04

**Mobile Auto on-device decision ignores no-training and zero retention.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-06](../../20-features/079-routing-and-model-neutral-orchestration/F079-06-privacy-first-routing.md)
- Detail: Affects: Mobile. Work needed: Pass flags or send the Auto alias.
- Evidence: cloudDispatchRouting.ts:82-96

## GAP-F079-06-05

**Zero data retention is not available to individual accounts.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-06](../../20-features/079-routing-and-model-neutral-orchestration/F079-06-privacy-first-routing.md)
- Detail: Affects: Individuals. Work needed: Decide whether to offer it.
- Evidence: only WorkspacePolicySection.tsx:664 control found

## GAP-F079-06-06

**Chrome has no privacy mode choice.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-06](../../20-features/079-routing-and-model-neutral-orchestration/F079-06-privacy-first-routing.md)
- Detail: Affects: Chrome. Work needed: None if Cloud-only is intended.
- Evidence: experience-contract.md section 12.6 Cloud-only

## GAP-F079-07-01

**Brief says Chrome has no switch offer; code has one.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-07](../../20-features/079-routing-and-model-neutral-orchestration/F079-07-health-fallback-and-switch-offers.md)
- Detail: Affects: Chrome; the knowledge base itself. Work needed: Correct the brief status.
- Evidence: apps/extension/src/features/side-panel/bubbles.ts:320; apps/extension/src/side_panel.ts:9757-9772

## GAP-F079-07-02

**Web 'Use <model>' and 'Switch to a cloud model' are before-send conflict notices, not failure offers; a failure-time switch offer on Web is only the paywall card.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-07](../../20-features/079-routing-and-model-neutral-orchestration/F079-07-health-fallback-and-switch-offers.md)
- Detail: Affects: Web, Desktop. Work needed: Decide whether failure cards on Web need a 'Switch model' button like VS Code and Chrome.
- Evidence: ChatComposerNew.tsx:5273-5349; InlinePaywallCard.tsx:248-262

## GAP-F079-07-03

**CLI switch offer is text only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-07](../../20-features/079-routing-and-model-neutral-orchestration/F079-07-health-fallback-and-switch-offers.md)
- Detail: Affects: CLI. Work needed: Optional interactive prompt in the TUI.
- Evidence: apps/cli/src/errors.rs:619-623

## GAP-F079-07-04

**Mobile has only the blocked-image switch offer.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-07](../../20-features/079-routing-and-model-neutral-orchestration/F079-07-health-fallback-and-switch-offers.md)
- Detail: Affects: Mobile. Work needed: Add failure-time offer if required by parity.
- Evidence: alertBlockedImageRequest callers at chat/[id].tsx:742,770

## GAP-F079-07-05

**No evidence of health-based Auto or fallback on Local inference (Mobile, Desktop).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-07](../../20-features/079-routing-and-model-neutral-orchestration/F079-07-health-fallback-and-switch-offers.md)
- Detail: Affects: Mobile, Desktop Local mode. Work needed: Establish what Local does on a failed on-device model.
- Evidence: No code found in the files opened

## GAP-F079-08-01

**VS Code has no 'Moved to' line; brief says attribution is missing too but code shows model label.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-08](../../20-features/079-routing-and-model-neutral-orchestration/F079-08-which-model-answered-and-why.md)
- Detail: Affects: VS Code. Work needed: Add the receipt line; correct the brief for attribution.
- Evidence: ChatStateManager.ts:6816-6833; webviewContent.ts:4941

## GAP-F079-08-02

**Trace migration 0212 is marked draft, not applied, in its own header.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-08](../../20-features/079-routing-and-model-neutral-orchestration/F079-08-which-model-answered-and-why.md)
- Detail: Affects: Operators, SLO data. Work needed: Confirm applied state per environment.
- Evidence: 0212_routing_decision_traces.sql:1-5

## GAP-F079-08-03

**Move rule differs from the decision record (any model difference vs failure only).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-08](../../20-features/079-routing-and-model-neutral-orchestration/F079-08-which-model-answered-and-why.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome. Work needed: Decide which is right; update code or record.
- Evidence: request-processor.ts:2881-2891 vs docs/decisions/2026-09-05-living-decision-model.md

## GAP-F079-08-04

**Chrome does not use the server header for the move.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-08](../../20-features/079-routing-and-model-neutral-orchestration/F079-08-which-model-answered-and-why.md)
- Detail: Affects: Chrome. Work needed: Use the server marker if Chrome gets Cloud headers.
- Evidence: answeredModel.ts:17-38

## GAP-F079-08-05

**No Local-mode attribution or trace found on Mobile and Desktop.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-08](../../20-features/079-routing-and-model-neutral-orchestration/F079-08-which-model-answered-and-why.md)
- Detail: Affects: Mobile, Desktop Local. Work needed: Establish what Local shows.
- Evidence: request-processor.ts:4876

## GAP-F079-09-01

**Compare absent on CLI, VS Code and Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-09](../../20-features/079-routing-and-model-neutral-orchestration/F079-09-compare-models-side-by-side.md)
- Detail: Affects: CLI, VS Code, Chrome. Work needed: Decide if parity needs it.
- Evidence: No compare code found; brief status missing

## GAP-F079-09-02

**Mobile limited to two models, Web up to three.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-09](../../20-features/079-routing-and-model-neutral-orchestration/F079-09-compare-models-side-by-side.md)
- Detail: Affects: Mobile. Work needed: Align or document.
- Evidence: index.tsx modelA/modelB; compare-answers.ts:7

## GAP-F079-09-03

**No dedicated Desktop (native) compare; depends on hosted web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-09](../../20-features/079-routing-and-model-neutral-orchestration/F079-09-compare-models-side-by-side.md)
- Detail: Affects: Desktop. Work needed: Verify the Electron window opens /models/compare.
- Evidence: No compare code in apps/desktop/src; doc: AGENTS.md section 5

## GAP-F079-09-04

**No test found for the Web answers page or hook.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-09](../../20-features/079-routing-and-model-neutral-orchestration/F079-09-compare-models-side-by-side.md)
- Detail: Affects: Web. Work needed: Add component and hook tests.
- Evidence: No test file for CompareAnswersPage or use-compare-answers

## GAP-F079-09-NOTBUILT

**Compare models side by side: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F079-09](../../20-features/079-routing-and-model-neutral-orchestration/F079-09-compare-models-side-by-side.md)
- Requirement items: S79.24
- Detail: CLI: S79.24; VS Code: S79.24; Chrome: S79.24

## GAP-F079-10-01

**Model-called specialists cannot use their own model.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-10](../../20-features/079-routing-and-model-neutral-orchestration/F079-10-specialist-workers-with-their-own-model.md)
- Detail: Affects: CLI. Work needed: Design a consent-based model choice inside the same trust mode if required.
- Evidence: agents.rs:187-196

## GAP-F079-10-02

**No specialist selection on Mobile, Chrome, Web, Desktop, VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-10](../../20-features/079-routing-and-model-neutral-orchestration/F079-10-specialist-workers-with-their-own-model.md)
- Detail: Affects: Mobile, Chrome (brief missing); others unlisted. Work needed: Decide scope per surface.
- Evidence: Brief S79.23

## GAP-F079-10-03

**No test of the --agent flag end to end found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-10](../../20-features/079-routing-and-model-neutral-orchestration/F079-10-specialist-workers-with-their-own-model.md)
- Detail: Affects: CLI. Work needed: Add an integration test.
- Evidence: Tests found only in agents.rs and slash_commands.rs

## GAP-F079-10-NOTBUILT

**Specialist workers with their own model: not built on Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, Chrome
- Features: [F079-10](../../20-features/079-routing-and-model-neutral-orchestration/F079-10-specialist-workers-with-their-own-model.md)
- Requirement items: S79.23
- Detail: Mobile: S79.23; Chrome: S79.23

## GAP-F079-11-01

**Brief says no routing evaluation dashboard; code has an operator rollout tab, observability panels and SLO objectives built from traces.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-11](../../20-features/079-routing-and-model-neutral-orchestration/F079-11-not-built.md)
- Detail: Affects: Operators; knowledge base accuracy. Work needed: Update the brief status to partial.
- Evidence: OperatorDashboardPage.tsx:487; dashboards.ts:847; slo/catalogue.ts:66

## GAP-F079-11-02

**No advisor escalation, abstention or classifier adapter in routing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-11](../../20-features/079-routing-and-model-neutral-orchestration/F079-11-not-built.md)
- Detail: Affects: All apps. Work needed: Product decision, then design.
- Evidence: classify.ts:1-12; no matching code found

## GAP-F079-11-03

**Decision transport exists but is not a classifier adapter for Auto.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-11](../../20-features/079-routing-and-model-neutral-orchestration/F079-11-not-built.md)
- Detail: Affects: Cloud (web server). Work needed: Spec says shadow first; follow its plan.
- Evidence: docs/specs/semantic-decisions/audit.md model routing row

## GAP-F079-11-04

**Trace table migration header still says not applied.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F079-11](../../20-features/079-routing-and-model-neutral-orchestration/F079-11-not-built.md)
- Detail: Affects: Operators. Work needed: Confirm and correct the header.
- Evidence: 0212_routing_decision_traces.sql:1-5
