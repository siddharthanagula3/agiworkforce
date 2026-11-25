---
id: "GAPS-AREA-053"
type: "gap-list"
title: "Gaps: Skill creation and management"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 53. Skill creation and management

98 open gaps that touch this area. Area page: [20-features/053-skill-creation-and-management](../../20-features/053-skill-creation-and-management/README.md).

## CMP-C291

**Skill listing context budget**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F053-03](../../20-features/053-skill-creation-and-management/F053-03-using-a-skill-in-chat-manual-and-automatic.md)
- Detail: No cap or setting on how much context the skill list uses.
- Evidence: searched: skill budget in apps/cli/src/skills.rs, agent/prompt.rs

## CMP-CP244

**Skill frontmatter: paths globs and manual-only**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F053-03](../../20-features/053-skill-creation-and-management/F053-03-using-a-skill-in-chat-manual-and-automatic.md)
- Detail: There is no file-glob activation allow_implicit keeps a skill manual-only; there is no file-glob activation.
- Evidence: apps/cli/src/skills.rs:45; searched: paths in skills.rs

## CMP-DP92

**Record a skill by demonstrating a workflow**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F053-11](../../20-features/053-skill-creation-and-management/F053-11-recorded-skills-demonstration-and-voice-teaching.md)
- Detail: There is no update-existing-skill proposal The recorder takes screenshots every few seconds and no clicks, typing or audio; there is no update-existing-skill proposal.
- Evidence: apps/web/features/skill-recorder/components/SkillRecorder.tsx; apps/desktop/electron/runtime/skillCapture.ts:229

## CMP-MP64

**Assistant proposes a connected app on its own**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F053-03](../../20-features/053-skill-creation-and-management/F053-03-using-a-skill-in-chat-manual-and-automatic.md)
- Detail: The assistant does not pick a connected app mid-chat New chats suggest apps to connect; the assistant does not pick a connected app mid-chat.
- Evidence: apps/mobile/src/features/chat/components/NewChatConnectorSuggestions.tsx:34

## CMP-W236

**Edit a skill's files with the assistant beside the chat**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F053-01](../../20-features/053-skill-creation-and-management/F053-01-skill-directory-and-installed-list.md), [F053-02](../../20-features/053-skill-creation-and-management/F053-02-skill-detail-page-and-requirements.md), [F053-04](../../20-features/053-skill-creation-and-management/F053-04-install-turn-on-and-off.md), [F053-05](../../20-features/053-skill-creation-and-management/F053-05-personal-skills-create-edit-delete.md), [F053-06](../../20-features/053-skill-creation-and-management/F053-06-upload-import-and-export.md), [F053-07](../../20-features/053-skill-creation-and-management/F053-07-bundled-files-and-scripts.md)
- Detail: The skill editor is a plain form; no assistant edits a skill's files.
- Evidence: searched: assistant, improve skill in apps/web/features/skills/components/SkillEditorDialog.tsx

## CMP-W257

**Suggestion cards offering a plugin for the current task**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F053-03](../../20-features/053-skill-creation-and-management/F053-03-using-a-skill-in-chat-manual-and-automatic.md)
- Detail: Only a new-chat connector suggestion strip and cards for plugins the assistant drafts exist; no card suggests installing a plugin.
- Evidence: apps/web/features/chat/components/NewChat/NewChatConnectorSuggestions.tsx:1-30

## CMP-W263

**Watch the skills intro video**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F053-01](../../20-features/053-skill-creation-and-management/F053-01-skill-directory-and-installed-list.md), [F053-02](../../20-features/053-skill-creation-and-management/F053-02-skill-detail-page-and-requirements.md), [F053-04](../../20-features/053-skill-creation-and-management/F053-04-install-turn-on-and-off.md), [F053-05](../../20-features/053-skill-creation-and-management/F053-05-personal-skills-create-edit-delete.md), [F053-06](../../20-features/053-skill-creation-and-management/F053-06-upload-import-and-export.md), [F053-07](../../20-features/053-skill-creation-and-management/F053-07-bundled-files-and-scripts.md)
- Detail: No intro video entry in the skills Add menu.
- Evidence: searched: intro video, Watch the intro in packages/ui/ui/src/directory, apps/web features/directory

## CMP-WP169

**Skills with bundled reference files and scripts**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F053-01](../../20-features/053-skill-creation-and-management/F053-01-skill-directory-and-installed-list.md), [F053-02](../../20-features/053-skill-creation-and-management/F053-02-skill-detail-page-and-requirements.md), [F053-04](../../20-features/053-skill-creation-and-management/F053-04-install-turn-on-and-off.md), [F053-05](../../20-features/053-skill-creation-and-management/F053-05-personal-skills-create-edit-delete.md), [F053-06](../../20-features/053-skill-creation-and-management/F053-06-upload-import-and-export.md), [F053-07](../../20-features/053-skill-creation-and-management/F053-07-bundled-files-and-scripts.md)
- Detail: No path that runs a bundled script was found Skill files are stored and served per skill, but no path that runs a bundled script was found.
- Evidence: apps/web/app/api/skills/[name]/files/route.ts; searched: skill script, runSkillScript in apps/web

## CMP-WP171

