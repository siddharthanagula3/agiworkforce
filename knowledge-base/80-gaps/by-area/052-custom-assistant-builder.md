---
id: "GAPS-AREA-052"
type: "gap-list"
title: "Gaps: Custom-assistant builder"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 52. Custom-assistant builder

77 open gaps that touch this area. Area page: [20-features/052-custom-assistant-builder](../../20-features/052-custom-assistant-builder/README.md).

## CMP-WP176

**Custom GPTs: build, share and publish an assistant**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F052-01](../../20-features/052-custom-assistant-builder/F052-01-assistant-list-and-manage.md), [F052-02](../../20-features/052-custom-assistant-builder/F052-02-create-and-edit-an-assistant.md), [F052-05](../../20-features/052-custom-assistant-builder/F052-05-instructions-starters-and-examples.md), [F052-10](../../20-features/052-custom-assistant-builder/F052-10-who-can-use-it-sharing.md)
- Detail: No public store Custom agents have instructions, knowledge, skills, versions and workspace sharing, but no public store.
- Evidence: apps/web/features/agents/components/AgentPublishPanel.tsx:19-28; apps/web/app/api/custom-agents/[id]/publish

## CMP-WP198

**Workspace agents with apps, custom MCP tools and skills**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F052-01](../../20-features/052-custom-assistant-builder/F052-01-assistant-list-and-manage.md), [F052-02](../../20-features/052-custom-assistant-builder/F052-02-create-and-edit-an-assistant.md), [F052-05](../../20-features/052-custom-assistant-builder/F052-05-instructions-starters-and-examples.md), [F052-10](../../20-features/052-custom-assistant-builder/F052-10-who-can-use-it-sharing.md)
- Detail: The choice between each runner's account and a shared agent account was not found Custom agents take knowledge, skills and connectors and can be published, but the choice between each runner's account and a shared agent account was not found.
- Evidence: apps/web/features/agents/components/AgentConfigForm.tsx:337; apps/web/features/agents/components/AgentSkillSelection.tsx

## GAP-AREA052-LW03

**Three separate stores for assistants: web in the database, desktop in Claude-folder files, CLI in its own folder plus Claude folder for reading. Nothing syncs them, and desktop writes to the Claude folder while the CLI creates files in its own folder.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-052
- Detail: Area 52. Custom-assistant builder
- Evidence: apps/cli/src/agents.rs:1110-1127 and 253; apps/desktop/src-tauri/src/sys/commands/custom_agents.rs:120-130

## GAP-AREA052-LW04

**Web defaults turn on web search, code execution and image generation for every new assistant.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-052
- Detail: Area 52. Custom-assistant builder
- Evidence: apps/web/lib/services/custom-agent-service.ts:40-42

## GAP-AREA052-LW05

**Long description is not separate: only the 300-character short description exists in the database and schema.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-052
- Detail: Area 52. Custom-assistant builder
- Evidence: apps/web/db/neon/0370_user_agents.sql:49; packages/contracts/cloud-contracts/src/agents.ts:91

## GAP-AREA052-LW06

**Reference file size limit is defined but the file-size check was not seen in addAgentFile, which checks only the count.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-052
- Detail: Area 52. Custom-assistant builder
- Evidence: packages/contracts/cloud-contracts/src/agents.ts:26; apps/web/lib/services/custom-agent-service.ts:767-783

## GAP-CAP-connectors-apps-and-extensions-28

**Custom assistants (custom GPTs) and migration to plugins: Guided builder, preview pane, starters, versions, public listing and migration are missing; migration row marked N/A.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F052-01](../../20-features/052-custom-assistant-builder/F052-01-assistant-list-and-manage.md), [F052-02](../../20-features/052-custom-assistant-builder/F052-02-create-and-edit-an-assistant.md), [F052-05](../../20-features/052-custom-assistant-builder/F052-05-instructions-starters-and-examples.md), [F052-10](../../20-features/052-custom-assistant-builder/F052-10-who-can-use-it-sharing.md)
- Requirement items: S52.01, S52.02, S52.10, S52.31, S52.33
- Detail: Claude unknown, ChatGPT partly; AGI partly built

## GAP-F052-01-01

