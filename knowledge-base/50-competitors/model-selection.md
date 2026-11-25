---
id: "COMP-model-selection"
type: "competitor-trace"
title: "Model selection"
competitor_evidence_reviewed: "2026-11-22"
basis: "official competitor pages saved 2026-11-22; AGI status from code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Model selection: competitors to requirements

Claude and ChatGPT both document a composer model picker, effort levels, plan-based model access, safety and rate-limit fallbacks, admin model controls and retirement notices. Claude Code and Codex add speed tiers, advisor, plan-then-execute and subagent levels. AGI covers most picker, Auto, effort and fallback items on most apps. Seen by a person on web only: Free has no Auto and the picker hides the active model. Gaps: safety-flag toggle, ultra and ultrafast tiers, admin new-model hold, model recommender.

**How the products divide this topic.** Reviewed 2026-11-22 from the saved catalogue. Claude (support.claude.com) documents the chat apps: one menu for model, effort and thinking; safety fallback notices; plan notes for the largest model family; context by model. Claude Code (code.claude.com plus support articles about Claude Code) documents /model, /effort, fast mode, advisor, plan-then-execute, fallback chains, subagent models, aliases. The coding tool connects to the chat product through the same account plan and the same safety-fallback setting (Config > Model & Output) and through Remote Control from phone or browser. ChatGPT (help.openai.com) documents the chat picker with Instant, Medium, High, Extra High and Pro levels, plan limits, retirements and Enterprise controls. Codex and ChatGPT Work (learn.chatgpt.com) document a separate model line-up, a Power slider, speed tiers (Fast, Ultrafast), Ultra with subagents, and custom providers. Several newest models appear in Work and Codex but not in regular Chat. Plan limits matter: the largest Claude family is not on Free; the top ChatGPT reasoning option needs Pro or Business; Ultrafast is Pro 500, Enterprise and Edu only. AGI evidence is code reading plus the web scorecard W-6 (one person, one run each for Free and Premium). Model names are left out of this page on purpose; the catalogue owns them.

Each capability below is traced: competitor evidence, AGI requirement, current implementation, gap, acceptance criteria, verification. Competitor behaviour comes only from the cited pages, reviewed 2026-11-22.