**Admin switch to stop members creating their own skills**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F053-08](../../20-features/053-skill-creation-and-management/F053-08-project-and-organisation-scope.md)
- Detail: Not just creation Admins can switch Skills off for the workspace but not just creation.
- Evidence: packages/contracts/types/src/enterprise/workspace-controls.ts:3-18

## CMP-WP181

**Download a custom skill or delete it with confirmation**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F053-01](../../20-features/053-skill-creation-and-management/F053-01-skill-directory-and-installed-list.md), [F053-02](../../20-features/053-skill-creation-and-management/F053-02-skill-detail-page-and-requirements.md), [F053-04](../../20-features/053-skill-creation-and-management/F053-04-install-turn-on-and-off.md), [F053-05](../../20-features/053-skill-creation-and-management/F053-05-personal-skills-create-edit-delete.md), [F053-06](../../20-features/053-skill-creation-and-management/F053-06-upload-import-and-export.md), [F053-07](../../20-features/053-skill-creation-and-management/F053-07-bundled-files-and-scripts.md)
- Detail: There is no one-click download of the whole skill package Skill detail downloads single files and deletes the skill; there is no one-click download of the whole skill package.
- Evidence: apps/web/features/directory/hooks/useDirectoryAdapter.ts:1529; apps/web/features/directory/services/skills-directory.ts:297-311

## CMP-WP193

**Share a skill with teammates**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F053-08](../../20-features/053-skill-creation-and-management/F053-08-project-and-organisation-scope.md)
- Detail: A regular member cannot A workspace admin can publish a personal skill to everyone in the workspace as a plugin; a regular member cannot.
- Evidence: apps/web/app/api/skills/[name]/workspace/route.ts:31; apps/web/app/api/skills/[name]/workspace/route.ts:20

## CMP-WP194

**Skill list split into Personal, Shared with you and Organization**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F053-08](../../20-features/053-skill-creation-and-management/F053-08-project-and-organisation-scope.md)
- Detail: The skill list has no Personal, Shared and Organization sections Skills can be shared to a workspace and the slash menu groups your own skills, but the skill list has no Personal, Shared and Organization sections.
- Evidence: apps/web/app/api/skills/[name]/workspace/route.ts; apps/web/features/chat/components/Composer/SlashCommandMenu.tsx:92

## CMP-WP197

**Surface relevant connectors during a conversation (connector search)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F053-03](../../20-features/053-skill-creation-and-management/F053-03-using-a-skill-in-chat-manual-and-automatic.md)
- Detail: There is no in-conversation directory search switch A new-chat card suggests connectors; there is no in-conversation directory search switch.
- Evidence: apps/web/features/chat/components/NewChat/NewChatConnectorSuggestions.tsx:36; searched: connector search switch in features/settings

## CMP-X18

**Connectors entry in the + menu**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F053-03](../../20-features/053-skill-creation-and-management/F053-03-using-a-skill-in-chat-manual-and-automatic.md)
- Detail: Switched off: connector release state is coming soon (13 named connectors are released one by one); the menu row shows Coming soon.
- Evidence: apps/extension/src/side_panel.ts:14212-14224; packages/contracts/types/src/connector-release.ts:14,36

## GAP-AREA053-LW01

**Skill creation reuses the chat conversation rate limit, not a skills limit.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-053
- Detail: Area 53. Skill creation and management
- Evidence: apps/web/app/api/skills/route.ts:210

## GAP-AREA053-LW06

**Detail delete text says deletion cannot be recovered; this code does not show the confirmation step that AGENTS.md section 9 requires. The confirm call was not found in the file opened.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-053
- Detail: Area 53. Skill creation and management
- Evidence: packages/ui/ui/src/directory/SkillDetailView.tsx:44-45

## GAP-CAP-connectors-apps-and-extensions-15

**@ mention and proactive suggestion of connected apps: Suggestion cards for plugins missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F053-03](../../20-features/053-skill-creation-and-management/F053-03-using-a-skill-in-chat-manual-and-automatic.md)
- Requirement items: S53.17
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-connectors-apps-and-extensions-18

**Skills: create, upload, enable and delete: Edit-with-assistant, intro video, bundled script run and live reload missing; mobile upload missing; skill input parameters, tests, versions and cost estimate all missing in ledger.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F053-01](../../20-features/053-skill-creation-and-management/F053-01-skill-directory-and-installed-list.md), [F053-02](../../20-features/053-skill-creation-and-management/F053-02-skill-detail-page-and-requirements.md), [F053-04](../../20-features/053-skill-creation-and-management/F053-04-install-turn-on-and-off.md), [F053-05](../../20-features/053-skill-creation-and-management/F053-05-personal-skills-create-edit-delete.md), [F053-06](../../20-features/053-skill-creation-and-management/F053-06-upload-import-and-export.md), [F053-07](../../20-features/053-skill-creation-and-management/F053-07-bundled-files-and-scripts.md)
- Requirement items: S53.01, S53.02, S53.03, S53.07, S53.10, S53.11, S53.14, S53.20, S53.21, S53.22
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-connectors-apps-and-extensions-19

**Skill invocation: by name and automatic: Skill list context budget missing in CLI; Chrome manual invocation missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F053-03](../../20-features/053-skill-creation-and-management/F053-03-using-a-skill-in-chat-manual-and-automatic.md)
- Requirement items: S53.08, S53.17, S53.18
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-connectors-apps-and-extensions-20