**Brief marks web, mobile and desktop manager as missing although code exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-01](../../20-features/052-custom-assistant-builder/F052-01-assistant-list-and-manage.md)
- Detail: Affects: Anyone planning from the brief; web, mobile, desktop.. Work needed: Correct the brief statuses after a human check of the running apps.
- Evidence: S52.01 status line versus AgentsPage.tsx and AgentsScreen.tsx

## GAP-F052-01-02

**No Trash step before removing agent files.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-01](../../20-features/052-custom-assistant-builder/F052-01-assistant-list-and-manage.md)
- Detail: Affects: CLI and Tauri desktop users.. Work needed: Send the file to the operating system Trash, or archive it.
- Evidence: apps/cli/src/agents.rs:1147-1160; apps/desktop/src-tauri/src/sys/commands/custom_agents.rs:284-300; doc: AGENTS.md section 9

## GAP-F052-01-03

**Desktop and CLI use different agent folders for editing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-01](../../20-features/052-custom-assistant-builder/F052-01-assistant-list-and-manage.md)
- Detail: Affects: Developers who use both.. Work needed: Pick one write location and make both tools edit it.
- Evidence: custom_agents.rs:120-126 versus agents.rs:1129-1145

## GAP-F052-01-04

**No agent list on VS Code or Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-01](../../20-features/052-custom-assistant-builder/F052-01-assistant-list-and-manage.md)
- Detail: Affects: VS Code and Chrome users.. Work needed: Decide whether those surfaces need a list; if so build it on the shared contract.
- Evidence: No matching code found in apps/extension-vscode or apps/extension.

## GAP-F052-01-05

**Tauri desktop agent files are not run by the desktop app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-01](../../20-features/052-custom-assistant-builder/F052-01-assistant-list-and-manage.md)
- Detail: Affects: Tauri desktop users.. Work needed: Either run them or hide the screen.
- Evidence: custom_agents.rs:200-205 comment

## GAP-F052-01-06

**No Delete on the web list row.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-01](../../20-features/052-custom-assistant-builder/F052-01-assistant-list-and-manage.md)
- Detail: Affects: Web users.. Work needed: Optional row action; product decision.
- Evidence: AgentsPage.tsx:43-62

## GAP-F052-01-NOTBUILT

**Assistant list and manage: not built on VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F052-01](../../20-features/052-custom-assistant-builder/F052-01-assistant-list-and-manage.md)
- Requirement items: S52.01
- Detail: VS Code: S52.01; Chrome: S52.01

## GAP-F052-02-01

**Brief says web, desktop and mobile create/edit are missing; they exist.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-02](../../20-features/052-custom-assistant-builder/F052-02-create-and-edit-an-assistant.md)
- Detail: Affects: Planning accuracy.. Work needed: Update the brief after human verification.
- Evidence: S52.02 and S52.04 status lines versus the editor files.

## GAP-F052-02-02

**Two copies of the draft helpers.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-02](../../20-features/052-custom-assistant-builder/F052-02-create-and-edit-an-assistant.md)
- Detail: Affects: Maintainers; risk of drift between web and mobile.. Work needed: Use the shared module on web.
- Evidence: apps/web/features/agents/lib/agent-draft.ts and packages/contracts/cloud-contracts/src/agent-drafts.ts

## GAP-F052-02-03

**Tauri editor writes fewer fields than the CLI reads.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-02](../../20-features/052-custom-assistant-builder/F052-02-create-and-edit-an-assistant.md)
- Detail: Affects: Developers using the Tauri settings.. Work needed: Extend the writer or document the reduced set.
- Evidence: custom_agents.rs:217-257 versus agents.rs:25-48

## GAP-F052-02-04

**No create or edit on VS Code and Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-02](../../20-features/052-custom-assistant-builder/F052-02-create-and-edit-an-assistant.md)
- Detail: Affects: Those surfaces.. Work needed: Product decision then build.
- Evidence: No code found.

## GAP-F052-02-05

**Tauri save overwrites an existing file silently.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-02](../../20-features/052-custom-assistant-builder/F052-02-create-and-edit-an-assistant.md)
- Detail: Affects: Tauri desktop users.. Work needed: Check for an existing file or version it.
- Evidence: custom_agents.rs:260-282

## GAP-F052-02-NOTBUILT

