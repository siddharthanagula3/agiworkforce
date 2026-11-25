---
id: "REQ-AREA-015"
type: "requirements"
title: "Requirement items: Model-selector interface"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 15. Model-selector interface

35 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S15.01

**Current-model label.** The composer always shows the name of the model the next message will use.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F015-01 See the model the next message will use](../../20-features/015-model-selector-interface/F015-01-see-the-model-the-next-message-will-use.md)
- Competitor trace: CAP-model-selection-01

## S15.02

**Provider label.** Each model in the selector shows which provider or developer makes it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web UI_ONLY
- Feature: [F015-02 Browse and search the model list](../../20-features/015-model-selector-interface/F015-02-browse-and-search-the-model-list.md)

## S15.03

**Model-family grouping.** Models are grouped by family (e.g. all versions of one model line together) so related models sit side by side.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome done
- Feature: [F015-02 Browse and search the model list](../../20-features/015-model-selector-interface/F015-02-browse-and-search-the-model-list.md)

## S15.04

**Searchable model list.** The user can type to filter the model list by name.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F015-02 Browse and search the model list](../../20-features/015-model-selector-interface/F015-02-browse-and-search-the-model-list.md)
- Competitor trace: CAP-model-selection-01

## S15.05

**Favorite models.** The user can mark models as favourites and see them together at the top.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F015-03 Favourites, recent models and recommended list](../../20-features/015-model-selector-interface/F015-03-favourites-recent-models-and-recommended-list.md)

## S15.06

**Recently used models.** The selector lists the models the user used most recently.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F015-03 Favourites, recent models and recommended list](../../20-features/015-model-selector-interface/F015-03-favourites-recent-models-and-recommended-list.md)

## S15.07

**Recommended models.** The selector highlights a short list of recommended models for the user.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing, Chrome done
- Feature: [F015-03 Favourites, recent models and recommended list](../../20-features/015-model-selector-interface/F015-03-favourites-recent-models-and-recommended-list.md)
- Competitor trace: CAP-model-selection-24

## S15.08

**Automatic-selection option.** The user can choose Auto so the product picks a model per message.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web UI_ONLY
- Feature: [F015-04 Auto and default for new chats](../../20-features/015-model-selector-interface/F015-04-auto-and-default-for-new-chats.md)
- Competitor trace: CAP-model-selection-04

## S15.09

**Default-profile option.** The user can set which model or profile new chats start with, as a lasting default.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, VS Code done, Chrome done
- Feature: [F015-04 Auto and default for new chats](../../20-features/015-model-selector-interface/F015-04-auto-and-default-for-new-chats.md)
- Competitor trace: CAP-model-selection-18

## S15.10

**Explicit model selection.** The user can pick a specific model and the next message uses it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F015-05 Pick a model and keep it](../../20-features/015-model-selector-interface/F015-05-pick-a-model-and-keep-it.md)
- Competitor trace: CAP-model-selection-01

## S15.11

**Model description.** Each model in the selector has a short description of what it is good for.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web UI_ONLY
- Feature: [F015-02 Browse and search the model list](../../20-features/015-model-selector-interface/F015-02-browse-and-search-the-model-list.md)
- Competitor trace: CAP-model-selection-24

## S15.12

**Input-modality badges.** Models show which inputs they accept (e.g. images, audio) as badges.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, VS Code missing, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F015-07 Capability and cost badges](../../20-features/015-model-selector-interface/F015-07-capability-and-cost-badges.md)

## S15.13

**Output-modality badges.** Models show which outputs they produce (e.g. image, video, audio) as badges.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F015-07 Capability and cost badges](../../20-features/015-model-selector-interface/F015-07-capability-and-cost-badges.md)

## S15.14

**Tool-support badge.** Models show whether they can use tools.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F015-07 Capability and cost badges](../../20-features/015-model-selector-interface/F015-07-capability-and-cost-badges.md)

## S15.15

**Context-capacity information.** The selector shows how much context each model can hold.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F015-07 Capability and cost badges](../../20-features/015-model-selector-interface/F015-07-capability-and-cost-badges.md)
- Competitor trace: CAP-model-selection-23

## S15.16

**Relative speed information.** The selector tells the user which models are faster or slower.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F015-08 Speed, status and plan labels](../../20-features/015-model-selector-interface/F015-08-speed-status-and-plan-labels.md)
- Competitor trace: CAP-model-selection-09

## S15.17

**Relative usage or cost information.** The selector shows how much each model costs or how fast it uses up the allowance.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code done, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F015-07 Capability and cost badges](../../20-features/015-model-selector-interface/F015-07-capability-and-cost-badges.md)
- Competitor trace: CAP-model-selection-09

## S15.18

**Plan-eligibility information.** Models the user's plan cannot use are marked with the plan that unlocks them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F015-08 Speed, status and plan labels](../../20-features/015-model-selector-interface/F015-08-speed-status-and-plan-labels.md)
- Competitor trace: CAP-model-selection-06, CAP-model-selection-07

## S15.19

**Preview or experimental badge.** Preview or experimental models carry a visible badge in the selector.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F015-08 Speed, status and plan labels](../../20-features/015-model-selector-interface/F015-08-speed-status-and-plan-labels.md)