**Create a skill from a conversation, recording or template: Screen-and-voice flow and replay configuration missing per ledger; desktop recorder partial.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F053-11](../../20-features/053-skill-creation-and-management/F053-11-recorded-skills-demonstration-and-voice-teaching.md)
- Requirement items: S53.27, S53.28, S53.29, S53.30
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-connectors-apps-and-extensions-21

**Share and publish skills to teammates: No Personal, Shared with you, Organization sections fully; no review states.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F053-08](../../20-features/053-skill-creation-and-management/F053-08-project-and-organisation-scope.md)
- Requirement items: S53.05, S53.25
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-F053-01-01

**CLI and VS Code cannot browse skills that are not already on the device or synced.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-01](../../20-features/053-skill-creation-and-management/F053-01-skill-directory-and-installed-list.md)
- Detail: Affects: CLI, VS Code users. Work needed: Add a catalogue command or view that reads GET /api/skills?catalog=all.
- Evidence: apps/cli/src/skills.rs:144-200; brief S53.01 marks both missing

## GAP-F053-01-02

**The brief lists Chrome as missing for the list, and docs/product/surface-feature-matrix.md:368-369 says VS Code and Chrome are absent, but code shows a Chrome Skills menu and a VS Code Skills quick pick.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-01](../../20-features/053-skill-creation-and-management/F053-01-skill-directory-and-installed-list.md)
- Detail: Affects: Documentation readers, parity tracking. Work needed: Correct the matrix data file and the brief.
- Evidence: apps/extension/src/side_panel.ts:15112-15190; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:220-315; doc: docs/product/surface-feature-matrix.md:368-369

## GAP-F053-01-03

**'Installed' means 'not switched off', so built-in skills never need installing; the brief's 'not yet installed' only covers skills switched off.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-01](../../20-features/053-skill-creation-and-management/F053-01-skill-directory-and-installed-list.md)
- Detail: Affects: Web, Desktop, Mobile users and testers. Work needed: Decide the product wording and align labels.
- Evidence: apps/web/lib/services/skill-catalog-service.ts:150-158; apps/web/app/api/skills/installs/__tests__/skill-installs.test.ts:200

## GAP-F053-01-04

**Chrome menu lists only non-built-in skills, so built-in skills cannot be picked there.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-01](../../20-features/053-skill-creation-and-management/F053-01-skill-directory-and-installed-list.md)
- Detail: Affects: Chrome users. Work needed: Decide whether built-in skills belong in the Chrome menu (web plus menu also hides them).
- Evidence: apps/extension/src/features/cloud-bridge/skillsClient.ts:45; apps/extension/src/side_panel.ts:15165-15167

## GAP-F053-01-05

**CLI on/off choices are stored on the device and are not the same as the account's install overrides.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-01](../../20-features/053-skill-creation-and-management/F053-01-skill-directory-and-installed-list.md)
- Detail: Affects: Developers who use both web and CLI. Work needed: Decide whether the CLI should read or write the account overrides.
- Evidence: apps/cli/src/skills.rs:95-141; apps/web/lib/services/skill-install-service.ts:89-120

## GAP-F053-01-NOTBUILT

**Skill directory and installed list: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F053-01](../../20-features/053-skill-creation-and-management/F053-01-skill-directory-and-installed-list.md)
- Requirement items: S53.01
- Detail: CLI: S53.01; VS Code: S53.01

## GAP-F053-02-01

**Mobile detail has no Source or Added rows.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-02](../../20-features/053-skill-creation-and-management/F053-02-skill-detail-page-and-requirements.md)
- Detail: Affects: Mobile users. Work needed: Add provenance rows from the summary origin.
- Evidence: apps/mobile/src/features/skills/SkillDetailScreen.tsx:215-228

## GAP-F053-02-02

**Personal skills cannot state needs or version, so their Needs section is always empty.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-02](../../20-features/053-skill-creation-and-management/F053-02-skill-detail-page-and-requirements.md)
- Detail: Affects: All apps for personal skills. Work needed: Store frontmatter requires and version for personal skills.
- Evidence: apps/web/lib/services/user-skill-service.ts:156-166

## GAP-F053-02-03

**The brief calls mobile detail missing for items 06 and 15, but the screen exists with Needs and Connect.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-02](../../20-features/053-skill-creation-and-management/F053-02-skill-detail-page-and-requirements.md)
- Detail: Affects: Documentation. Work needed: Correct the brief.
- Evidence: apps/mobile/src/features/skills/SkillDetailScreen.tsx:272-318

## GAP-F053-02-04

**CLI, VS Code and Chrome have no detail view with instructions, files and provenance.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-02](../../20-features/053-skill-creation-and-management/F053-02-skill-detail-page-and-requirements.md)
- Detail: Affects: CLI, VS Code, Chrome users. Work needed: Decide the per-surface detail design.
- Evidence: apps/cli/src/tui/tui_app.rs:6198-6212

## GAP-F053-02-05

**The built-in download endpoint has no UI caller.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-02](../../20-features/053-skill-creation-and-management/F053-02-skill-detail-page-and-requirements.md)
- Detail: Affects: Web. Work needed: Wire it to a visible control or remove it.
- Evidence: apps/web/app/api/skills/[name]/download/route.ts:26-37