**Create and edit an assistant: not built on VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F052-02](../../20-features/052-custom-assistant-builder/F052-02-create-and-edit-an-assistant.md)
- Requirement items: S52.02, S52.04
- Detail: VS Code: S52.02, S52.04; Chrome: S52.02, S52.04

## GAP-F052-03-01

**No guided conversational builder.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-03](../../20-features/052-custom-assistant-builder/F052-03-guided-builder-live-preview-and-tool-testing.md)
- Detail: Affects: All apps.. Work needed: Design the builder turn, its model route and billing, and the form fill contract.
- Evidence: S52.03 status missing on all apps; no code found.

## GAP-F052-03-02

**No live preview with unsaved changes.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-03](../../20-features/052-custom-assistant-builder/F052-03-guided-builder-live-preview-and-tool-testing.md)
- Detail: Affects: All apps; web users are blocked from chatting while dirty.. Work needed: Accept a draft config for a preview turn with clear metering.
- Evidence: AgentEditorPage.tsx:405; agent-turn-config.ts:57 loads by id.

## GAP-F052-03-03

**No tool or action testing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-03](../../20-features/052-custom-assistant-builder/F052-03-guided-builder-live-preview-and-tool-testing.md)
- Detail: Affects: All apps.. Work needed: Per-tool test endpoint with permission and result display.
- Evidence: S52.24 missing; editor tab list.

## GAP-F052-03-04

**CLI draft is not interactive.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-03](../../20-features/052-custom-assistant-builder/F052-03-guided-builder-live-preview-and-tool-testing.md)
- Detail: Affects: CLI users.. Work needed: Optional follow-up questions.
- Evidence: agents.rs:777-808

## GAP-F052-03-NOTBUILT

**Guided builder, live preview and tool testing: not built on Web, Desktop, Mobile, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, VS Code, Chrome
- Features: [F052-03](../../20-features/052-custom-assistant-builder/F052-03-guided-builder-live-preview-and-tool-testing.md)
- Requirement items: S52.03, S52.05, S52.24
- Detail: Web: S52.03, S52.05, S52.24; Desktop: S52.03, S52.05, S52.24; Mobile: S52.03, S52.05, S52.24; VS Code: S52.03, S52.05, S52.24; Chrome: S52.03, S52.05, S52.24

## GAP-F052-04-01

**No long description.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-04](../../20-features/052-custom-assistant-builder/F052-04-identity-name-icon-colour-and-descriptions.md)
- Detail: Affects: All apps.. Work needed: Add field, limit, migration, forms and display.
- Evidence: S52.09 missing; schema has one description field.

## GAP-F052-04-02

**Brief says avatar missing on web and mobile but they have icon and colour.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-04](../../20-features/052-custom-assistant-builder/F052-04-identity-name-icon-colour-and-descriptions.md)
- Detail: Affects: Planning accuracy.. Work needed: Correct the brief.
- Evidence: S52.07 status line versus AgentConfigForm.tsx:396-447.

## GAP-F052-04-03

**CLI and Tauri lack icons; CLI colour set differs from the web accent set.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-04](../../20-features/052-custom-assistant-builder/F052-04-identity-name-icon-colour-and-descriptions.md)
- Detail: Affects: Developers.. Work needed: Map colours or document the difference.
- Evidence: agents.rs:19-21 versus PROJECT_ACCENT_REGISTRY

## GAP-F052-04-04

**No identity on VS Code and Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-04](../../20-features/052-custom-assistant-builder/F052-04-identity-name-icon-colour-and-descriptions.md)
- Detail: Affects: Those surfaces.. Work needed: Product decision.
- Evidence: No code found.

## GAP-F052-04-NOTBUILT

**Identity: name, icon, colour and descriptions: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F052-04](../../20-features/052-custom-assistant-builder/F052-04-identity-name-icon-colour-and-descriptions.md)
- Requirement items: S52.06, S52.07, S52.08, S52.09
- Detail: CLI: S52.07, S52.09; VS Code: S52.06, S52.07, S52.08, S52.09; Chrome: S52.06, S52.07, S52.08, S52.09

## GAP-F052-05-01

**Conversation starters are never shown to people chatting.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-05](../../20-features/052-custom-assistant-builder/F052-05-instructions-starters-and-examples.md)
- Detail: Affects: Web and mobile chat users and builders who fill them in.. Work needed: Render starters in the agent chat empty state on web and mobile.
- Evidence: No consumer of conversationStarters outside the form, service and catalog; agentSystemPrompt ignores them.