| ID | Capability | Claude | ChatGPT | AGI today | Verified |
|---|---|---|---|---|---|
| [CAP-model-selection-01](#cap-model-selection-01) | Model picker on the composer | yes | yes | built | seen working by a person |
| [CAP-model-selection-02](#cap-model-selection-02) | Reasoning effort levels per model | yes | yes | built | code inspected only |
| [CAP-model-selection-03](#cap-model-selection-03) | Thinking switch and always-thinking models | yes | partly | partly built | seen failing by a person |
| [CAP-model-selection-04](#cap-model-selection-04) | Automatic model choice (Auto) | unknown | partly | built | seen working by a person |
| [CAP-model-selection-05](#cap-model-selection-05) | Which model answered, and why Auto chose it | partly | unknown | partly built | seen failing by a person |
| [CAP-model-selection-06](#cap-model-selection-06) | Which models each plan gets | yes | yes | built | seen working by a person |
| [CAP-model-selection-07](#cap-model-selection-07) | Locked or unavailable model explains why | partly | yes | partly built | seen working by a person |
| [CAP-model-selection-08](#cap-model-selection-08) | Free plan default model and what Free users can pick | partly | yes | partly built | seen failing by a person |
| [CAP-model-selection-09](#cap-model-selection-09) | Heavier models use the allowance faster | yes | yes | partly built | seen working by a person |
| [CAP-model-selection-10](#cap-model-selection-10) | Fast speed tier | yes | yes | partly built | code inspected only |
| [CAP-model-selection-11](#cap-model-selection-11) | Faster Ultrafast tier above Fast | unknown | yes | not built | not verified |
| [CAP-model-selection-12](#cap-model-selection-12) | Max effort that delegates to subagents (Ultra, Ultracode) | yes | yes | not built | not verified |
| [CAP-model-selection-13](#cap-model-selection-13) | One-off deeper reasoning keyword | yes | unknown | not built | not verified |
| [CAP-model-selection-14](#cap-model-selection-14) | Automatic switch to another model for safety | yes | partly | partly built | not verified |
| [CAP-model-selection-15](#cap-model-selection-15) | Fallback to another model at a limit or outage | yes | yes | built | seen failing by a person |
| [CAP-model-selection-16](#cap-model-selection-16) | Model cannot do what the message needs | partly | partly | partly built | not verified |
| [CAP-model-selection-17](#cap-model-selection-17) | Retry or regenerate with a different model | unknown | yes | partly built | seen failing by a person |
| [CAP-model-selection-18](#cap-model-selection-18) | Default model, effort and new-chat start | yes | yes | built | seen working by a person |
| [CAP-model-selection-19](#cap-model-selection-19) | Admin controls for models and effort | yes | yes | partly built | not verified |
| [CAP-model-selection-20](#cap-model-selection-20) | New models off until an admin enables them | partly | yes | not built | code inspected only |
| [CAP-model-selection-21](#cap-model-selection-21) | Model retirement and replacement notices | yes | yes | partly built | not verified |
| [CAP-model-selection-22](#cap-model-selection-22) | Older models on request | partly | yes | not built | code inspected only |
| [CAP-model-selection-23](#cap-model-selection-23) | Context window shown per model | yes | yes | partly built | code inspected only |
| [CAP-model-selection-24](#cap-model-selection-24) | Model guidance and recommender | partly | yes | partly built | code inspected only |
| [CAP-model-selection-25](#cap-model-selection-25) | Advisor model second opinion | yes | unknown | partly built | code inspected only |
| [CAP-model-selection-26](#cap-model-selection-26) | Plan with a large model, run with a smaller one | yes | unknown | not built | not verified |
| [CAP-model-selection-27](#cap-model-selection-27) | Model and effort for subagents and agents | yes | partly | partly built | code inspected only |
| [CAP-model-selection-28](#cap-model-selection-28) | Bring your own provider or gateway | yes | yes | partly built | code inspected only |
| [CAP-model-selection-29](#cap-model-selection-29) | Local on-device model selection | no | no | partly built | not verified |
| [CAP-model-selection-30](#cap-model-selection-30) | Model choice inside voice mode and other fixed-model features | yes | yes | built | seen working by a person |
| [CAP-model-selection-31](#cap-model-selection-31) | Set model and effort from another device | yes | unknown | off by decision | not verified |
| [CAP-model-selection-32](#cap-model-selection-32) | Compare answers from several models | unknown | unknown | partly built | code inspected only |

## CAP-model-selection-01 Model picker on the composer

A control next to the send box that names the model for the next message and lets the person switch it, also in the middle of a chat.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (chat); Claude Code for /model: yes**
  - [https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings](https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings): One menu next to the send button controls model, effort and thinking; changes apply from the next response; Enterprise admins may hide models or fix a default. [reviewed 2026-11-22] Apps: web, desktop, ios, android.
  - [https://code.claude.com/docs/en/model-config.md](https://code.claude.com/docs/en/model-config.md): /model with no argument opens a picker; Enter saves as default, s switches for this session only. [reviewed 2026-11-22] Apps: cli.
- **ChatGPT; Codex and Work for the second link: yes**
  - [https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes](https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes): The picker sits in the composer on web and at the top on mobile; Thinking and Pro models show effort in the picker. [reviewed 2026-11-22] Plans: Enterprise, Edu. Apps: web, ios, android.
  - [https://learn.chatgpt.com/docs/models.md](https://learn.chatgpt.com/docs/models.md): Work and Codex show a control under the composer for model and reasoning effort; /model and --model in the CLI. [reviewed 2026-11-22] Apps: web, desktop, cli, ide.

**AGI requirement** (stated requirement; source: docs/decisions/2026-11-12-founder-decisions.md D-2026-11-12-04; docs/product/requirements.md M-MODEL-001). Every app shows the model the next message will use, lets the person switch it mid-chat, and applies the switch from the next message. The picker reads only the generated catalog and sits on the composer.

**With different models, providers and the one subscription.** Rows come from one catalog across all providers with a provider label. Plan locks come from the one AGI Subscription entitlement. In Local mode the picker lists on-device models first and cloud rows stay gated until sign-in and consent.

**Current implementation, as this trace read it on 2026-11-24: built.** Ledger says done on web, desktop, mobile, cli, vscode, chrome. Chrome has no search. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S15.01, S15.04, S15.10, S15.30, S79.02
- Comparison list ids: none matched; rows without an id: no id: Model picker with one line of guidance per model; no id: Change the model in the middle of a chat; no id: Open the model picker from the composer (mobile)
- Code: `apps/web/features/chat/components/Composer/ComposerFooter.tsx:1324`; `apps/mobile/src/features/chat/components/ModelSelectorButton.tsx:39`; `apps/cli/src/tui/widgets/model_picker.rs:487`; `apps/extension/src/side_panel.ts:10603`

**Gap.** Chrome picker has no search. At 390 px wide on web the model name is hidden and only an icon shows (seen defect W-5 and W-6). Free picker shortlist hides the active model.

**Acceptance criteria**

1. Open a new chat on each app: the composer names the model for the next message.
2. Switch model in the middle of a chat: the next reply is attributed to the new model, earlier replies keep theirs.
3. At 390 px wide the model name or an equivalent label is readable.
4. Reload: the chosen model is still shown.

**Verification: seen working by a person.** web scorecard W-6 subscribed: chose a model, answer logged on that model, choice persisted after reload and a new chat. Narrow-width icon-only defect in 6-defects/web-problems-seen-in-browser.csv (W-5, W-6). Other apps: code inspected only.

## CAP-model-selection-02 Reasoning effort levels per model

A control that sets how hard a model thinks. Only the levels that model accepts are offered.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude and Claude Code: yes**
  - [https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings](https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings): Effort selector Low, Medium, High, Extra high, Max; each model has a default; higher effort uses more tokens. [reviewed 2026-11-22] Apps: web, desktop, ios, android.
  - [https://code.claude.com/docs/en/model-config.md](https://code.claude.com/docs/en/model-config.md): /effort slider, --effort flag, env var and per-model settings; unsupported levels fall back downward; max is session only. [reviewed 2026-11-22] Apps: cli, ide.
- **ChatGPT and Codex: yes**
  - [https://help.openai.com/en/articles/20001354](https://help.openai.com/en/articles/20001354): Thinking slider with Instant, Medium, High, Extra High and a Pro option; Plus gets Medium and High, higher plans get more. [reviewed 2026-11-22] Plans: Free, Go, Plus, Pro, Business, Enterprise. Apps: web, ios, android.
  - [https://learn.chatgpt.com/docs/models.md](https://learn.chatgpt.com/docs/models.md): Light/Low, Medium, High, Extra High levels in Work and Codex; higher effort costs time and tokens. [reviewed 2026-11-22] Apps: web, desktop, cli, ide.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 8.2 (reasoning/thinking/effort controls in capability metadata); ledger S76.26). Each model's allowed effort levels come from the registry; each app offers and sends only those levels, defaults per model, and warns that higher effort uses more allowance. Levels beyond a plan's entitlement are shown as locked.

**With different models, providers and the one subscription.** Effort names map to each provider's own control in the adapter, never hard-coded per provider. Higher levels draw more from the one allowance. On-device models show effort only if the local model supports it.

**Current implementation, as this trace read it on 2026-11-24: built.** Done on web, desktop, mobile, cli, vscode, chrome per ledger. CLI also offers none and minimal. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S15.22, S76.26
- Comparison list ids: none matched; rows without an id: no id: Effort levels per model; no id: Reasoning effort levels (desktop, cli, vscode); no id: Choose how much effort the model uses (mobile)
- Code: `apps/web/features/chat/components/Composer/ComposerFooter.tsx:1691`; `packages/contracts/types/src/reasoning-settings.ts:3-11`; `apps/mobile/src/features/model-picker/components/EffortSlider.tsx:57`; `apps/cli/src/tui/tui_app.rs:6393`

**Gap.** Code sessions on cloud have no effort selector (DP69). Admin cap is one workspace-wide level, not per model (WP283). Top level stops at Max.

**Acceptance criteria**

1. Pick a model that supports three levels: the control shows exactly those three.
2. Pick a model with no effort control: the control is hidden or disabled.
3. Change effort, send: the request carries that level (check the usage record).
4. Switch to a model that does not accept the chosen level: it is clamped and the person is told.

**Verification: code inspected only.** No scorecard row tests effort levels. W-5 free notes an effort menu exists (no web-search toggle), nothing more.

## CAP-model-selection-03 Thinking switch and always-thinking models

A switch to turn extended thinking on or off where the model allows it. On always-thinking models the switch is absent and effort is the control.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude and Claude Code: yes**
  - [https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings](https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings): Thinking toggle shows an expandable Thinking section with a timer; cannot be turned off on the newest models, so lower the effort. [reviewed 2026-11-22] Apps: web, desktop, ios, android.
  - [https://code.claude.com/docs/en/interactive-mode.md](https://code.claude.com/docs/en/interactive-mode.md): Option/Alt+T toggles extended thinking; no effect on always-thinking models. [reviewed 2026-11-22] Apps: cli.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/11989085-what-is-chatgpt-go](https://help.openai.com/en/articles/11989085-what-is-chatgpt-go): Free and Go reach a thinking option through Think or Think harder in the + menu. [reviewed 2026-11-22] Plans: Go. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity). Show a thinking switch only when the model can turn thinking off; for always-on models hide it and explain that effort is the control. Show thinking text only where the route sends it.

**With different models, providers and the one subscription.** The switch state comes from catalog fields, not provider names. Thinking tokens count against the one allowance. On-device models without thinking show no switch.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and mobile show the switch per model. CLI sets thinking only for one provider's models. VS Code chat has no thinking text. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S76.26
- Comparison list ids: CP266, V21, VP13, W79; rows without an id: no id: Thinking on and off (web); no id: Thinking on or off per model (mobile)
- Code: `packages/contracts/types/src/reasoning-settings.ts:20-27`; `apps/web/features/chat/components/Composer/ComposerFooter.tsx:286`; `apps/cli/src/tui/tui_app.rs:8180`

**Gap.** CLI thinking on/off missing; VS Code chat does not display reasoning; no notice when thinking is cut for safety (W79). Seen: reasoning duration changes from 19s to 1s after reload.

**Acceptance criteria**

1. On a model that can disable thinking, switch it off and send: no thinking block appears.
2. On an always-on model the switch is absent.
3. Reload a chat: the thinking duration shown is the same as before reload.

**Verification: seen failing by a person.** 6-defects/web-problems-seen-in-browser.csv W-3 subscribed: Thought for 19s became Thought for 1s after reload; W-3 and W-2 long reasoning panels delay first words on trivial questions.

## CAP-model-selection-04 Automatic model choice (Auto)

A choice that lets the product pick the model for each message, instead of the person.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - [https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings](https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings): The page describes picking a model and effort by hand; no automatic per-message model choice is listed for the chat apps. [reviewed 2026-11-22] Apps: web, desktop, ios, android.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes](https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes): Enterprise with flexible pricing can route Auto reasoning requests to a smaller thinking model; separately, automatic Instant-to-thinking switching was retired for Enterprise and Edu. [reviewed 2026-11-22] Plans: Enterprise, Edu. Apps: web.
  - [https://help.openai.com/en/articles/9624314-model-release-notes](https://help.openai.com/en/articles/9624314-model-release-notes): An earlier single auto-switching system for all logged-in users; current consumer behavior is not stated on the pages saved. [reviewed 2026-11-22] Apps: web.

**AGI requirement** (stated requirement; source: docs/product/definition.md (Multi-provider model selection; Auto aliases admitted by the managed chat API); ledger S79.01, S79.16). Auto is the default on every app. It picks a model per message from the registry using task, plan, quota, health and privacy, never picks a model the plan or mode cannot use, and a person's explicit pick is never silently swapped.

**With different models, providers and the one subscription.** Eligibility filters by capability, lifecycle, plan, region and credentials before ranking. Auto spends the one allowance. In Local mode Auto chooses only among on-device models and costs nothing; it never routes to BYOK or cloud.

**Current implementation, as this trace read it on 2026-11-24: built.** Done on all six apps and the API per ledger. Web Free shows no Auto entry. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S15.08, S79.01, S79.04, S79.09, S79.12, S79.14, S79.16, S79.30
- Comparison list ids: WP76; rows without an id: no id: Automatic model choice (Auto) and routing profiles; no id: Auto model routing by task (cli); no id: Auto model that picks per message with a reason shown (chrome)
- Code: `packages/ai/routing/src/auto.ts:1592`; `apps/web/features/chat/components/Composer/ComposerFooter.tsx:1436`; `apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:671`; `apps/cli/src/lib.rs:461`

**Gap.** Free plan: no Auto entry on web (seen). A fixed-model chat cannot escalate itself to thinking (WP76). Seen: Auto answered a trivial question with Thought for 5s.

**Acceptance criteria**

1. Premium account, new chat: default is Auto.
2. Send a trivial and a hard prompt on Auto: the chosen model may differ and each reply names it.
3. Pick an explicit model, send: the reply comes from exactly that model.
4. In Local mode Auto never produces a cloud request (check network log).

**Verification: seen working by a person.** web scorecard W-6 subscribed: Auto default, reply showed Auto chose a model, server log matched. W-6 free: no Auto choice (seen failing).

## CAP-model-selection-05 Which model answered, and why Auto chose it

Each answer shows the model that actually produced it, and says when Auto or a fallback chose it.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/15363606-why-claude-switched-models-in-your-conversation-with-fable-models](https://support.claude.com/en/articles/15363606-why-claude-switched-models-in-your-conversation-with-fable-models): On a safety fallback Claude labels the answering model in the same conversation and keeps the picker on the fallback model. [reviewed 2026-11-22] Apps: web, desktop, ios, android, cli.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 4.3 and label rules (show provider, model and mode labels); ledger S15.32, S79.26, S79.27). Every answer discloses the serving model. When Auto chose it, or a fallback replaced the pick, the answer says so with a short reason. The label survives reload and sharing.

**With different models, providers and the one subscription.** Label uses catalog display names and the provider label from the route. Works the same for every provider and for on-device models, marked as on-device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Done on web, desktop, mobile, cli. Missing on vscode (S79.26, S79.27) and chrome for S15.32. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S15.32, S15.33, S79.26, S79.27, S79.28
- Comparison list ids: VP15; rows without an id: no id: Which model answered, shown on the turn; no id: Notice when a different model answered (mobile)
- Code: `apps/web/features/chat/components/messages/MessageBubble.tsx:3144`; `packages/ui/unified-chat/src/lib/modelEscalation.ts:58`; `apps/mobile/src/features/chat/components/MessageBubble.tsx:288`; `apps/cli/src/tui/tui_app.rs:1586`

**Gap.** Seen: the Auto chose line turns into a plain model name after reload (cosmetic defect). VS Code has no separate reroute notice.

**Acceptance criteria**

1. On Auto, send a message: the reply shows Auto chose plus the model.
2. Reload: the same attribution is shown.
3. Open a shared link of that chat: the shared page shows the model without an Unavailable model badge for a good turn.
4. VS Code reply on Auto names the serving model.

**Verification: seen failing by a person.** web-problems-seen-in-browser.csv W-6 subscribed: attribution lost after reload; W-14: shared page shows Unavailable model badge for a failed turn. Attribution itself seen working in scorecard W-6.

## CAP-model-selection-06 Which models each plan gets

Plan decides which models and effort levels a person can pick, with the largest models on higher plans.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude and Claude Code: yes**
  - [https://support.claude.com/en/articles/15424964-claude-fable-models-on-your-plan](https://support.claude.com/en/articles/15424964-claude-fable-models-on-your-plan): The largest model family is not on Free; Max, Ultra and premium seats can spend up to half the weekly limit on it, Pro and standard seats use credits. [reviewed 2026-11-22] Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop, ios, android, cli.
  - [https://code.claude.com/docs/en/model-config.md](https://code.claude.com/docs/en/model-config.md): Default model by account type; the largest family is never the default on any plan. [reviewed 2026-11-22] Plans: Pro, Max, Ultra, Team, Enterprise. Apps: cli.
- **ChatGPT: yes**
  - [https://chatgpt.com/pricing](https://chatgpt.com/pricing): Small model on every plan; larger models start on Plus; legacy models only on Plus and Pro; context windows grow by plan. [reviewed 2026-11-22] Plans: Free, Go, Plus, Pro. Apps: web.
  - [https://help.openai.com/en/articles/20001354](https://help.openai.com/en/articles/20001354): Thinking levels by plan: Plus gets Medium and High; Pro, Business and Enterprise add Extra High and Pro effort. [reviewed 2026-11-22] Plans: Free, Go, Plus, Pro, Business, Enterprise. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/definition.md; docs/product/commercial.md; ledger S15.18). Which models and effort levels each plan can pick is read from the one AGI Subscription entitlement and the catalog, identical on every app. Locked rows name the plan that unlocks them. Plan names follow the owner decision (Premium, Max, Ultra).

**With different models, providers and the one subscription.** One entitlement source, no per-app copy. Provider and model changes in the catalog change plan access without app edits. Local on-device models are free on every plan; sign-in rules are separate from payment.

**Current implementation, as this trace read it on 2026-11-24: built.** Done on web, desktop, mobile, cli, vscode, chrome and API per ledger. CLI lists only models the plan may use. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S15.18
- Comparison list ids: WP73; rows without an id: no id: Models offered depend on the plan (cli)
- Code: `packages/contracts/types/src/model-catalog.ts:1234-1270`; `apps/web/features/chat/components/Composer/ComposerFooter.tsx:719`; `apps/cli/src/tui/tui_app.rs:5494`; `apps/mobile/src/features/model-picker/service.ts:212`

**Gap.** Web comparison row WP73 says Free has no manual choice, but the person saw Free pick a second model from All models. Code tier policy says Free is auto only. Which one is intended is not recorded. Seen: silent 403 on a free-model endpoint for a Premium user.

**Acceptance criteria**

1. Free, Premium and Max accounts open the picker: each sees exactly the models its plan allows, same list on web and mobile.
2. A locked row names the unlocking plan.
3. Change plan: the picker updates without reinstalling.

**Verification: seen working by a person.** web scorecard W-6 free and subscribed: locked models show Upgrade to use with plan name; no credit used. Free list behavior conflicts with code tier policy.

## CAP-model-selection-07 Locked or unavailable model explains why

A disabled model option says why: plan, workspace role, capacity, usage limit with reset time or recent plan change.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/17444146](https://support.claude.com/en/articles/17444146): Explains a model removed from the selector, where it is still available and that old chats continue on its replacement. [reviewed 2026-11-22] Plans: Free, Pro, Max. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10258669-troubleshooting-model-feature-access](https://help.openai.com/en/articles/10258669-troubleshooting-model-feature-access): A model may look disabled due to capacity, workspace permissions, usage limits with reset time, flags or recent plan changes; fixes are listed. [reviewed 2026-11-22] Apps: web.

**AGI requirement** (inferred; source: competitor parity). A disabled model row says the reason in one short line: plan needed, admin policy, usage limit with reset time, provider outage, or model retiring. Clicking a plan-locked row opens an upgrade view and sends nothing.

**With different models, providers and the one subscription.** Reason codes come from the entitlement and route-health services, not from provider names. Free plan shows only Upgrade, never meters, per the owner's rule.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Plan lock and temporary-unavailable state exist on web, desktop, mobile. CLI and VS Code lack the unavailable state (S15.21). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S15.18, S15.21
- Comparison list ids: WP307, WP74
- Code: `packages/ui/unified-chat/src/components/ModelSelector.tsx:31`; `apps/web/features/chat/components/Composer/ModelCatalogue.tsx:554`; `apps/mobile/src/features/model-picker/components/ModelRow.tsx:79`

**Gap.** Picker names the plan only; it does not explain capacity or role blocks (WP74). Seen: locked pill overlaps icons and clips at 390 px.

**Acceptance criteria**

1. Tap a plan-locked model: an upgrade view opens, no message is sent, no allowance is used.
2. Block a model by workspace policy: its row says the admin blocked it.
3. At 390 px the locked pill does not overlap other icons.

**Verification: seen working by a person.** Scorecard W-6 free and subscribed: clicking a locked model opened the upgrade dialog with no credit spent. Defect: pill overlap at 390 (web-problems-seen-in-browser.csv W-6 free).

## CAP-model-selection-08 Free plan default model and what Free users can pick

The smallest model is on every plan including Free, with the larger ones locked. Free users get a plain default.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/17444146](https://support.claude.com/en/articles/17444146): The previous small model left the selector on Free, Pro and Max and was replaced by a newer small model. [reviewed 2026-11-22] Plans: Free, Pro, Max. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001354](https://help.openai.com/en/articles/20001354): Free and Go get the small model for Instant and a Think option; no larger model. [reviewed 2026-11-22] Plans: Free, Go. Apps: web, ios, android.
  - [https://chatgpt.com/pricing](https://chatgpt.com/pricing): The small model is the only newest-family model on Free and Go. [reviewed 2026-11-22] Plans: Free, Go. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/definition.md (provider-funded free chat models, owner decision 2026-10-04); docs/runbooks/free-quota-models.md). Free chat runs on a provider-funded free model that answers any plain question. A message that needs something the free model cannot do (web search, research, code run, Office file, skill, connected app, unreadable file) is answered by the account's Auto model for that one message with a saved note, and the chat stays on the free model.

**With different models, providers and the one subscription.** Free allowance is a separate temporary layer, never a plan model. The first request to a named provider asks for agreement. Local on-device chat stays free and offline.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web Free has a free default and a picker with locked rows; no Auto entry. Free-model hand-off rule exists in the managed path. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S79.14
- Comparison list ids: W55, WP73
- Code: `packages/contracts/types/src/model-catalog.ts:1234-1250`; `apps/web/lib/free-quota-authorization.ts`; `apps/web/features/chat/components/Composer/ComposerFooter.tsx:1336`

**Gap.** Free has no Auto choice and a new chat inherits the last model (seen). Default label reads the model name, not Auto. Whether Free should see Auto is undecided. No unlimited base-model promise (W55).

**Acceptance criteria**

1. First-time Free account: new chat starts on the free default and answers a plain question.
2. Ask the free model for a web search: the one message is answered by Auto with a note, the chat stays on the free model.
3. Pick a second model on Free and start a new chat: the next chat starts on the stated default.

**Verification: seen failing by a person.** web scorecard W-6 free: no Auto entry, new chat inherits last model, shortlist hides active model; defects W-6 free and W-2 free.

## CAP-model-selection-09 Heavier models use the allowance faster

The picker warns that a model or effort uses limits faster, and usage pages split by model.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work](https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work): Lower effort, turning thinking off where possible and disabling unneeded connectors reduce usage. [reviewed 2026-11-22] Apps: web, desktop, ios, android.
- **Codex and ChatGPT Work: yes**
  - [https://help.openai.com/en/articles/20001516](https://help.openai.com/en/articles/20001516): Estimated local messages per five-hour window by model; higher effort and faster modes use more allowance. [reviewed 2026-11-22] Plans: Plus, Business. Apps: desktop, web.

**AGI requirement** (inferred; source: competitor parity). Each model row and effort level shows a plain relative cost cue taken from catalog price and the plan allowance. The usage page breaks use down by model.

**With different models, providers and the one subscription.** Cues come from route price metadata across providers and draw on the one allowance. On Free the usage page shows only Upgrade and no meters (owner decision). On-device models show no cost.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Cost cue done on web, desktop, cli, vscode; missing on mobile and chrome (S15.17). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S15.16, S15.17
- Comparison list ids: WP32; rows without an id: no id: Usage warning on heavy models; no id: Usage history charts by model or product
- Code: `apps/web/features/chat/components/Composer/ComposerFooter.tsx:702`; `apps/cli/src/tui/tui_app.rs:3454`; `apps/extension-vscode/src/features/model-picker/modelConstants.ts:94`

**Gap.** Mobile and Chrome pickers show no cost cue. No per-model weekly bar (WP32).

**Acceptance criteria**

1. Open the picker on web: a heavy model shows a cost warning.
2. Use two models, open Usage: usage is split by model.
3. On a Free account Usage shows only Upgrade, no meters.

**Verification: seen working by a person.** web scorecard W-19 free partial: Usage on Free shows only Upgrade for higher capacity, no meters. Per-model cue: code inspected only.

## CAP-model-selection-10 Fast speed tier

A switch that serves the same model faster at a higher price in allowance.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code (and claude.ai/code): yes**
  - [https://code.claude.com/docs/en/fast-mode.md](https://code.claude.com/docs/en/fast-mode.md): /fast runs supported models up to 2.5 times faster at higher per-token cost; falls back to standard speed at the fast rate limit. [reviewed 2026-11-22] Plans: Pro, Max, Ultra, Team, Enterprise. Apps: cli, ide, web.
- **Codex and ChatGPT Work: yes**
  - [https://learn.chatgpt.com/docs/agent-configuration/speed.md](https://learn.chatgpt.com/docs/agent-configuration/speed.md): Standard, Fast, Ultrafast picker in Work and Codex; faster modes consume more allowance or credits. [reviewed 2026-11-22] Plans: Ultrafast: Pro, Enterprise, Edu. Apps: web, desktop, ios, android, cli, ide.

**AGI requirement** (inferred; source: competitor parity). Where a route offers a faster tier, a Fast switch appears for that model, states the extra allowance cost, respects plan and workspace policy, and falls back to standard speed with a notice at a limit.

**With different models, providers and the one subscription.** Fast tier and price multiplier live in the registry per route. On the CLI today /fast swaps to a faster model rather than a faster tier of the same model. Not offered for on-device models.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop, mobile have a Fast switch. CLI swaps model. VS Code and Chrome none. API missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S15.23, S76.36
- Comparison list ids: CP127, DP71, V23, V42; rows without an id: no id: Fast mode (web)
- Code: `apps/web/features/chat/hooks/use-fast-mode-availability.ts:18`; `apps/mobile/src/features/model-picker/components/SpeedControl.tsx`; `apps/cli/src/tui/tui_app.rs:5766`

**Gap.** No same-model fast tier on the CLI; none in VS Code; code composer has no Fast; registry has no serving-speed tiers (S76.36 missing).

**Acceptance criteria**

1. Pick a model with a fast tier: the Fast switch appears and states the cost.
2. Pick a model without one: no switch.
3. With workspace policy off, Fast is disabled with the reason.
4. At the fast limit the turn finishes at standard speed with a notice.

**Verification: code inspected only.** No scorecard or ledger live result covers Fast.

## CAP-model-selection-11 Faster Ultrafast tier above Fast

A second, faster tier on the newest models, limited to top plans.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **Codex and ChatGPT Work: yes**
  - [https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex](https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex): Ultrafast low-latency mode draws allowance at a multiple; available on Pro 200 and Pro 500, eligible Enterprise and Edu; not on Plus, Pro 100 or Business. [reviewed 2026-11-22] Plans: Pro 200, Pro 500, Enterprise, Edu. Apps: web, desktop, cli.

**AGI requirement** (proposed; source: competitor parity (ChatGPT only)). Not required until the owner decides. If built, it is a registry speed tier gated by plan and workspace policy.

**With different models, providers and the one subscription.** Would be one more registry tier per route and one more allowance multiplier. Not applicable to Local.

**Current implementation, as this trace read it on 2026-11-24: not built.** Only one fast tier exists on web, desktop. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S76.36
- Comparison list ids: D18, W91; rows without an id: no id: Faster speed mode on higher plans (Ultrafast)
- Code: `apps/web/features/chat/hooks/use-fast-mode-availability.ts:18`

**Gap.** No Ultrafast tier. Only one competitor documents it.

**Acceptance criteria**

1. If the owner approves: the tier shows only on eligible plans and models and states its cost.

**Verification: not verified.** Searched ultrafast in apps/web and packages: none.

## CAP-model-selection-12 Max effort that delegates to subagents (Ultra, Ultracode)

An effort setting above the top level that lets the product plan a workflow or split work across subagents.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/model-config.md](https://code.claude.com/docs/en/model-config.md): Ultracode toggle has Claude orchestrate dynamic workflows at the current effort; /effort ultracode or --effort ultracode. [reviewed 2026-11-22] Apps: cli, ide.
- **Codex and ChatGPT Work: yes**
  - [https://learn.chatgpt.com/docs/models.md](https://learn.chatgpt.com/docs/models.md): Ultra mode uses subagents to split work in parallel; not supported on the smallest model; enable in settings. [reviewed 2026-11-22] Plans: eligible accounts. Apps: web, desktop, cli, ide.
  - [https://learn.chatgpt.com/docs/agent-configuration/subagents.md](https://learn.chatgpt.com/docs/agent-configuration/subagents.md): Ultra intelligence level proactively delegates to subagents on supported models. [reviewed 2026-11-22] Plans: eligible accounts. Apps: web.

**AGI requirement** (proposed; source: competitor parity (coding tools only)). Not required until the owner decides. If built, a top effort option starts parallel workers, shows their models and cost, and obeys plan and trust boundaries.

**With different models, providers and the one subscription.** Workers use catalog models of any provider and spend the one allowance. In Local mode workers stay local.

**Current implementation, as this trace read it on 2026-11-24: not built.** Effort stops at max on all apps. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S79.23
- Comparison list ids: C117, V31, W92
- Code: `packages/contracts/types/src/reasoning-settings.ts:3-11`; `apps/cli/src/design_system.rs:392`

**Gap.** No ultra or ultracode level.

**Acceptance criteria**

1. If approved: choosing it shows how many workers start and what they cost, and Stop ends all of them.

**Verification: not verified.** Searched ultracode in apps/cli/src, apps/extension-vscode.

## CAP-model-selection-13 One-off deeper reasoning keyword

A word in the prompt (ultrathink) raises reasoning for that one turn.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/model-config.md](https://code.claude.com/docs/en/model-config.md): Including ultrathink requests deeper reasoning for that turn and raises effort; can be disabled by env var. [reviewed 2026-11-22] Apps: cli, ide, desktop.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: competitor parity (Claude Code only)). Not required until the owner decides.

**With different models, providers and the one subscription.** Would map to the highest effort the chosen model accepts; no effect on models without effort.

**Current implementation, as this trace read it on 2026-11-24: not built.** Effort set by picker only. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: D17, V24
- Code: `searched ultrathink in apps/web, apps/extension-vscode/src, apps/cli/src: none` (not found)

**Gap.** Missing; one competitor tool only.

**Acceptance criteria**

1. If approved: the keyword raises effort for one turn and the next turn returns to the picked level.

**Verification: not verified.** Search for the keyword found nothing.

## CAP-model-selection-14 Automatic switch to another model for safety

A flagged request is answered by a different model in the same chat, with a notice, and a setting decides whether to switch or pause.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude and Claude Code: yes**
  - [https://support.claude.com/en/articles/17161993-why-claude-switched-models-in-your-conversation-with-sonnet-5-5](https://support.claude.com/en/articles/17161993-why-claude-switched-models-in-your-conversation-with-sonnet-5-5): A narrow set of risky requests go to an older model in the same chat with a visible notice; the picker stays there until switched back; toggle in Settings > Capabilities. [reviewed 2026-11-22] Apps: web, desktop, ios, android, cli.
  - [https://code.claude.com/docs/en/model-config.md](https://code.claude.com/docs/en/model-config.md): switchModelsOnFlag setting: Ask each time pauses; subagents fail rather than ask. [reviewed 2026-11-22] Apps: cli.
- **ChatGPT: partly**
  - [https://learn.chatgpt.com/docs/enterprise/workspace-model-availability.md](https://learn.chatgpt.com/docs/enterprise/workspace-model-availability.md): Tasks on the newest model can pause for review under safety monitoring. [reviewed 2026-11-22] Plans: Enterprise, Edu. Apps: web.

**AGI requirement** (inferred; source: competitor parity). If a safety rule moves a turn to another model, the answer says so and why, the person can choose switch or pause, and the choice is a setting on every app.

**With different models, providers and the one subscription.** The fallback stays inside the same trust mode: a Local chat never falls back to cloud or BYOK; a BYOK chat never falls to managed cloud without an explicit fork.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Notice and answered-by chip exist on web, desktop, cli; no setting on web (WP58, W320) or mobile (M195). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S15.33
- Comparison list ids: M195, W320, WP58
- Code: `apps/web/features/chat/components/messages/MessageBubble.tsx:2667`; `apps/web/lib/chat-fallback-reason.ts:79`; `apps/cli/src/tui/tui_app.rs:1847`

**Gap.** No setting to switch or pause on flagged messages on web, desktop or mobile; no fallback notice on mobile (S15.33) or VS Code.

**Acceptance criteria**

1. Trigger a fallback: the reply names the new model and the reason.
2. Set Pause: the chat stops and offers edit or manual pick.
3. A Local chat that hits a rule never sends a cloud request.

**Verification: not verified.** No person-run result on safety fallback.

## CAP-model-selection-15 Fallback to another model at a limit or outage

When the chosen model is overloaded, retired or out of allowance, the product tries another model and tells the person.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/model-config.md](https://code.claude.com/docs/en/model-config.md): --fallback-model or fallbackModel chain (up to three) switches for the turn when the primary is overloaded or unavailable; applies to subagents. [reviewed 2026-11-22] Apps: cli.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001354](https://help.openai.com/en/articles/20001354): Pro 200 falls back to a lower thinking model at the weekly limit. [reviewed 2026-11-22] Plans: Pro. Apps: web, ios, android.
  - [https://help.openai.com/en/articles/9624314-model-release-notes](https://help.openai.com/en/articles/9624314-model-release-notes): Paid plans get a smaller thinking model as a fallback at rate limits; it is not in the picker. [reviewed 2026-11-22] Plans: Free, Go, Plus, Pro. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: ledger S79.16, S79.20; docs/product/requirements.md section 4.3). On provider failure, quota end or retirement, a healthy eligible route is tried, the answer says which model answered and why, and an explicit pick is never silently swapped (the person is asked or told).

**With different models, providers and the one subscription.** Fallback chain comes from the registry and route health, across providers. Cost of the fallback draws on the one allowance. Never crosses Local, BYOK or Managed boundaries.

**Current implementation, as this trace read it on 2026-11-24: built.** Done on all apps except fallback disclosure missing on mobile, vscode, chrome (S15.33). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S15.33, S79.16, S79.20, S91.22
- Comparison list ids: V46; rows without an id: no id: Falls back to another model at a limit or outage; no id: Automatic fallback to a second model on rate limit or outage (cli); no id: Fall back to another model when the first is unavailable (cli)
- Code: `apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.ts:347`; `apps/web/features/chat/components/UnavailableModelNotice.tsx`; `apps/cli/src/lib.rs:6224`; `apps/cli/src/agent_events.rs:57`

**Gap.** VS Code does not offer a cheaper model near a limit (V46). Seen: Stop shows a misleading model failed message (W-18).

**Acceptance criteria**

1. Force the primary route to fail: the reply arrives from another eligible model and names it.
2. An explicitly picked model that fails is not replaced silently.
3. Press Stop: no model failed message appears.

**Verification: seen failing by a person.** web-problems-seen-in-browser.csv W-18 subscribed: pressing Stop leaves a model failed message; W-9 free: after reconnect the reply errors with the model failed text.

## CAP-model-selection-16 Model cannot do what the message needs

When the chosen model lacks an ability (images, files, tools, search), the product says so, offers a switch or reroutes, and never pretends the ability exists.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/11101966-use-voice-mode](https://support.claude.com/en/articles/11101966-use-voice-mode): Voice mode lets you switch model family mid-call; the largest family is not available in voice. [reviewed 2026-11-22] Apps: web, desktop, ios, android.
  - [https://support.claude.com/en/articles/11088861-use-research-on-claude](https://support.claude.com/en/articles/11088861-use-research-on-claude): Research always runs on a fixed model and ignores the chat's chosen model; blocked if admin disabled both. [reviewed 2026-11-22] Apps: web, desktop, ios, android.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/20001598-intelligent-ui-in-chatgpt](https://help.openai.com/en/articles/20001598-intelligent-ui-in-chatgpt): Intelligent UI works at every reasoning level except Pro, and not in Work or Voice. [reviewed 2026-11-22] Plans: Free, Go, Plus, Pro, Business, Enterprise. Apps: web.
  - [https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex](https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex): Newest models are selectable in Work and Codex, not regular Chat. [reviewed 2026-11-22] Plans: Paid plans. Apps: web, desktop, cli.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 4.3 (Capability Honesty), M-MODEL-005, M-FILE-002; ledger S76.03, S76.21, S79.21, S15.34, S15.35). AGI never claims a model can do something its capability metadata does not prove. Controls for files, images and tools follow the chosen model. If a model cannot serve a message, the person is offered a one-click switch or keeps or removes the attachment, and Local models that cannot call tools hide tool use.

**With different models, providers and the one subscription.** Gating reads per-model and per-route capability from the registry for every provider. On-device models show their real limits. Cloud is never started to fill a missing local ability without explicit consent.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and desktop have the switch dialog and keep-or-remove attachments. VS Code has the dialog. Mobile, CLI, Chrome lack both (S15.34, S15.35). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S15.34, S15.35, S76.01, S76.03, S76.06, S76.21, S76.30, S79.11, S79.21
- Comparison list ids: MP27, MP33
- Code: `apps/web/features/chat/components/Composer/ComposerFooter.tsx:1341`; `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4059`; `apps/extension-vscode/src/features/model-picker/modelConstants.ts:303`

**Gap.** Mobile, CLI and Chrome have no incompatibility dialog or attachment choice. Registry does not record maximum file, image, audio or video sizes (S76.30 missing). Output and tool badges missing on mobile.

**Acceptance criteria**

1. Attach an image, pick a text-only model: a dialog explains what is lost and offers a capable model.
2. Attach a file a model cannot read: choose keep (switch) or remove.
3. Pick a local model without tools: tool controls are hidden or disabled with a reason.
4. Repeat on mobile and CLI.

**Verification: not verified.** No person-run result on this path; code inspected only.

## CAP-model-selection-17 Retry or regenerate with a different model

From a reply, rerun it on another model without changing the chat's model.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes](https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes): Retry menu simplified to regenerate with Thinking or Pro from the three-dot menu. [reviewed 2026-11-22] Plans: Plus, Pro, Business, Enterprise, Edu. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity (ChatGPT only)). A reply menu offers Try again with a list of eligible models; the chat's own model stays as it was.

**With different models, providers and the one subscription.** The list is the same eligible set as the picker, across providers, filtered by the message's needs and mode. Costs the usual allowance.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Done on web, desktop, mobile, chrome; missing on CLI and VS Code (S15.31). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S15.31
- Comparison list ids: M25; rows without an id: no id: Retry with a different model (Switch model); no id: Switch the model for a reply (mobile); no id: Try a reply again, with a choice of model (chrome)
- Code: `apps/web/features/chat/components/messages/MessageBubble.tsx:3205`; `apps/mobile/src/features/chat/components/MessageBubble.tsx:1665`; `apps/extension/src/features/side-panel/bubbles.ts:560-640`

**Gap.** No per-turn model switch on CLI and VS Code. Seen: Retry on a failed turn regenerated the first message and hid later turns (W-9 defect).

**Acceptance criteria**

1. Open Try again on a reply: a list of eligible models appears.
2. Choose one: a new reply is attributed to it and the chat's model is unchanged.
3. Retry on a failed later turn reruns that turn, not the first.

**Verification: seen failing by a person.** web-problems-seen-in-browser.csv W-9 subscribed: Retry on a failed turn regenerates the first message and hides later turns.

## CAP-model-selection-18 Default model, effort and new-chat start

Settings that decide which model and effort a new chat starts with, plus per-project and per-conversation overrides.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/model-config.md](https://code.claude.com/docs/en/model-config.md): Order of precedence: /model, --model, ANTHROPIC_MODEL, settings, default; Resumed sessions keep their saved model; per-model default effort. [reviewed 2026-11-22] Apps: cli.
- **Codex and ChatGPT Work: yes**
  - [https://learn.chatgpt.com/docs/models.md](https://learn.chatgpt.com/docs/models.md): Default local model set in config.toml shared by desktop, CLI and IDE; new Work chats start on a mid model at a light level. [reviewed 2026-11-22] Apps: desktop, cli, ide, web.

**AGI requirement** (stated requirement; source: owner decision recorded in comparison rows (new chats start on Auto, model-agnostic); ledger S15.09, S15.29, S15.30, S79.03). New chats start on Auto unless the person set a lasting default; a project can set its own default; a conversation keeps its own model. Defaults sync across apps for one account.

**With different models, providers and the one subscription.** Stored per account in one place, resolved through the catalog so a retired model falls to a replacement. A Local conversation keeps a local default.

**Current implementation, as this trace read it on 2026-11-24: built.** Done on web, desktop, mobile (sticky), cli, vscode, chrome. Project default missing on CLI and Chrome (S79.03). Mobile and Chrome have no lasting default setting (S15.09). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S15.09, S15.29, S15.30, S79.03
- Comparison list ids: none matched; rows without an id: no id: Default model and reasoning effort; no id: Default model and chat defaults per project; no id: New chats start on the model you used last (mobile); no id: Default model (web)
- Code: `apps/web/features/chat/lib/default-model-preference.ts:95`; `apps/web/features/settings/sections/GeneralSection.tsx:1053`; `apps/mobile/src/features/model-picker/store.ts:189`; `apps/web/features/projects/components/ProjectDefaultModelField.tsx:53`

**Gap.** Mobile has no lasting-default setting; project default not in CLI or Chrome. Free: new chat inherits last model (seen).

**Acceptance criteria**

1. Set a default in Settings: a new chat on every app starts on it.
2. Set a project default: a new chat in that project starts on it.
3. Change the model in one chat: another chat is unaffected.

**Verification: seen working by a person.** web scorecard W-6 subscribed: after switching to Auto, the next chat used Auto; Sonnet choice persisted into a new chat. Project default: code inspected only.

## CAP-model-selection-19 Admin controls for models and effort

Workspace admins allow or block models and providers, set a default model and a maximum effort, and pin Fast mode, per role.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12138966-release-notes](https://support.claude.com/en/articles/12138966-release-notes): Enterprise admins restrict which models and effort levels users can access. [reviewed 2026-11-22] Plans: Enterprise. Apps: web.
- **ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/enterprise/workspace-model-availability.md](https://learn.chatgpt.com/docs/enterprise/workspace-model-availability.md): Workspace model settings per workspace and role; settings do not carry over to Codex desktop, CLI, IDE or API. [reviewed 2026-11-22] Plans: Enterprise, Edu. Apps: web, desktop, cli, ide.

**AGI requirement** (inferred; source: competitor parity). Workspace admins set allowed models and providers, a default model, a maximum effort and Fast mode, per role and person, and the same policy applies on every app.

**With different models, providers and the one subscription.** One policy source across providers and apps; blocked models show a reason in the picker. Local models follow device policy.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and desktop have it. Mobile reads no org allow list (M207, M209). VS Code managed config pins no model (V97). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: M207, M209, V97, WP278, WP283, WP286, WP298, WP307, WP347; rows without an id: no id: Model access per workspace and role
- Code: apps/web/features/workspace-console/components/WorkspaceModelPolicy.ts (not found) (not found); `apps/web/app/api/settings/organization/policy/controls-schema.ts:34-62`; `apps/web/app/api/settings/organization/policy/diagnose/route.ts`

**Gap.** One max-effort cap for all models; no per-member model lookup; mobile and VS Code do not enforce.

**Acceptance criteria**

1. Admin blocks a model: it is locked on web, desktop, mobile and CLI for that role.
2. Admin caps effort: levels above the cap are not selectable.
3. Diagnose view explains why a member cannot see a model.

**Verification: not verified.** No person-run result for admin controls.

## CAP-model-selection-20 New models off until an admin enables them

Newly launched models start disabled in managed workspaces until an owner turns them on.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude and Claude Code: partly**
  - [https://support.claude.com/en/articles/15424964-claude-fable-models-on-your-plan](https://support.claude.com/en/articles/15424964-claude-fable-models-on-your-plan): On Enterprise the newest largest-family model stays off until an admin enables it, then is added to roles after seven days unless opted out. [reviewed 2026-11-22] Plans: Enterprise. Apps: web, desktop, cli.
- **ChatGPT and Codex: yes**
  - [https://learn.chatgpt.com/docs/enterprise/workspace-model-availability.md](https://learn.chatgpt.com/docs/enterprise/workspace-model-availability.md): Newly launched frontier models start disabled until an admin enables them. [reviewed 2026-11-22] Plans: Enterprise, Edu. Apps: web.

**AGI requirement** (proposed; source: competitor parity). Not required until the owner decides. If built, new catalog models start off in managed workspaces.

**With different models, providers and the one subscription.** Default-off flag would live in the model policy service for every provider.

**Current implementation, as this trace read it on 2026-11-24: not built.** A new catalog model reaches members at once unless an allow list is set. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W89, WP306
- Code: `apps/web/lib/services/model-policy-service.ts`

**Gap.** No default-off for new releases.

**Acceptance criteria**

1. If approved: a newly added model is absent for members until an admin enables it.

**Verification: code inspected only.** Searched allow list code; no default-off flag.

## CAP-model-selection-21 Model retirement and replacement notices

A model leaving soon shows its date; retired models are removed and old chats continue on a replacement.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude and Claude Code: yes**
  - [https://support.claude.com/en/articles/12738598-adapt-to-new-model-personas-after-deprecations](https://support.claude.com/en/articles/12738598-adapt-to-new-model-personas-after-deprecations): Models are retired roughly a year after release; carry style across with memory, past chat search and projects. [reviewed 2026-11-22] Apps: all chat apps.
  - [https://code.claude.com/docs/en/model-config.md](https://code.claude.com/docs/en/model-config.md): Startup notice when the requested model is retiring or remapped. [reviewed 2026-11-22] Apps: cli.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001053-what-to-expect-when-models-change](https://help.openai.com/en/articles/20001053-what-to-expect-when-models-change): When models are retired, prior conversations and shared background carry to newer models. [reviewed 2026-11-22] Apps: web, ios, android.
  - [https://help.openai.com/en/articles/20001051](https://help.openai.com/en/articles/20001051): Listed retired models and their replacements with dates. [reviewed 2026-11-22] Apps: web, ios, android.

**AGI requirement** (stated requirement; source: ledger S15.20, S76.37, S91.06; docs/product/definition.md (family slots in the catalog)). The registry carries each model's lifecycle. Retiring models show a date in the picker; retired models are removed; old chats continue on a named replacement; scheduled tasks and saved defaults move automatically with a notice.

**With different models, providers and the one subscription.** One lifecycle table across providers; replacement resolved by family slot, not a hard-coded model.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Done on web, desktop, cli; missing on mobile, vscode, chrome (S15.20). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S15.20, S76.37, S91.05, S91.06
- Comparison list ids: W90
- Code: `apps/web/features/chat/components/Composer/ComposerFooter.tsx:404`; `apps/web/features/models/lib/model-presentation.ts:44-54`; `apps/cli/src/provider.rs:296`

**Gap.** No retiring notice on mobile, VS Code, Chrome. No older-model toggle (W90).

**Acceptance criteria**

1. Mark a model retiring in the catalog: web picker shows its date.
2. Retire it: a chat that used it continues on the named replacement with a note.
3. A saved default that pointed to it moves to the replacement.

**Verification: not verified.** Code inspected only.

## CAP-model-selection-22 Older models on request

A toggle that shows older or legacy models in the picker for people who want them.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings](https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings): More models lists the other models beyond the default ones. [reviewed 2026-11-22] Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://chatgpt.com/pricing](https://chatgpt.com/pricing): Older models can be selected only on Plus and Pro. [reviewed 2026-11-22] Plans: Plus, Pro. Apps: web.
  - [https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes](https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes): Configure menu toggles legacy models and auto-switch to thinking. [reviewed 2026-11-22] Plans: Plus, Pro, Business, Enterprise, Edu. Apps: web, ios, android.

**AGI requirement** (proposed; source: competitor parity). Not required until the owner decides.

**With different models, providers and the one subscription.** Would be a catalog lifecycle filter; never shows models past retirement.

**Current implementation, as this trace read it on 2026-11-24: not built.** Picker lists current catalog models and labels retiring ones. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S76.37
- Comparison list ids: M41, W90
- Code: `apps/web/features/models/lib/model-presentation.ts:44-54`

**Gap.** No older-model toggle.

**Acceptance criteria**

1. If approved: the toggle shows older but still live models and hides retired ones.

**Verification: code inspected only.** Searched showLegacy in apps/mobile; none.

## CAP-model-selection-23 Context window shown per model

The picker or plan page shows how much a model or plan can hold.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude and Claude Code: yes**
  - [https://support.claude.com/en/articles/8606394-how-large-is-the-context-window-on-paid-claude-plans](https://support.claude.com/en/articles/8606394-how-large-is-the-context-window-on-paid-claude-plans): Chat context by model on paid plans: 1M, 500K or 200K depending on model; Claude Code separate. [reviewed 2026-11-22] Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop, ios, android, cli.
- **ChatGPT: yes**
  - [https://chatgpt.com/pricing](https://chatgpt.com/pricing): Instant context window 27K on Free, 54K on Go and Plus, 128K on Pro; reasoning window by plan. [reviewed 2026-11-22] Plans: Free, Go, Plus, Pro. Apps: web.

**AGI requirement** (stated requirement; source: ledger S15.15, S76.28). Each model row shows its context size from the registry; plan limits that cut it are stated.

**With different models, providers and the one subscription.** Window comes from catalog per route. On-device models show their real limit.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Done on web, desktop, cli; missing on mobile picker (MP27) and Chrome, vscode. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S15.15, S76.28, S76.29, S91.18
- Comparison list ids: MP27; rows without an id: no id: Context window size shown per model
- Code: `apps/web/features/chat/components/Composer/ModelCatalogue.tsx:185`; `apps/cli/src/tui/widgets/model_picker.rs:573`; `apps/web/app/api/llm/v1/models/route.ts:65`

**Gap.** Comparison row notes the cited picker is not in web chat; mobile shows plan window only. No long-context variant pick (D15).

**Acceptance criteria**

1. Open picker on web: context size appears per model.
2. Send a prompt larger than the window: the product trims or refuses with a clear message.
3. Mobile shows the window of the chosen model.

**Verification: code inspected only.** Comparison rows disagree on whether the web chat picker renders this.

## CAP-model-selection-24 Model guidance and recommender

Help choosing a model: one line per model, or a recommender that suggests model and effort for a task.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: partly**
  - [https://support.claude.com/en/articles/14552983-models-usage-and-limits-in-claude-code](https://support.claude.com/en/articles/14552983-models-usage-and-limits-in-claude-code): Large model for hard problems, mid model for most work, small model for quick tasks. [reviewed 2026-11-22] Plans: Pro, Max, Ultra, Team, Enterprise. Apps: cli.
- **Codex and ChatGPT Work: yes**
  - [https://learn.chatgpt.com/docs/model-selection.md](https://learn.chatgpt.com/docs/model-selection.md): Model line-up guidance, model and effort pairings, and an interactive recommender widget. [reviewed 2026-11-22] Apps: web, desktop, cli, ide.

**AGI requirement** (stated requirement; source: docs/decisions/2026-11-12-founder-decisions.md D-2026-11-12-05). The picker may give at most one short line per model; any recommender is optional and needs an owner call.

**With different models, providers and the one subscription.** Text comes from the catalog, not hand-written per provider.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Descriptions exist on web, desktop, cli, vscode, chrome; the owner decision says rows carry names only. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S15.07, S15.11
- Comparison list ids: W86; rows without an id: no id: Model picker with one line of guidance per model
- Code: `apps/web/features/chat/components/Composer/ComposerFooter.tsx:660`; `apps/cli/src/tui/widgets/model_picker.rs:409`

**Gap.** Ledger S15.11 expects a description; D-2026-11-12-05 removes descriptions from rows. No recommender (W86).

**Acceptance criteria**

1. Check the picker against D-2026-11-12-05 after the owner confirms which wins.
2. If a recommender is approved: choosing a task returns a model and effort pair that is eligible for the plan.

**Verification: code inspected only.** No person-run result.

## CAP-model-selection-25 Advisor model second opinion

A worker model consults a stronger model before acting, when stuck or before finishing.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/advisor.md](https://code.claude.com/docs/en/advisor.md): Advisor sees the full transcript; must rank at or above the main model; /advisor sets it; works on some providers only. [reviewed 2026-11-22] Plans: Subscription and API. Apps: cli, desktop.
- **ChatGPT, Codex: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: docs/decisions/2026-09-27-founder-decisions.md D-2026-09-28-07). Not required for chat. The owner decided not to build it for web or desktop chat because neither chat product offered it; CLI has it.

**With different models, providers and the one subscription.** Advisor must be a catalog model in the same trust mode and billed to the one allowance.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI has /advisor. Web and desktop missing by decision (S79.22 not applicable). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S79.22
- Comparison list ids: D16; rows without an id: no id: Advisor model consultation (cli); no id: Slash command /advisor (cli)
- Code: `apps/cli/src/platform/runtime/advisor.rs:13`; `apps/cli/src/tui/tui_app.rs:6612`

**Gap.** The decision says neither leader offers an advisor, but Claude Code does. Decision is stale for the coding tool.

**Acceptance criteria**

1. CLI: /advisor sends one question to a higher-tier catalog model and the reply says which.
2. In Local mode the advisor is a local model or the command is refused.

**Verification: code inspected only.** No person-run result.

## CAP-model-selection-26 Plan with a large model, run with a smaller one

A hybrid setting: the larger model plans, the cheaper one executes.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/model-config.md](https://code.claude.com/docs/en/model-config.md): opusplan uses the large model in plan mode and the mid model for execution. [reviewed 2026-11-22] Apps: cli.
- **Codex: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: competitor parity (Claude Code only)). Not required until the owner decides.

**With different models, providers and the one subscription.** Would pick a plan-mode model and an execute model from the catalog, any provider.

**Current implementation, as this trace read it on 2026-11-24: not built.** VS Code plan mode uses the session effort (V26). No hybrid model found. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S79.04
- Comparison list ids: V26
- Code: `searched plan_mode_reasoning in apps/extension-vscode/src: none` (not found)

**Gap.** No plan versus execute model split.

**Acceptance criteria**

1. If approved: plan mode uses model A and execution uses model B and both are named in the transcript.

**Verification: not verified.** Search found nothing.

## CAP-model-selection-27 Model and effort for subagents and agents

Each helper agent can use its own model and effort, with a global default and an admin allow list.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/sub-agents.md](https://code.claude.com/docs/en/sub-agents.md): Subagent model and effort fields; org allow list falls back with a warning; /tasks shows each subagent's model. [reviewed 2026-11-22] Plans: Team, Enterprise for the allow list. Apps: cli.
- **Codex and ChatGPT Work: partly**
  - [https://learn.chatgpt.com/docs/agent-configuration/subagents.md](https://learn.chatgpt.com/docs/agent-configuration/subagents.md): Subagent levels and Ultra delegation depend on the selected model. [reviewed 2026-11-22] Plans: eligible accounts. Apps: web.

**AGI requirement** (inferred; source: competitor parity). Agent files may set a model; a subagent never uses a model outside the plan, policy or trust mode.

**With different models, providers and the one subscription.** Catalog models of any provider; draws on the one allowance; Local sessions keep local workers.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI agent files set a model. No global subagent model (C125), no per-subagent effort (VP14). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S79.23
- Comparison list ids: C125, DP28, VP14, WP134
- Code: `apps/cli/src/agents.rs:24-45`; `apps/cli/src/subagent.rs:29-35`

**Gap.** Scheduled runs pick a model but no effort (WP134). Owner decided no per-routine effort (2026-09-27).

**Acceptance criteria**

1. Set a model in an agent file: the subagent runs on it and its row names it.
2. A model outside plan or policy is refused with a reason.

**Verification: code inspected only.** No person-run result.

## CAP-model-selection-28 Bring your own provider or gateway

The person points the tool at their own provider key or gateway and picks models from it.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/model-config.md](https://code.claude.com/docs/en/model-config.md): A custom model option and gateway model discovery add entries to the /model picker. [reviewed 2026-11-22] Apps: cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/models.md](https://learn.chatgpt.com/docs/models.md): Codex can use a gateway or custom provider with a compatible Responses API endpoint. [reviewed 2026-11-22] Apps: desktop, cli, ide.

**AGI requirement** (stated requirement; source: docs/product/definition.md trust modes; docs/product/requirements.md M-MODEL-004). BYOK routes in the picker are provider-labeled and gated; a move from Local to BYOK is an explicit fork with consent and a visible provider label.

**With different models, providers and the one subscription.** BYOK usage is outside the AGI allowance. Never silent from Local.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI and VS Code have BYOK selection. Web, desktop, mobile and Chrome do not (S15.28, mobile v1 hides BYOK). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S15.26, S15.28, S79.17, S79.18
- Comparison list ids: none matched; rows without an id: no id: Models from more than one vendor in one CLI
- Code: `apps/cli/src/tui/widgets/model_picker.rs:468`; `apps/cli/src/auth.rs:209`; `apps/extension-vscode/src/integrations/localRuntimeClient.ts:1479`

**Gap.** No provider or route lock on web, desktop, API by decision D-2026-09-28-07.

**Acceptance criteria**

1. CLI: pick a BYOK model: its row shows the provider label and key state.
2. A Local chat cannot move to BYOK without the consent step.

**Verification: code inspected only.** No person-run result.

## CAP-model-selection-29 Local on-device model selection

The person picks a model that runs on their own device, free and without sending data out.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: no**
  - no page found in the saved documentation
- **ChatGPT: no**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: docs/product/requirements.md M-MODEL-002, M-MODEL-003; docs/product/definition.md (Local trust mode)). Mobile and desktop offer free on-device models with clear states (installed, downloadable, unavailable, runtime offline). Auto in Local costs nothing and picks only local models. Locked cloud rows say sign-in required.

**With different models, providers and the one subscription.** Local never routes to BYOK or cloud silently. Sign-in is separate from payment. The catalogue shows no competitor on-device model picker; has is no only because nothing was found, so treat as unknown for the leaders.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Desktop, mobile, cli, vscode done; Chrome missing (Chrome is cloud only). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S15.27, S79.08
- Comparison list ids: none matched
- Code: `apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:67`; `apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:316`; `apps/desktop/electron/runtime/dispatcher.ts:799`; `apps/cli/src/tui/widgets/model_picker.rs:468`

**Gap.** None seen in the ledger, but no person has run local selection or the Local-never-leaves check.

**Acceptance criteria**

1. Airplane mode: pick an installed local model on mobile, send, get a reply.
2. Pick a not-installed local model: state says downloadable.
3. In Local mode no network request leaves for a model provider.
4. Locked cloud row says sign-in required and does not start Cloud.

**Verification: not verified.** Only web scorecards were read; none covers Local.

## CAP-model-selection-30 Model choice inside voice mode and other fixed-model features

Voice and research have their own model rules, separate from the chat picker.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11101966-use-voice-mode](https://support.claude.com/en/articles/11101966-use-voice-mode): Voice starts on the last used model family and updates to its latest; a selector switches families mid-call. [reviewed 2026-11-22] Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt](https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt): Deep research runs on the latest model by default; users may pick a legacy one. [reviewed 2026-11-22] Apps: web.

**AGI requirement** (inferred; source: competitor parity). A feature that uses a fixed or different model says which one and why. Research and voice follow the registry and the plan.

**With different models, providers and the one subscription.** Voice and research models come from registry slots, not call sites. Billed to the one allowance. Local voice stays on device.

**Current implementation, as this trace read it on 2026-11-24: built.** Voice and research use registry choices on web, desktop, mobile. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S76.08, S76.09, S76.11
- Comparison list ids: none matched; rows without an id: no id: Which model deep research runs on
- Code: `apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:82`; `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1616`

**Gap.** No in-call family switch found. Seen: voice typed turn showed Auto chose a model.

**Acceptance criteria**

1. Start voice mode: the model used is shown or discoverable.
2. Research states which model it runs on.

**Verification: seen working by a person.** web scorecard W-10: a typed turn inside voice mode answered with Auto chose a model; the spoken part could not be tested.

## CAP-model-selection-31 Set model and effort from another device

Pick the model and effort for a running session from a phone or browser.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/remote-control.md](https://code.claude.com/docs/en/remote-control.md): Model and effort picked on a connected device apply to that machine's session. [reviewed 2026-11-22] Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, ios, android.
- **Codex: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: owner decision 2026-11-14 recorded in the comparison rows (Remote Control hidden in v1)). Not required in v1; Remote Control is hidden on mobile by owner decision.

**With different models, providers and the one subscription.** Would reuse the picker and entitlement checks of the host.

**Current implementation, as this trace read it on 2026-11-24: off by decision.** Remote Control hidden in mobile v1. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched; rows without an id: no id: Remote host file browser, directory picker and branch setup from the phone
- Code: `apps/mobile/lib/v1FeatureFlags.ts`

**Gap.** Off by decision.

**Acceptance criteria**

1. When enabled: a model changed on the phone shows on the host session.

**Verification: not verified.** Feature is off.

## CAP-model-selection-32 Compare answers from several models

One prompt sent to several models and the answers shown side by side.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: AGI only). AGI keeps it; no competitor evidence needed.

**With different models, providers and the one subscription.** Each column costs the one allowance. Cloud only; Local compare would stay on device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop, mobile done; CLI, VS Code, Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S79.24
- Comparison list ids: none matched; rows without an id: no id: Compare model answers side by side (mobile)
- Code: `apps/web/features/models/components/ModelCatalogueBrowser.tsx:306`

**Gap.** Absent on three apps.

**Acceptance criteria**

1. Send one prompt to two models: two attributed answers appear, each charged.

**Verification: code inspected only.** No person-run result.

## Unresolved product choices

Decisions this topic needs from the owner. Nothing here has been decided.

- Should Free users get an Auto entry? Code policy says Free is auto only, yet a person saw a Free picker listing other models and no Auto.
- Do model rows carry a one-line description? Ledger S15.11 says yes; D-2026-11-12-05 says rows carry a name only.
- Build an ultra or ultracode level that delegates to subagents? Only the coding tools document it.
- Build an Ultrafast tier above Fast? Only ChatGPT Work and Codex document it, for top plans.
- Add the ultrathink keyword for one-turn deeper reasoning? Only Claude Code documents it.
- Add the 'switch model when a message is flagged' setting on web, desktop and mobile?
- Keep new models off by default for managed workspaces?
- Add a legacy-models toggle?
- Add a model and effort recommender?
- D-2026-09-28-07 says neither leader has an advisor model; Claude Code documents one and the CLI has one. Extend to desktop and web code sessions, or leave it?
- Add a plan-model and execute-model split (opusplan style)?
- Add a per-subagent or global subagent model default and per-subagent effort?
- Offer a larger-context variant in the picker?
- Show Think harder style entry points for low plans, or keep one picker?

## Could not establish

- Whether Claude chat has an automatic per-message model choice: no catalogue line shows it either way.
- Current ChatGPT consumer Auto behavior: only Enterprise release notes and an older auto-switch note were found.
- Only the web scorecard and web defect list were read; desktop, mobile, CLI, VS Code and Chrome have no person-seen result in this review.
- No person ran effort levels, Fast, safety fallback, attachment-incompatibility dialogs, admin controls, retirement notices or Local model selection.
- The web comparison row WP73 (Free has no manual choice) conflicts with the seen Free picker; seen evidence was used.
- The comparison row for context window in web chat says the cited picker is not rendered there; ledger says done. Unresolved.
- Exact plan names and allowances for AGI models were not rechecked against billing-plan-catalog.
- Competitor pages about Claude Code plans were taken from the catalogue, not re-opened; no page was opened beyond catalogue lines.
- Whether leaders restrict Local-style on-device models: nothing found, treated as unknown.