## GAP-F053-02-06

**The detail 'Enable skill' switch shows for installed plugin skills, but the server refuses the change with 'controlled by its plugin installation'.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-02](../../20-features/053-skill-creation-and-management/F053-02-skill-detail-page-and-requirements.md)
- Detail: Affects: Web and Desktop users. Work needed: Hide the switch for plugin-owned skills.
- Evidence: packages/ui/ui/src/directory/SkillDetailView.tsx:204; apps/web/app/api/skills/installs/route.ts:77-79 [inferred]

## GAP-F053-02-NOTBUILT

**Skill detail page and requirements: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F053-02](../../20-features/053-skill-creation-and-management/F053-02-skill-detail-page-and-requirements.md)
- Requirement items: S53.06, S53.14, S53.15, S53.36
- Detail: Mobile: S53.06, S53.15; CLI: S53.06, S53.15, S53.36; VS Code: S53.06, S53.15, S53.36; Chrome: S53.06, S53.14, S53.15, S53.36

## GAP-F053-03-01

**Web does not enable code execution for a skill that needs it; mobile does.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-03](../../20-features/053-skill-creation-and-management/F053-03-using-a-skill-in-chat-manual-and-automatic.md)
- Detail: Affects: Web and Desktop users of skills with scripts. Work needed: Add the code-run tool to the web toggle map.
- Evidence: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:363-365, 3016-3031 versus apps/mobile/src/features/skills/skillRequirements.ts:23-40

## GAP-F053-03-02

**CLI scoring and mention code is unused, and the CLI skill tool has no read action for bundled files.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-03](../../20-features/053-skill-creation-and-management/F053-03-using-a-skill-in-chat-manual-and-automatic.md)
- Detail: Affects: CLI users. Work needed: Wire or remove the scorer; add a file read action.
- Evidence: apps/cli/src/skills.rs:20, 1074-1200, 1456-1458

## GAP-F053-03-03

**The workspace Skills switch is checked for the automatic offer but I found no check on an explicit pick.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-03](../../20-features/053-skill-creation-and-management/F053-03-using-a-skill-in-chat-manual-and-automatic.md)
- Detail: Affects: Workspaces that turned Skills off. Work needed: Confirm and, if needed, gate the explicit pick.
- Evidence: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5383-5440 [inferred]

## GAP-F053-03-04

**VS Code has no chat skill picker found; only slash text and the CLI path.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-03](../../20-features/053-skill-creation-and-management/F053-03-using-a-skill-in-chat-manual-and-automatic.md)
- Detail: Affects: VS Code users. Work needed: Add a picker or document the slash path.
- Evidence: apps/cli/src/app_server/surfaces.rs:1551-1569

## GAP-F053-03-05

**The brief's mention of 'a requirement note before send' is met only for tools in the slash list; connectors are caught by the server after send.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-03](../../20-features/053-skill-creation-and-management/F053-03-using-a-skill-in-chat-manual-and-automatic.md)
- Detail: Affects: Web users. Work needed: Show connector needs before send.
- Evidence: apps/web/features/chat/components/Composer/SlashCommandMenu.tsx:95-97; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5497

## GAP-F053-03-06

**The brief says mobile has no skill detail and that Chrome has no picker; both exist.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-03](../../20-features/053-skill-creation-and-management/F053-03-using-a-skill-in-chat-manual-and-automatic.md)
- Detail: Affects: Documentation. Work needed: Correct the brief and docs/product/surface-feature-matrix.md:368-369.
- Evidence: apps/mobile/src/features/skills/SkillDetailScreen.tsx; apps/extension/src/side_panel.ts:15112

## GAP-F053-03-NOTBUILT

**Using a skill in chat (manual and automatic): not built on VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F053-03](../../20-features/053-skill-creation-and-management/F053-03-using-a-skill-in-chat-manual-and-automatic.md)
- Requirement items: S53.08, S53.17
- Detail: VS Code: S53.08; Chrome: S53.08, S53.17

## GAP-F053-04-01

**Brief marks mobile enable/disable as missing, but mobile has Install, Uninstall and the 'Turned on' switch.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-04](../../20-features/053-skill-creation-and-management/F053-04-install-turn-on-and-off.md)
- Detail: Affects: Documentation. Work needed: Correct the brief.
- Evidence: apps/mobile/src/features/skills/SkillsScreen.tsx:365-372; apps/mobile/src/features/skills/SkillDetailScreen.tsx:259-267

## GAP-F053-04-02

**Uninstall has no workspace Skills gate while install has.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-04](../../20-features/053-skill-creation-and-management/F053-04-install-turn-on-and-off.md)
- Detail: Affects: Workspaces that turn Skills off. Work needed: Decide the intended rule and apply it to both.
- Evidence: apps/web/app/api/skills/installs/route.ts:64-70; apps/web/app/api/skills/installs/[name]/route.ts:25-62

## GAP-F053-04-03

**CLI and VS Code choices are device-only and differ from account overrides.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-04](../../20-features/053-skill-creation-and-management/F053-04-install-turn-on-and-off.md)
- Detail: Affects: Developers on several devices. Work needed: Decide whether to sync the choice.
- Evidence: apps/cli/src/skills.rs:95-141

## GAP-F053-04-04