## GAP-F052-05-02

**No suggested use cases field.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-05](../../20-features/052-custom-assistant-builder/F052-05-instructions-starters-and-examples.md)
- Detail: Affects: All apps.. Work needed: Define the field or fold into starters.
- Evidence: S52.12; no field in agents.ts.

## GAP-F052-05-03

**No CLI starters or examples.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-05](../../20-features/052-custom-assistant-builder/F052-05-instructions-starters-and-examples.md)
- Detail: Affects: CLI.. Work needed: Extend the file format.
- Evidence: agents.rs:25-48 struct lacks them.

## GAP-F052-05-04

**Brief marks instructions missing on web and mobile though built.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-05](../../20-features/052-custom-assistant-builder/F052-05-instructions-starters-and-examples.md)
- Detail: Affects: Planning.. Work needed: Correct the brief.
- Evidence: S52.10 status line.

## GAP-F052-05-NOTBUILT

**Instructions, starters and examples: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F052-05](../../20-features/052-custom-assistant-builder/F052-05-instructions-starters-and-examples.md)
- Requirement items: S52.10, S52.11, S52.12, S52.25, S52.26
- Detail: CLI: S52.11, S52.12, S52.25, S52.26; VS Code: S52.10, S52.11, S52.12, S52.25, S52.26; Chrome: S52.10, S52.11, S52.12, S52.25, S52.26

## GAP-F052-06-01

**No connected sources or refresh behaviour.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-06](../../20-features/052-custom-assistant-builder/F052-06-knowledge-reference-files-and-connected-sources.md)
- Detail: Affects: All apps.. Work needed: Design source types, auth through connectors, refresh schedule and storage.
- Evidence: S52.14 and S52.15 missing; no route, table or UI found.

## GAP-F052-06-02

**Brief marks file upload missing though web and mobile have it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-06](../../20-features/052-custom-assistant-builder/F052-06-knowledge-reference-files-and-connected-sources.md)
- Detail: Affects: Planning.. Work needed: Correct the brief.
- Evidence: S52.13 status line versus files route and panel.

## GAP-F052-06-03

**Silent truncation at 120,000 characters per turn.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-06](../../20-features/052-custom-assistant-builder/F052-06-knowledge-reference-files-and-connected-sources.md)
- Detail: Affects: Agents with many or large files.. Work needed: Tell the builder and chatter, or use retrieval.
- Evidence: agent-turn-config.ts:43-55

## GAP-F052-06-04

**No file upload on CLI, desktop, VS Code, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-06](../../20-features/052-custom-assistant-builder/F052-06-knowledge-reference-files-and-connected-sources.md)
- Detail: Affects: Those surfaces.. Work needed: Product decision.
- Evidence: No code found.

## GAP-F052-06-05

**A multi-file upload stops at the first failure.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-06](../../20-features/052-custom-assistant-builder/F052-06-knowledge-reference-files-and-connected-sources.md)
- Detail: Affects: Web users adding several files.. Work needed: Continue past failures and report each.
- Evidence: AgentKnowledgePanel.tsx:64-72

## GAP-F052-06-NOTBUILT

**Knowledge: reference files and connected sources: not built on Desktop, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop, CLI, VS Code, Chrome
- Features: [F052-06](../../20-features/052-custom-assistant-builder/F052-06-knowledge-reference-files-and-connected-sources.md)
- Requirement items: S52.13, S52.14, S52.15
- Detail: Desktop: S52.13, S52.14, S52.15; CLI: S52.13, S52.14, S52.15; VS Code: S52.13, S52.14, S52.15; Chrome: S52.13, S52.14, S52.15

## GAP-F052-07-01

**Image generation switch missing from CLI and desktop agent files.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-07](../../20-features/052-custom-assistant-builder/F052-07-model-and-tool-switches.md)
- Detail: Affects: CLI and desktop agent authors. Work needed: Add a field and enforce it on the CLI tool list, or document that tool lists cover it.
- Evidence: apps/cli/src/agents.rs:1429-1560 has no image field

## GAP-F052-07-02