## S15.20

**Deprecated-model notice.** A model scheduled for retirement shows a notice with its leaving date before it disappears.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F015-08 Speed, status and plan labels](../../20-features/015-model-selector-interface/F015-08-speed-status-and-plan-labels.md)
- Competitor trace: CAP-model-selection-21

## S15.21

**Temporary-unavailability state.** A model that is temporarily unavailable is marked as such in the selector and cannot be picked by mistake.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F015-08 Speed, status and plan labels](../../20-features/015-model-selector-interface/F015-08-speed-status-and-plan-labels.md)
- Competitor trace: CAP-model-selection-07

## S15.22

**Reasoning-effort selector.** For reasoning models the user can choose how hard the model thinks (effort level).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F015-09 Reasoning effort, fast mode and response style](../../20-features/015-model-selector-interface/F015-09-reasoning-effort-fast-mode-and-response-style.md)
- Competitor trace: CAP-model-selection-02

## S15.23

**Fast-serving option where supported.** Where a model offers a faster serving tier, the user can turn it on.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI partial, VS Code missing
- Feature: [F015-09 Reasoning effort, fast mode and response style](../../20-features/015-model-selector-interface/F015-09-reasoning-effort-fast-mode-and-response-style.md)
- Competitor trace: CAP-model-selection-10

## S15.24

**Response-length preference.** The user can set a preferred response length (shorter or longer answers).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F015-09 Reasoning effort, fast mode and response style](../../20-features/015-model-selector-interface/F015-09-reasoning-effort-fast-mode-and-response-style.md)

## S15.25

**Advanced sampling controls where exposed.** Where sampling settings are exposed, the user can set them (temperature, top-p).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F015-10 Sampling and provider route (developer controls)](../../20-features/015-model-selector-interface/F015-10-sampling-and-provider-route-developer-controls.md)

## S15.26

**Provider-route selection where exposed.** Where a model is offered by several providers, the user can choose which provider serves it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F015-10 Sampling and provider route (developer controls)](../../20-features/015-model-selector-interface/F015-10-sampling-and-provider-route-developer-controls.md)
- Competitor trace: CAP-model-selection-28

## S15.27

**Local-model selection.** The user can pick a model that runs on their own device.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Feature: [F015-11 Local and own-key routes](../../20-features/015-model-selector-interface/F015-11-local-and-own-key-routes.md)
- Competitor trace: CAP-model-selection-29

## S15.28

**BYOK route selection.** The user can choose to send turns through their own provider key, supplied in the product.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done, VS Code done, Chrome missing
- Feature: [F015-11 Local and own-key routes](../../20-features/015-model-selector-interface/F015-11-local-and-own-key-routes.md)
- Competitor trace: CAP-model-selection-28

## S15.29

**Sticky model preference.** The chosen model is remembered for the next session.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F015-05 Pick a model and keep it](../../20-features/015-model-selector-interface/F015-05-pick-a-model-and-keep-it.md)
- Competitor trace: CAP-model-selection-18

## S15.30

**Conversation-specific override.** A conversation can keep its own model, separate from the default used elsewhere.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F015-05 Pick a model and keep it](../../20-features/015-model-selector-interface/F015-05-pick-a-model-and-keep-it.md)
- Competitor trace: CAP-model-selection-01, CAP-model-selection-18

## S15.31

**Per-turn model override.** The user can run a single turn with a different model without changing the conversation's model.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F015-06 Per-message model override](../../20-features/015-model-selector-interface/F015-06-per-message-model-override.md)
- Competitor trace: CAP-model-selection-17

## S15.32

**Actual-serving-model disclosure.** Each answer shows which model actually produced it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F015-12 Switch safety, fallback and substitution notices](../../20-features/015-model-selector-interface/F015-12-switch-safety-fallback-and-substitution-notices.md)
- Competitor trace: CAP-model-selection-05, CAP-research-15

## S15.33

**Fallback disclosure.** When a different model answered because the chosen one failed or was unavailable, the answer says so and why.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F015-12 Switch safety, fallback and substitution notices](../../20-features/015-model-selector-interface/F015-12-switch-safety-fallback-and-substitution-notices.md)
- Competitor trace: CAP-model-selection-05, CAP-model-selection-14, CAP-model-selection-15

## S15.34

**Model-switch incompatibility dialog.** Switching to a model that cannot handle the current conversation (images, tools, context) asks for confirmation and explains what will be lost.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code done, Chrome missing
- Feature: [F015-12 Switch safety, fallback and substitution notices](../../20-features/015-model-selector-interface/F015-12-switch-safety-fallback-and-substitution-notices.md)
- Competitor trace: CAP-model-selection-16

## S15.35

**Preserve-or-remove incompatible attachments choice.** When the chosen model cannot read attached files, the user can choose to keep them (switching to a model that can) or remove them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F015-12 Switch safety, fallback and substitution notices](../../20-features/015-model-selector-interface/F015-12-switch-safety-fallback-and-substitution-notices.md)
- Competitor trace: CAP-model-selection-16