**Detail switch can appear for plugin skills that cannot be switched here.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-04](../../20-features/053-skill-creation-and-management/F053-04-install-turn-on-and-off.md)
- Detail: Affects: Web and Desktop. Work needed: Pass the plugin-owned state to the view.
- Evidence: packages/ui/ui/src/directory/SkillDetailView.tsx:203-204

## GAP-F053-04-05

**No Chrome control to switch a skill.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-04](../../20-features/053-skill-creation-and-management/F053-04-install-turn-on-and-off.md)
- Detail: Affects: Chrome users. Work needed: Decide whether Chrome needs one; Manage skills opens the web settings.
- Evidence: apps/extension/src/side_panel.ts:15112-15190 (only pick and Manage skills)

## GAP-F053-04-NOTBUILT

**Install, turn on and off: not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F053-04](../../20-features/053-skill-creation-and-management/F053-04-install-turn-on-and-off.md)
- Requirement items: S53.20
- Detail: Chrome: S53.20

## GAP-F053-05-01

**Personal skills cannot carry needs, version or other frontmatter.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-05](../../20-features/053-skill-creation-and-management/F053-05-personal-skills-create-edit-delete.md)
- Detail: Affects: Web, mobile, desktop. Work needed: Store and return frontmatter fields.
- Evidence: apps/web/lib/services/user-skill-service.ts:156-166

## GAP-F053-05-02

**PUT and DELETE skip the workspace Skills gate.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-05](../../20-features/053-skill-creation-and-management/F053-05-personal-skills-create-edit-delete.md)
- Detail: Affects: Workspaces with Skills off. Work needed: Apply the same gate or record why not.
- Evidence: apps/web/app/api/skills/[name]/route.ts:50-105

## GAP-F053-05-03

**Brief says mobile instruction editor and personal skills are missing or partial; mobile has create, edit, delete and template.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-05](../../20-features/053-skill-creation-and-management/F053-05-personal-skills-create-edit-delete.md)
- Detail: Affects: Documentation. Work needed: Correct the brief.
- Evidence: apps/mobile/src/features/skills/NewSkillSheet.tsx:55-67; apps/mobile/src/features/skills/SkillDetailScreen.tsx:378-398

## GAP-F053-05-04

**The brief lists organisation sharing as missing, but a share-with-workspace route and button exist for admins.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-05](../../20-features/053-skill-creation-and-management/F053-05-personal-skills-create-edit-delete.md)
- Detail: Affects: Documentation. Work needed: Correct the brief; that item belongs to another feature.
- Evidence: apps/web/app/api/skills/[name]/workspace/route.ts:17-60; apps/web/features/skills/components/SkillEditorDialog.tsx:266

## GAP-F053-05-05

**VS Code and the CLI create project skills too, which need a one-time allow before they load; a personal CLI skill needs hand editing or a model turn.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-05](../../20-features/053-skill-creation-and-management/F053-05-personal-skills-create-edit-delete.md)
- Detail: Affects: CLI, VS Code. Work needed: None required; document the allow step.
- Evidence: apps/cli/src/skills.rs:285-560; apps/extension-vscode/src/features/surfaces/skillAuthoring.ts:44-52

## GAP-F053-05-06

**Permanent delete has no recovery window.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-05](../../20-features/053-skill-creation-and-management/F053-05-personal-skills-create-edit-delete.md)
- Detail: Affects: All personal skill owners. Work needed: Decide whether a trash step is needed (the confirm names the loss).
- Evidence: apps/web/app/api/skills/[name]/route.ts:95; packages/ui/ui/src/directory/constants.ts:360

## GAP-F053-05-NOTBUILT

**Personal skills (create, edit, delete): not built on Mobile, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, VS Code, Chrome
- Features: [F053-05](../../20-features/053-skill-creation-and-management/F053-05-personal-skills-create-edit-delete.md)
- Requirement items: S53.03, S53.09
- Detail: Mobile: S53.09; VS Code: S53.09; Chrome: S53.03, S53.09

## GAP-F053-05-PARTLY

**Personal skills (create, edit, delete): partly built on Mobile**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F053-05](../../20-features/053-skill-creation-and-management/F053-05-personal-skills-create-edit-delete.md)
- Requirement items: S53.03
- Detail: Mobile S53.03: mobile New skill is built (POST /api/skills, shown when canAuthorSkills)

## GAP-F053-06-01

**No whole-skill export on any app; only single-file download and a copy button.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-06](../../20-features/053-skill-creation-and-management/F053-06-upload-import-and-export.md)
- Detail: Affects: All apps. Work needed: Add a zip export that the upload accepts.
- Evidence: packages/ui/ui/src/directory/SkillFileViewer.tsx:179-242; apps/web/lib/services/user-skill-service.ts:187-191

## GAP-F053-06-02

**Brief says scripts and over-size files are left out at upload; code leaves out only non-text files, and size limits apply at read and staging time.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-06](../../20-features/053-skill-creation-and-management/F053-06-upload-import-and-export.md)
- Detail: Affects: Documentation and testers. Work needed: Correct the brief wording.
- Evidence: apps/web/features/plugins/server/directory/archive.ts:300-338; apps/web/lib/services/user-skill-service.ts:381-388

## GAP-F053-06-03