**Connectors picker hidden everywhere while connectors are 'coming soon'.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-07](../../20-features/052-custom-assistant-builder/F052-07-model-and-tool-switches.md)
- Detail: Affects: Web and Mobile builders. Work needed: None in the agent code; follows the connector release decision.
- Evidence: packages/contracts/types/src/connector-release.ts:14; AgentConfigForm.tsx:660-665

## GAP-F052-07-03

**Server does not check the pinned model against the builder's plan.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-07](../../20-features/052-custom-assistant-builder/F052-07-model-and-tool-switches.md)
- Detail: Affects: Web and Mobile builders on lower plans. Work needed: Add the plan check on save, or confirm the chat route refuses it (unknown today).
- Evidence: custom-agent-service.ts:180-187 versus schedule-models.ts:30-41

## GAP-F052-07-04

**Mobile lacks effort, website lists and monthly credit fields.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-07](../../20-features/052-custom-assistant-builder/F052-07-model-and-tool-switches.md)
- Detail: Affects: Mobile builders. Work needed: Add the three controls with the same limits.
- Evidence: AgentConfigSections.tsx:317-398 versus AgentConfigForm.tsx:523-631

## GAP-F052-07-05

**No agent builder on VS Code or Chrome extension.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-07](../../20-features/052-custom-assistant-builder/F052-07-model-and-tool-switches.md)
- Detail: Affects: Editor and browser users. Work needed: Decide scope; at least a list and switch view against the shared routes.
- Evidence: No agent code found in apps/extension-vscode/src or apps/extension/src

## GAP-F052-07-06

**Brief marks Web, Mobile and Desktop 'missing' although code exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-07](../../20-features/052-custom-assistant-builder/F052-07-model-and-tool-switches.md)
- Detail: Affects: Anyone planning from the brief. Work needed: Re-run the brief's status pass.
- Evidence: area brief S52.16-S52.21 versus the code cited above

## GAP-F052-07-07

**mcpServers cannot be set through /agents set.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-07](../../20-features/052-custom-assistant-builder/F052-07-model-and-tool-switches.md)
- Detail: Affects: CLI users. Work needed: Add the field to the editable list.
- Evidence: agents.rs:1117-1127

## GAP-F052-07-NOTBUILT

**Model and tool switches: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F052-07](../../20-features/052-custom-assistant-builder/F052-07-model-and-tool-switches.md)
- Requirement items: S52.16, S52.17, S52.18, S52.19, S52.20, S52.21
- Detail: CLI: S52.20; VS Code: S52.16, S52.17, S52.18, S52.19, S52.20, S52.21; Chrome: S52.16, S52.17, S52.18, S52.19, S52.20, S52.21

## GAP-F052-08-01

**Whole feature missing: no schema import, action list, call path or sign-in settings.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-08](../../20-features/052-custom-assistant-builder/F052-08-custom-actions-from-an-api-schema.md)
- Detail: Affects: All six apps. Work needed: Design on the connector and MCP layer, add storage for credentials, add UI on Web and Mobile, add enforcement in the chat route.
- Evidence: No implementation found; brief S52.22 and S52.23 mark every app missing

## GAP-F052-08-02

**Product direction on actions is not decided in the docs; only the GPT builder is named a migration source.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-08](../../20-features/052-custom-assistant-builder/F052-08-custom-actions-from-an-api-schema.md)
- Detail: Affects: Planning. Work needed: A decision record before building.
- Evidence: docs/product/definition.md:183-184

## GAP-F052-08-NOTBUILT

**Custom actions from an API schema: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F052-08](../../20-features/052-custom-assistant-builder/F052-08-custom-actions-from-an-api-schema.md)
- Requirement items: S52.22, S52.23
- Detail: Web: S52.22, S52.23; Desktop: S52.22, S52.23; Mobile: S52.22, S52.23; CLI: S52.22, S52.23; VS Code: S52.22, S52.23; Chrome: S52.22, S52.23

## GAP-F052-09-01

**No CLI, VS Code or Chrome draft, publish or version features; CLI and desktop edit one file.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-09](../../20-features/052-custom-assistant-builder/F052-09-drafts-publishing-and-versions.md)
- Detail: Affects: CLI, desktop file, VS Code and Chrome users. Work needed: Decide whether file agents get versions (git) or cloud agents become selectable in those apps.
- Evidence: apps/cli/src/agents.rs command list (lines 565-570); custom_agents.rs:260-282