**Brief says mobile import is missing, but mobile has Import with a document picker.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-06](../../20-features/053-skill-creation-and-management/F053-06-upload-import-and-export.md)
- Detail: Affects: Documentation. Work needed: Correct the brief.
- Evidence: apps/mobile/src/features/skills/SkillsScreen.tsx:716-738

## GAP-F053-06-04

**Mobile lacks the scan-acknowledge step and the omitted-files notice.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-06](../../20-features/053-skill-creation-and-management/F053-06-upload-import-and-export.md)
- Detail: Affects: Mobile users importing packages. Work needed: Reuse the web handling of scan_review_required and omittedFiles.
- Evidence: apps/mobile/src/features/skills/service.ts:208-240

## GAP-F053-06-05

**CLI import takes no zip; VS Code import is a folder only; the brief marks VS Code import missing though 'Install a skill' exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-06](../../20-features/053-skill-creation-and-management/F053-06-upload-import-and-export.md)
- Detail: Affects: CLI, VS Code. Work needed: Accept a zip; correct the brief.
- Evidence: apps/cli/src/skills.rs:1498-1560; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:200-210

## GAP-F053-06-06

**GET /api/skills/{name}/download has no caller.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-06](../../20-features/053-skill-creation-and-management/F053-06-upload-import-and-export.md)
- Detail: Affects: Web. Work needed: Wire to a UI control or remove.
- Evidence: apps/web/app/api/skills/[name]/download/route.ts:26-37

## GAP-F053-06-07

**Personal-skill 'Download file' for text files is not offered (only for non-previewable files).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-06](../../20-features/053-skill-creation-and-management/F053-06-upload-import-and-export.md)
- Detail: Affects: Web, Desktop. Work needed: Offer download for every file.
- Evidence: packages/ui/ui/src/directory/SkillFileViewer.tsx:179-192

## GAP-F053-06-NOTBUILT

**Upload, import and export: not built on CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, Chrome
- Features: [F053-06](../../20-features/053-skill-creation-and-management/F053-06-upload-import-and-export.md)
- Requirement items: S53.21, S53.22
- Detail: CLI: S53.22; Chrome: S53.21, S53.22

## GAP-F053-07-01

**A skill's files cannot be changed after creation.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-07](../../20-features/053-skill-creation-and-management/F053-07-bundled-files-and-scripts.md)
- Detail: Affects: Web, Desktop, Mobile authors. Work needed: Add file add/replace/remove to the edit flow and PUT route.
- Evidence: apps/web/lib/services/user-skill-service.ts:295-318 (update touches name, description, body only)

## GAP-F053-07-02

**Sandbox note claims files were copied even if a write failed or the sandbox never opens.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-07](../../20-features/053-skill-creation-and-management/F053-07-bundled-files-and-scripts.md)
- Detail: Affects: Web, Desktop, Mobile users running scripts. Work needed: Report per-file results back to the model or log to the person.
- Evidence: apps/web/lib/e2b/skill-staging.ts:72-96, 98-118

## GAP-F053-07-03

**Read limit (512 KiB) is larger than the tool output cap (100000 bytes).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-07](../../20-features/053-skill-creation-and-management/F053-07-bundled-files-and-scripts.md)
- Detail: Affects: All cloud users with large reference files. Work needed: Align limits or chunk reads.
- Evidence: apps/web/features/plugins/server/directory/constants.ts:138; packages/tools/skills/src/tool.ts:4, 238-251

## GAP-F053-07-04

**No mobile or Chrome handling of bundled files beyond display (mobile) or none (Chrome).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-07](../../20-features/053-skill-creation-and-management/F053-07-bundled-files-and-scripts.md)
- Detail: Affects: Mobile, Chrome. Work needed: Decide parity target; add file list and requirement display to Chrome.
- Evidence: brief S53.10, S53.11; apps/extension/src/features/cloud-bridge/skillsClient.ts

## GAP-F053-07-05

**CLI has no sandbox and no read action; scripts run with the model's shell tool.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-07](../../20-features/053-skill-creation-and-management/F053-07-bundled-files-and-scripts.md)
- Detail: Affects: CLI and VS Code. Work needed: Document or add a contained read action.
- Evidence: apps/cli/src/skills.rs:1459-1463

## GAP-F053-07-06

**Mobile 'Use as a template' copies only the body, dropping bundled files.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-07](../../20-features/053-skill-creation-and-management/F053-07-bundled-files-and-scripts.md)
- Detail: Affects: Mobile. Work needed: Copy files with the template or say they are not copied.
- Evidence: apps/mobile/src/features/skills/SkillDetailScreen.tsx:105-107

## GAP-F053-07-07

**Whether skill files work in Local (on-device model) chats is not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-07](../../20-features/053-skill-creation-and-management/F053-07-bundled-files-and-scripts.md)
- Detail: Affects: Desktop and Mobile local inference users. Work needed: Trace the local chat paths and decide the required behaviour.
- Evidence: No skill tool code found outside the cloud route and CLI

## GAP-F053-07-NOTBUILT

**Bundled files and scripts: not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F053-07](../../20-features/053-skill-creation-and-management/F053-07-bundled-files-and-scripts.md)
- Requirement items: S53.10, S53.11
- Detail: Chrome: S53.10, S53.11

## GAP-F053-08-01