## GAP-F052-09-02

**No live test pane that uses unsaved edits.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-09](../../20-features/052-custom-assistant-builder/F052-09-drafts-publishing-and-versions.md)
- Detail: Affects: Web and Mobile builders. Work needed: A preview chat that carries the draft in the request.
- Evidence: AgentEditorPage.tsx:405 disables Chat while dirty

## GAP-F052-09-03

**Restore can fail on a model no longer in the catalog.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-09](../../20-features/052-custom-assistant-builder/F052-09-drafts-publishing-and-versions.md)
- Detail: Affects: Web and Mobile builders. Work needed: Clear the model on restore with a notice.
- Evidence: custom-agent-service.ts:214, 550

## GAP-F052-09-04

**No diff between versions.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-09](../../20-features/052-custom-assistant-builder/F052-09-drafts-publishing-and-versions.md)
- Detail: Affects: Builders. Work needed: Add a comparison view.
- Evidence: AgentPublishPanel.tsx:317-336

## GAP-F052-09-05

**Brief says missing on all apps.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-09](../../20-features/052-custom-assistant-builder/F052-09-drafts-publishing-and-versions.md)
- Detail: Affects: Planning. Work needed: Update the brief.
- Evidence: area brief S52.27-S52.30

## GAP-F052-09-NOTBUILT

**Drafts, publishing and versions: not built on Desktop, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop, CLI, VS Code, Chrome
- Features: [F052-09](../../20-features/052-custom-assistant-builder/F052-09-drafts-publishing-and-versions.md)
- Requirement items: S52.27, S52.28, S52.29, S52.30
- Detail: Desktop: S52.27, S52.28, S52.29, S52.30; CLI: S52.27, S52.28, S52.29, S52.30; VS Code: S52.27, S52.28, S52.29, S52.30; Chrome: S52.27, S52.28, S52.29, S52.30

## GAP-F052-10-01

**No public listing or directory.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-10](../../20-features/052-custom-assistant-builder/F052-10-who-can-use-it-sharing.md)
- Detail: Affects: All apps. Work needed: Product decision first (docs/product/definition.md:183), then visibility value, review and browse UI.
- Evidence: No code found; brief S52.34

## GAP-F052-10-02

**People picker limited to 100 members, no paging.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-10](../../20-features/052-custom-assistant-builder/F052-10-who-can-use-it-sharing.md)
- Detail: Affects: Web and Mobile owners in large workspaces. Work needed: Paging and search.
- Evidence: share/route.ts:46-51; agents.ts:28

## GAP-F052-10-03

**No sharing in CLI, VS Code, Chrome or desktop file editor beyond folders.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-10](../../20-features/052-custom-assistant-builder/F052-10-who-can-use-it-sharing.md)
- Detail: Affects: Those apps. Work needed: Decide whether those apps read cloud agents.
- Evidence: No code found

## GAP-F052-10-04

**Brief marks Web and Mobile 'missing'; CLI 'partial' for workspace access using lines that are not sharing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-10](../../20-features/052-custom-assistant-builder/F052-10-who-can-use-it-sharing.md)
- Detail: Affects: Planning. Work needed: Correct the brief.
- Evidence: Brief S52.31-S52.33

## GAP-F052-10-05

**How recipient turns are billed is not visible in the agent code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-10](../../20-features/052-custom-assistant-builder/F052-10-who-can-use-it-sharing.md)
- Detail: Affects: Owners and recipients. Work needed: Confirm in SYS-subscriptions page.
- Evidence: agent-turn-config.ts has only caps

## GAP-F052-10-NOTBUILT

**Who can use it (sharing): not built on Desktop, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop, CLI, VS Code, Chrome
- Features: [F052-10](../../20-features/052-custom-assistant-builder/F052-10-who-can-use-it-sharing.md)
- Requirement items: S52.31, S52.32, S52.33, S52.34
- Detail: Desktop: S52.31, S52.32, S52.33, S52.34; CLI: S52.32, S52.34; VS Code: S52.31, S52.32, S52.33, S52.34; Chrome: S52.31, S52.32, S52.33, S52.34

## GAP-F052-11-01

**No verified publisher status.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-11](../../20-features/052-custom-assistant-builder/F052-11-creator-identity-and-usage.md)
- Detail: Affects: All apps. Work needed: Define who verifies, store it, show it; depends on public listing.
- Evidence: No field in agents.ts or 0370 migration