**The brief marks organisation skills and sharing missing on all apps, but the web code can share a skill with a workspace and publish workspace plugins; the brief and surface matrix are out of date for web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-08](../../20-features/053-skill-creation-and-management/F053-08-project-and-organisation-scope.md)
- Detail: Affects: Web, Desktop (hosted web). Work needed: Update the brief and acceptance tests; decide the correct status.
- Evidence: apps/web/app/api/skills/[name]/workspace/route.ts:22-61; brief S53.05, S53.25

## GAP-F053-08-02

**No project-scoped skills on web, desktop or mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-08](../../20-features/053-skill-creation-and-management/F053-08-project-and-organisation-scope.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Design attachment of a skill to a Project and loading rules.
- Evidence: brief S53.04; no project column in skill code

## GAP-F053-08-03

**Mobile and Chrome cannot share or scope a skill.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-08](../../20-features/053-skill-creation-and-management/F053-08-project-and-organisation-scope.md)
- Detail: Affects: Mobile, Chrome. Work needed: Decide parity target.
- Evidence: apps/mobile/src/features/skills; apps/extension/src/features/cloud-bridge/skillsClient.ts

## GAP-F053-08-04

**Share control publishes as 'available' only and members must add it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-08](../../20-features/053-skill-creation-and-management/F053-08-project-and-organisation-scope.md)
- Detail: Affects: Workspace admins. Work needed: Offer a stronger preference at share time or document the other screen.
- Evidence: apps/web/app/api/skills/[name]/workspace/route.ts:41

## GAP-F053-08-05

**CLI and VS Code have no organisation skills.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-08](../../20-features/053-skill-creation-and-management/F053-08-project-and-organisation-scope.md)
- Detail: Affects: CLI, VS Code. Work needed: Sync workspace plugin skills to the CLI like account skills.
- Evidence: brief S53.05, S53.25

## GAP-F053-08-NOTBUILT

**Project and organisation scope: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F053-08](../../20-features/053-skill-creation-and-management/F053-08-project-and-organisation-scope.md)
- Requirement items: S53.04, S53.05, S53.25
- Detail: Mobile: S53.04, S53.05, S53.25; CLI: S53.05, S53.25; VS Code: S53.05, S53.25; Chrome: S53.04, S53.05, S53.25

## GAP-F053-09-01

**No input, output or surface declaration exists on any app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-09](../../20-features/053-skill-creation-and-management/F053-09-input-and-output-declarations-and-surfaces.md)
- Detail: Affects: All six apps. Work needed: Define the frontmatter fields, extend the contract and parsers, show them in shared UI, add tests.
- Evidence: brief S53.12, S53.13, S53.16; apps/cli/src/skills.rs:940-1030; packages/tools/skills/src/validation.ts:8-33

## GAP-F053-09-02

**Frontmatter keys compatibility, metadata and argument-hint are accepted but not used for these purposes.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-09](../../20-features/053-skill-creation-and-management/F053-09-input-and-output-declarations-and-surfaces.md)
- Detail: Affects: Web authors. Work needed: Decide whether to map them to the new fields.
- Evidence: packages/tools/skills/src/validation.ts:8-33; apps/cli/src/custom_commands.rs:325

## GAP-F053-09-NOTBUILT

**Input and output declarations and surfaces: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F053-09](../../20-features/053-skill-creation-and-management/F053-09-input-and-output-declarations-and-surfaces.md)
- Requirement items: S53.12, S53.13, S53.16
- Detail: Web: S53.12, S53.13, S53.16; Desktop: S53.12, S53.13, S53.16; Mobile: S53.12, S53.13, S53.16; CLI: S53.12, S53.13, S53.16; VS Code: S53.12, S53.13, S53.16; Chrome: S53.12, S53.13, S53.16

## GAP-F053-10-01

**No skill composition support or declaration.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-10](../../20-features/053-skill-creation-and-management/F053-10-skill-composition-and-versions.md)
- Detail: Affects: All apps. Work needed: Define how a skill names dependencies and how loading is limited (loops, depth).
- Evidence: brief S53.19

## GAP-F053-10-02

**No version selection or version history.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-10](../../20-features/053-skill-creation-and-management/F053-10-skill-composition-and-versions.md)
- Detail: Affects: All apps. Work needed: Design version storage and a picker.
- Evidence: brief S53.23; no version column in the user_skills table (apps/web/lib/services/user-skill-service.ts:273-280)

## GAP-F053-10-03

**No update notification.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-10](../../20-features/053-skill-creation-and-management/F053-10-skill-composition-and-versions.md)
- Detail: Affects: All apps. Work needed: Compare installed and source hashes, add a notice.
- Evidence: brief S53.24; search for update-available code found none

## GAP-F053-10-04

**Duplication is mobile-only and text-only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-10](../../20-features/053-skill-creation-and-management/F053-10-skill-composition-and-versions.md)
- Detail: Affects: Web, Desktop, CLI, VS Code, Chrome; Mobile loses files. Work needed: Add a duplicate action to the shared skill detail and copy files.
- Evidence: apps/mobile/src/features/skills/SkillDetailScreen.tsx:105-107

## GAP-F053-10-05

**Brief lists mobile as missing S53.26 but a template action exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-10](../../20-features/053-skill-creation-and-management/F053-10-skill-composition-and-versions.md)
- Detail: Affects: Documentation. Work needed: Update brief.
- Evidence: apps/mobile/src/features/skills/SkillDetailScreen.tsx:396-400

## GAP-F053-10-NOTBUILT

**Skill composition and versions: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F053-10](../../20-features/053-skill-creation-and-management/F053-10-skill-composition-and-versions.md)
- Requirement items: S53.19, S53.23, S53.24, S53.26
- Detail: CLI: S53.19, S53.23, S53.24, S53.26; VS Code: S53.19, S53.23, S53.24, S53.26; Chrome: S53.19, S53.23, S53.24, S53.26

## GAP-F053-11-01

**No voice or narration capture.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-11](../../20-features/053-skill-creation-and-management/F053-11-recorded-skills-demonstration-and-voice-teaching.md)
- Detail: Affects: All apps. Work needed: Add an audio channel, consent and drafting use.
- Evidence: brief S53.28; packages/contracts/local-runtime/src/skill-capture.ts:17

## GAP-F053-11-02

**No replay settings; recording is not a replayable script.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-11](../../20-features/053-skill-creation-and-management/F053-11-recorded-skills-demonstration-and-voice-teaching.md)
- Detail: Affects: All apps. Work needed: Define what a recorded skill stores and how it replays.
- Evidence: brief S53.29

## GAP-F053-11-03

**No example or template generation UI beyond save-as-skill and skill-creator.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-11](../../20-features/053-skill-creation-and-management/F053-11-recorded-skills-demonstration-and-voice-teaching.md)
- Detail: Affects: All apps. Work needed: Add a guided creation flow.
- Evidence: brief S53.30

## GAP-F053-11-04

**Brief says web and desktop are missing for S53.27 but the desktop recorder exists; brief and the earlier draft that said macOS only are out of date (Windows is supported).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-11](../../20-features/053-skill-creation-and-management/F053-11-recorded-skills-demonstration-and-voice-teaching.md)
- Detail: Affects: Documentation. Work needed: Update the brief.
- Evidence: apps/desktop/electron/runtime/skillCapture.ts:31

## GAP-F053-11-05

**Recorder available only in the Electron desktop host; not on mobile, CLI, VS Code, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-11](../../20-features/053-skill-creation-and-management/F053-11-recorded-skills-demonstration-and-voice-teaching.md)
- Detail: Affects: Those apps. Work needed: Decide parity target.
- Evidence: apps/web/features/skill-recorder/lib/skill-capture-client.ts:19

## GAP-F053-11-06

**CLI learner treats every session as successful.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-11](../../20-features/053-skill-creation-and-management/F053-11-recorded-skills-demonstration-and-voice-teaching.md)
- Detail: Affects: CLI. Work needed: Pass a real outcome.
- Evidence: apps/cli/src/agent/chat.rs:1575-1580

## GAP-F053-11-NOTBUILT

**Recorded skills (demonstration and voice teaching): not built on Mobile, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, VS Code, Chrome
- Features: [F053-11](../../20-features/053-skill-creation-and-management/F053-11-recorded-skills-demonstration-and-voice-teaching.md)
- Requirement items: S53.27, S53.28, S53.29, S53.30
- Detail: Mobile: S53.27, S53.28, S53.29, S53.30; VS Code: S53.27, S53.28, S53.29, S53.30; Chrome: S53.27, S53.28, S53.29, S53.30

## GAP-F053-12-01

**No test cases or test results.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-12](../../20-features/053-skill-creation-and-management/F053-12-testing-results-and-measurement.md)
- Detail: Affects: All six apps. Work needed: Define a test-case format, a runner and a results screen.
- Evidence: brief S53.31, S53.32

## GAP-F053-12-02

**No with-versus-without comparison.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-12](../../20-features/053-skill-creation-and-management/F053-12-testing-results-and-measurement.md)
- Detail: Affects: All six apps. Work needed: Run the same prompt twice with the skill tool withheld the second time and show both.
- Evidence: brief S53.33

## GAP-F053-12-03

**No cost estimate.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-12](../../20-features/053-skill-creation-and-management/F053-12-testing-results-and-measurement.md)
- Detail: Affects: All six apps. Work needed: Estimate from the model catalog and routing rules.
- Evidence: brief S53.34

## GAP-F053-12-04

**No usage or success history; install total is only a count of installs.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F053-12](../../20-features/053-skill-creation-and-management/F053-12-testing-results-and-measurement.md)
- Detail: Affects: All six apps. Work needed: Record skill loads and outcomes and show them.
- Evidence: brief S53.35; packages/contracts/cloud-contracts/src/skills.ts:70-77

## GAP-F053-12-NOTBUILT

**Testing, results and measurement: not built on Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F053-12](../../20-features/053-skill-creation-and-management/F053-12-testing-results-and-measurement.md)
- Requirement items: S53.31, S53.32, S53.33, S53.34, S53.35
- Detail: Desktop: S53.31, S53.32, S53.33, S53.34, S53.35; Mobile: S53.31, S53.32, S53.33, S53.34, S53.35; CLI: S53.31, S53.32, S53.33, S53.34, S53.35; VS Code: S53.31, S53.32, S53.33, S53.34, S53.35; Chrome: S53.31, S53.32, S53.33, S53.34, S53.35