## GAP-F052-11-02

**No creator profile beyond a name.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-11](../../20-features/052-custom-assistant-builder/F052-11-creator-identity-and-usage.md)
- Detail: Affects: Teammates. Work needed: Avatar and link if wanted.
- Evidence: agent-display.ts:22

## GAP-F052-11-03

**Usage is three totals only; no trend, per-version or cost view; spend not shown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-11](../../20-features/052-custom-assistant-builder/F052-11-creator-identity-and-usage.md)
- Detail: Affects: Owners. Work needed: Charts and spend line.
- Evidence: AgentManagePanel.tsx:80-97

## GAP-F052-11-04

**Email used as fallback creator name.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-11](../../20-features/052-custom-assistant-builder/F052-11-creator-identity-and-usage.md)
- Detail: Affects: Privacy of builders. Work needed: Confirm policy or remove fallback.
- Evidence: service:277

## GAP-F052-11-05

**Brief marks all missing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-11](../../20-features/052-custom-assistant-builder/F052-11-creator-identity-and-usage.md)
- Detail: Affects: Planning. Work needed: Update brief.
- Evidence: S52.35-S52.37

## GAP-F052-11-NOTBUILT

**Creator identity and usage: not built on Desktop, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop, CLI, VS Code, Chrome
- Features: [F052-11](../../20-features/052-custom-assistant-builder/F052-11-creator-identity-and-usage.md)
- Requirement items: S52.35, S52.36, S52.37
- Detail: Desktop: S52.35, S52.36, S52.37; CLI: S52.35, S52.36, S52.37; VS Code: S52.35, S52.36, S52.37; Chrome: S52.35, S52.36, S52.37

## GAP-F052-12-01

**No duplicate or fork of an agent.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-12](../../20-features/052-custom-assistant-builder/F052-12-copy-move-and-retire.md)
- Detail: Affects: Web, Mobile, CLI, desktop. Work needed: Add a copy action over createAgent.
- Evidence: No code found; brief S52.38

## GAP-F052-12-02

**No deprecation notice or replacement link; status has no text field.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-12](../../20-features/052-custom-assistant-builder/F052-12-copy-move-and-retire.md)
- Detail: Affects: Recipients of retired or paused agents. Work needed: Add fields, show in refusal and list, test.
- Evidence: agents.ts:11; agent-turn-config.ts:33-41

## GAP-F052-12-03

**Export and import drop tool switches, connectors, limits, website rules, icon and starters; import defaults all tools on.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-12](../../20-features/052-custom-assistant-builder/F052-12-copy-move-and-retire.md)
- Detail: Affects: Anyone moving agents, including CLI to Web. Work needed: Carry or warn; default tools off when a file lists tools.
- Evidence: agent-markdown.ts:84-104, 159-171

## GAP-F052-12-04

**Import and export missing on VS Code and Chrome; CLI has no import command.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-12](../../20-features/052-custom-assistant-builder/F052-12-copy-move-and-retire.md)
- Detail: Affects: Those apps. Work needed: Decide scope.
- Evidence: No code found

## GAP-F052-12-05

**Permanent delete on CLI, desktop file and Web has no holding area.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-12](../../20-features/052-custom-assistant-builder/F052-12-copy-move-and-retire.md)
- Detail: Affects: All owners. Work needed: Review against AGENTS.md section 9 on agent-removed data; the confirmations name the loss, so only an undo window is missing.
- Evidence: service:437-447; agents.rs:1147-1163; custom_agents.rs:284-304

## GAP-F052-12-06

**Brief marks all items missing though Web and Mobile code exist.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F052-12](../../20-features/052-custom-assistant-builder/F052-12-copy-move-and-retire.md)
- Detail: Affects: Planning. Work needed: Update the brief.
- Evidence: S52.38-S52.41

## GAP-F052-12-NOTBUILT

**Copy, move and retire: not built on VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F052-12](../../20-features/052-custom-assistant-builder/F052-12-copy-move-and-retire.md)
- Requirement items: S52.38, S52.39, S52.40, S52.41
- Detail: VS Code: S52.38, S52.39, S52.40, S52.41; Chrome: S52.38, S52.39, S52.40, S52.41
