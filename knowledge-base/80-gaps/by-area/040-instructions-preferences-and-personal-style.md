---
id: "GAPS-AREA-040"
type: "gap-list"
title: "Gaps: Instructions, preferences, and personal style"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 40. Instructions, preferences, and personal style

88 open gaps that touch this area. Area page: [20-features/040-instructions-preferences-and-personal-style](../../20-features/040-instructions-preferences-and-personal-style/README.md).

## CMP-C407

**Organization-wide instructions pushed by admins**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F040-11](../../20-features/040-instructions-preferences-and-personal-style/F040-11-see-and-import-effective-instructions.md)
- Detail: The managed policy file carries no instruction text.
- Evidence: apps/cli/src/platform/policy/managed.rs:18

## CMP-C408

**Personal project instructions file (CLAUDE.local.md)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F040-11](../../20-features/040-instructions-preferences-and-personal-style/F040-11-see-and-import-effective-instructions.md)
- Detail: Only AGENTS.md, CLAUDE.md and the project instruction file are read; no local-only variant.
- Evidence: apps/cli/src/compaction.rs:23

## CMP-C655

**Managed CLAUDE.md-style org instructions file**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F040-11](../../20-features/040-instructions-preferences-and-personal-style/F040-11-see-and-import-effective-instructions.md)
- Detail: No org-level instructions file is read from the managed path; project AGENTS.md and per-user memory only.
- Evidence: apps/cli/src/features/hooks/managed.rs:175 (only managed-settings.json); searched: managed claude.md in apps/cli/src

## CMP-CP206

**Custom output style files**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F040-02](../../20-features/040-instructions-preferences-and-personal-style/F040-02-response-style-presets-per-chat.md), [F040-09](../../20-features/040-instructions-preferences-and-personal-style/F040-09-custom-output-styles.md)
- Detail: No project or managed styles Markdown styles load from the user folder only and /output-style can create one; no project or managed styles.
- Evidence: apps/cli/src/output_styles.rs:108

## CMP-CP330

**Project-level custom output style files**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F040-02](../../20-features/040-instructions-preferences-and-personal-style/F040-02-response-style-presets-per-chat.md), [F040-09](../../20-features/040-instructions-preferences-and-personal-style/F040-09-custom-output-styles.md)
- Detail: Ours reads custom styles only from the user's home folder, not from a folder inside the project Ours reads custom styles only from the user's home folder, not from a folder inside the project.
- Evidence: apps/cli/src/output_styles.rs:276

## CMP-CP91

**/init drafts project instructions from the repository**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F023-05](../../20-features/023-project-workspace/F023-05-local-folders-and-coding-sessions.md), [F040-11](../../20-features/040-instructions-preferences-and-personal-style/F040-11-see-and-import-effective-instructions.md)
- Detail: The agent does not read the repo to fill it /init writes a fixed AGENTS.md template with blank sections; the agent does not read the repo to fill it.
- Evidence: apps/cli/src/repl/registry.rs:2181-2203

## CMP-CP92

**/init writes project instructions from the repo**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F040-11](../../20-features/040-instructions-preferences-and-personal-style/F040-11-see-and-import-effective-instructions.md)
- Detail: /init writes a blank AGENTS.md template and does not read the project /init writes a blank AGENTS.md template and does not read the project.
- Evidence: apps/cli/src/repl/registry.rs:2181

## CMP-D54

**/init creates an AGENTS.md for the project**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F040-11](../../20-features/040-instructions-preferences-and-personal-style/F040-11-see-and-import-effective-instructions.md)
- Detail: Only /review and /security-review are goal commands; no /init.
- Evidence: packages/contracts/types/src/cloud-code.ts:334

## CMP-DP123

**Output style for coding sessions (explanatory, learning, custom)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F040-02](../../20-features/040-instructions-preferences-and-personal-style/F040-02-response-style-presets-per-chat.md), [F040-09](../../20-features/040-instructions-preferences-and-personal-style/F040-09-custom-output-styles.md)
- Detail: Code sessions have no output style setting Chat has a response style choice (concise, formal, explanatory, normal); Code sessions have no output style setting.
- Evidence: apps/web/features/chat/pages/WebChatPage.tsx:488; apps/web/features/chat/stores/style-store.ts; searched: outputStyle, output style, output_style in apps/web/features, apps/web/lib, apps/desktop/electron, packages/contracts/types/src (only the chat hint)

## CMP-DP82

**Project instructions files layered by folder (AGENTS.md, nearest wins)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F023-05](../../20-features/023-project-workspace/F023-05-local-folders-and-coding-sessions.md), [F040-11](../../20-features/040-instructions-preferences-and-personal-style/F040-11-see-and-import-effective-instructions.md)
- Detail: A cloud Code session does not read layered instruction files from the repository Projects and chats carry instructions, but a cloud Code session does not read layered instruction files from the repository.
- Evidence: apps/web/features/chat/components/dialogs/ConversationInstructionsDialog.tsx; searched: AGENTS.md in apps/web/features/code

## CMP-V68

**Output styles**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F040-02](../../20-features/040-instructions-preferences-and-personal-style/F040-02-response-style-presets-per-chat.md), [F040-09](../../20-features/040-instructions-preferences-and-personal-style/F040-09-custom-output-styles.md)
- Detail: No output-style picker.
- Evidence: searched: outputStyle, output style in apps/extension-vscode/src

## CMP-V82

**Output styles menu in the slash menu**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F040-02](../../20-features/040-instructions-preferences-and-personal-style/F040-02-response-style-presets-per-chat.md), [F040-09](../../20-features/040-instructions-preferences-and-personal-style/F040-09-custom-output-styles.md)
- Detail: The panel does not list /output-style. The slash list keeps only CLI commands flagged prompt or runnable (apps/extension-vscode/src/features/surfaces/surfaceMenu.ts:272-275) and output-style is neither (apps/cli/src/app_server/surfaces.rs:41,1500-1516); a typed unknown command gets a 'runs only in t
- Evidence: apps/cli/src/output_styles.rs; apps/cli/src/app_server/surfaces.rs:41 RUNNABLE_COMMANDS

## CMP-W284

**Reference my writing style and record history**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F040-08](../../20-features/040-instructions-preferences-and-personal-style/F040-08-learn-style-from-writing-samples.md), [F094-10](../../20-features/094-memory-and-personalization-components/F094-10-agent-specific-memory-and-writing-style-profile-no.md)
- Detail: No writing-style capture or record-history setting.
- Evidence: searched: writing style, record history in apps/web features, lib

## CMP-WP207

**Global instructions for every chat**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F040-05](../../20-features/040-instructions-preferences-and-personal-style/F040-05-standing-custom-instructions-and-project-instructi.md)
- Detail: Instructions for AGI is one box of 2,000 characters on every plan with an on/off switch Instructions for AGI is one box of 2,000 characters on every plan with an on/off switch.
- Evidence: apps/web/features/settings/sections/PersonalizationSection.tsx:74; apps/web/features/settings/sections/PersonalizationSection.tsx:492

## CMP-WP209

**Base style presets for tone**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F040-02](../../20-features/040-instructions-preferences-and-personal-style/F040-02-response-style-presets-per-chat.md), [F040-03](../../20-features/040-instructions-preferences-and-personal-style/F040-03-fine-tune-replies-warmth-enthusiasm-formality-leng.md), [F040-04](../../20-features/040-instructions-preferences-and-personal-style/F040-04-language-preference.md), [F040-07](../../20-features/040-instructions-preferences-and-personal-style/F040-07-per-conversation-override.md)
- Detail: Response style offers Default, Concise, Explanatory, Learning and Formal, plus length, technical level, formatting and… Response style offers Default, Concise, Explanatory, Learning and Formal, plus length, technical level, formatting and language.
- Evidence: apps/web/features/settings/sections/PersonalizationSection.tsx:39; apps/web/features/settings/sections/PersonalizationSection.tsx:405

## CMP-WP210

**Custom instructions length differs by plan**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F040-05](../../20-features/040-instructions-preferences-and-personal-style/F040-05-standing-custom-instructions-and-project-instructi.md)
- Detail: Instructions take 2,000 characters on every plan, and About you takes 1,500 Instructions take 2,000 characters on every plan, and About you takes 1,500.
- Evidence: apps/web/features/settings/sections/PersonalizationSection.tsx:73-74

## GAP-CAP-memory-and-personalization-08

**Project-scoped memory: The ledger and the comparison disagree for mobile. VS Code and Chrome have no project memory.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F039-08](../../20-features/039-memory-product/F039-08-project-scoped-and-agent-scoped-memory.md), [F040-05](../../20-features/040-instructions-preferences-and-personal-style/F040-05-standing-custom-instructions-and-project-instructi.md), [F094-05](../../20-features/094-memory-and-personalization-components/F094-05-use-memories-in-replies-retrieval-ranking-scope.md)
- Requirement items: S39.24, S40.30, S94.13
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-memory-and-personalization-18

**Global custom instructions: Limit is a code constant, not read from plan config (AGENTS.md section 4). Mobile length-by-plan is missing (M162).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F040-05](../../20-features/040-instructions-preferences-and-personal-style/F040-05-standing-custom-instructions-and-project-instructi.md)
- Requirement items: S40.16
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-memory-and-personalization-19

**Project instructions: No Chrome project instructions; selective sharing missing off web and desktop.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F040-05](../../20-features/040-instructions-preferences-and-personal-style/F040-05-standing-custom-instructions-and-project-instructi.md)
- Requirement items: S40.17, S40.30
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-memory-and-personalization-21

**Base style, tone presets and trait sliders: Style reset missing on VS Code and Chrome. Goals and interests (S40.04) and units and formatting (S40.15) are missing on all six apps.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F040-02](../../20-features/040-instructions-preferences-and-personal-style/F040-02-response-style-presets-per-chat.md), [F040-03](../../20-features/040-instructions-preferences-and-personal-style/F040-03-fine-tune-replies-warmth-enthusiasm-formality-leng.md), [F040-04](../../20-features/040-instructions-preferences-and-personal-style/F040-04-language-preference.md), [F040-07](../../20-features/040-instructions-preferences-and-personal-style/F040-07-per-conversation-override.md)
- Requirement items: S40.05, S40.06, S40.07, S40.08, S40.09, S40.10, S40.11, S40.12, S40.13, S40.14, S40.19, S40.23, S40.26
- Detail: Claude unknown, ChatGPT yes; AGI built

## GAP-CAP-memory-and-personalization-22

**Custom and learned writing style: No connected-source learning, no summary, none on mobile, CLI, VS Code or Chrome.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F040-08](../../20-features/040-instructions-preferences-and-personal-style/F040-08-learn-style-from-writing-samples.md), [F094-10](../../20-features/094-memory-and-personalization-components/F094-10-agent-specific-memory-and-writing-style-profile-no.md)
- Requirement items: S40.20, S40.21, S40.22, S94.16
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-memory-and-personalization-23

**Instruction files for coding agents: Missing local personal file, org-managed file and load hook on CLI; desktop /init; web and mobile show no effective-instructions view (S40.28).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F040-11](../../20-features/040-instructions-preferences-and-personal-style/F040-11-see-and-import-effective-instructions.md)
- Requirement items: S40.28
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-memory-and-personalization-25

**Output styles for coding sessions: VS Code has no output styles menu; custom style creation missing on mobile, VS Code and Chrome.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F040-02](../../20-features/040-instructions-preferences-and-personal-style/F040-02-response-style-presets-per-chat.md), [F040-09](../../20-features/040-instructions-preferences-and-personal-style/F040-09-custom-output-styles.md)
- Requirement items: S40.24, S40.25, S40.27
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-F040-01-01

**The brief says Chrome has this done, but no Chrome screen exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-01](../../20-features/040-instructions-preferences-and-personal-style/F040-01-about-you-name-background-role.md)
- Detail: Affects: Chrome users. Work needed: Decide whether Chrome edits it or links to Web; correct the brief status.
- Evidence: search of apps/extension found only capabilityDocument.ts:28-49 reading preferredName for a greeting opt-out

## GAP-F040-01-02

**Mobile Local-mode block lacks the non-authority wording and uses a different phrasing than the server.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-01](../../20-features/040-instructions-preferences-and-personal-style/F040-01-about-you-name-background-role.md)
- Detail: Affects: Mobile Local users. Work needed: Share one formatter in a shared package.
- Evidence: personalization.ts:17-34 versus user-identity.ts:176-178

## GAP-F040-01-03

**Draft/brief line references to GeneralSection.tsx are out of date; the screen is PersonalizationSection.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-01](../../20-features/040-instructions-preferences-and-personal-style/F040-01-about-you-name-background-role.md)
- Detail: Affects: Engineers and testers. Work needed: Update the brief.
- Evidence: PersonalizationSection.tsx:29,525-602; GeneralSection.tsx has no personalization fields (search)

## GAP-F040-01-04

**Goals and interests field does not exist.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-01](../../20-features/040-instructions-preferences-and-personal-style/F040-01-about-you-name-background-role.md)
- Detail: Affects: All apps. Work needed: Add a field or document that About you covers it.
- Evidence: brief S40.04 missing

## GAP-F040-01-05

**VS Code has no About you item.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-01](../../20-features/040-instructions-preferences-and-personal-style/F040-01-about-you-name-background-role.md)
- Detail: Affects: VS Code users. Work needed: Add an input box for aboutYou.
- Evidence: personalization.ts:131-142

## GAP-F040-01-NOTBUILT

**About you (name, background, role): not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F040-01](../../20-features/040-instructions-preferences-and-personal-style/F040-01-about-you-name-background-role.md)
- Requirement items: S40.01, S40.02, S40.03
- Detail: Chrome: S40.01, S40.02, S40.03

## GAP-F040-02-01

**Brief says Mobile lacks the Learning preset; code has it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-02](../../20-features/040-instructions-preferences-and-personal-style/F040-02-response-style-presets-per-chat.md)
- Detail: Affects: Testers using the brief. Work needed: Correct the brief S40.25 status.
- Evidence: apps/mobile/src/features/chat/components/StyleSelector.tsx:21

## GAP-F040-02-02

**Brief says VS Code and Chrome have the Explanatory and Concise styles and the Style reset; only VS Code's account Style item was found, with no reset.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-02](../../20-features/040-instructions-preferences-and-personal-style/F040-02-response-style-presets-per-chat.md)
- Detail: Affects: VS Code, Chrome. Work needed: Add a reset item or correct the brief.
- Evidence: personalization.ts:144-157; no reset item

## GAP-F040-02-03

**No formal style among CLI output styles.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-02](../../20-features/040-instructions-preferences-and-personal-style/F040-02-response-style-presets-per-chat.md)
- Detail: Affects: CLI users. Work needed: Decide parity with the shared five presets.
- Evidence: output_styles.rs:96-105

## GAP-F040-02-04

**CLI style delete is permanent without Trash.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-02](../../20-features/040-instructions-preferences-and-personal-style/F040-02-response-style-presets-per-chat.md)
- Detail: Affects: CLI users with own style files. Work needed: Confirm the rule applies to user-created files and route through Trash if so.
- Evidence: output_styles.rs:259; AGENTS.md section 9 says removed files go to Trash first [proposed to check]

## GAP-F040-02-05

**Reset on Web does not remove custom styles and does not tell the person.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-02](../../20-features/040-instructions-preferences-and-personal-style/F040-02-response-style-presets-per-chat.md)
- Detail: Affects: Web users. Work needed: State what is kept.
- Evidence: style-store.ts:225-227

## GAP-F040-02-NOTBUILT

**Response style presets (per chat): not built on Mobile, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, VS Code, Chrome
- Features: [F040-02](../../20-features/040-instructions-preferences-and-personal-style/F040-02-response-style-presets-per-chat.md)
- Requirement items: S40.05, S40.08, S40.23, S40.24, S40.25, S40.26
- Detail: Mobile: S40.25; VS Code: S40.23, S40.25; Chrome: S40.05, S40.08, S40.23, S40.24, S40.25, S40.26

## GAP-F040-03-01

**No formality dial exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-03](../../20-features/040-instructions-preferences-and-personal-style/F040-03-fine-tune-replies-warmth-enthusiasm-formality-leng.md)
- Detail: Affects: All apps. Work needed: Add a trait or correct brief S40.07.
- Evidence: TRAIT_GUIDANCE has warmth, enthusiasm, headersLists, emoji only (response-style-preferences.ts:86-97)

## GAP-F040-03-02

**Brief cites GeneralSection.tsx for these controls; they live in PersonalizationSection.tsx.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-03](../../20-features/040-instructions-preferences-and-personal-style/F040-03-fine-tune-replies-warmth-enthusiasm-formality-leng.md)
- Detail: Affects: Engineers. Work needed: Update the brief references.
- Evidence: PersonalizationSection.tsx:394-471

## GAP-F040-03-03

**Per-chat length only on Web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-03](../../20-features/040-instructions-preferences-and-personal-style/F040-03-fine-tune-replies-warmth-enthusiasm-formality-leng.md)
- Detail: Affects: Mobile, CLI, VS Code, Chrome. Work needed: Decide parity.
- Evidence: style-store.ts; mobile index.tsx has account length only

## GAP-F040-03-04

**Mobile Local uses cut-offs 75 and 25 while the server uses a 20 point band.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-03](../../20-features/040-instructions-preferences-and-personal-style/F040-03-fine-tune-replies-warmth-enthusiasm-formality-leng.md)
- Detail: Affects: Mobile Local users with in-between scores. Work needed: Use the shared level function.
- Evidence: personalization.ts:5-6; response-style-preferences.ts:79

## GAP-F040-03-05

**No proof that models obey a dial; only prompt text is tested.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-03](../../20-features/040-instructions-preferences-and-personal-style/F040-03-fine-tune-replies-warmth-enthusiasm-formality-leng.md)
- Detail: Affects: All. Work needed: Add an eval or manual check.
- Evidence: tests only check prompt lines

## GAP-F040-03-NOTBUILT

**Fine-tune replies (warmth, enthusiasm, formality, length, headings, emoji, technical depth): not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F040-03](../../20-features/040-instructions-preferences-and-personal-style/F040-03-fine-tune-replies-warmth-enthusiasm-formality-leng.md)
- Requirement items: S40.06, S40.07, S40.09, S40.10, S40.11, S40.12, S40.13
- Detail: CLI: S40.06; VS Code: S40.06; Chrome: S40.06, S40.07, S40.09, S40.10, S40.11, S40.12, S40.13

## GAP-F040-04-01

**Units and date or number formats do not exist.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-04](../../20-features/040-instructions-preferences-and-personal-style/F040-04-language-preference.md)
- Detail: Affects: All apps. Work needed: Design fields, add to shared types, server lines and each screen.
- Evidence: no code found; brief S40.15 missing everywhere

## GAP-F040-04-02

**Brief shows Chrome as done for language; no control found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-04](../../20-features/040-instructions-preferences-and-personal-style/F040-04-language-preference.md)
- Detail: Affects: Chrome. Work needed: Correct status or build control.
- Evidence: no personalization code in apps/extension

## GAP-F040-04-03

**CLI language validation differs from the shared validator.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-04](../../20-features/040-instructions-preferences-and-personal-style/F040-04-language-preference.md)
- Detail: Affects: CLI. Work needed: Share the validator.
- Evidence: personalization.rs:253-262 vs response-style-preferences.ts:145

## GAP-F040-04-NOTBUILT

**Language preference: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F040-04](../../20-features/040-instructions-preferences-and-personal-style/F040-04-language-preference.md)
- Requirement items: S40.14, S40.15
- Detail: Web: S40.15; Desktop: S40.15; Mobile: S40.15; CLI: S40.15; VS Code: S40.15; Chrome: S40.14, S40.15

## GAP-F040-05-01

**Mobile lacks the instructions on/off switch.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-05](../../20-features/040-instructions-preferences-and-personal-style/F040-05-standing-custom-instructions-and-project-instructi.md)
- Detail: Affects: Mobile users. Work needed: Add the switch and sync the flag.
- Evidence: no instructionsEnabled in apps/mobile

## GAP-F040-05-02

**Brief says Mobile per-project sharing is missing; it exists for Cloud projects.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-05](../../20-features/040-instructions-preferences-and-personal-style/F040-05-standing-custom-instructions-and-project-instructi.md)
- Detail: Affects: Testers. Work needed: Correct brief S40.30.
- Evidence: ProjectSettingsScreen.tsx:197-213

## GAP-F040-05-03

**Brief says CLI and VS Code have project instructions; they use repository files and local text, not the account project field.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-05](../../20-features/040-instructions-preferences-and-personal-style/F040-05-standing-custom-instructions-and-project-instructi.md)
- Detail: Affects: CLI, VS Code. Work needed: Decide if account projects should also reach them.
- Evidence: memory.rs:11-65; customInstructions.ts

## GAP-F040-05-04

**No test found for readProjectPersonalizationScope or the two project checkboxes.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-05](../../20-features/040-instructions-preferences-and-personal-style/F040-05-standing-custom-instructions-and-project-instructi.md)
- Detail: Affects: Web projects. Work needed: Add server and dialog tests.
- Evidence: search for uses_account_style in tests found only a marketing preview test

## GAP-F040-05-05

**Chrome has no instructions or project instructions UI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-05](../../20-features/040-instructions-preferences-and-personal-style/F040-05-standing-custom-instructions-and-project-instructi.md)
- Detail: Affects: Chrome. Work needed: Build or link.
- Evidence: no code in apps/extension

## GAP-F040-05-06

**Web edits to instructions autosave with no confirmation or version history.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-05](../../20-features/040-instructions-preferences-and-personal-style/F040-05-standing-custom-instructions-and-project-instructi.md)
- Detail: Affects: Web. Work needed: Consider a confirm for clearing, per AGENTS.md section 9 [proposed].
- Evidence: PersonalizationSection.tsx:505-519

## GAP-F040-05-NOTBUILT

**Standing custom instructions and project instructions: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F040-05](../../20-features/040-instructions-preferences-and-personal-style/F040-05-standing-custom-instructions-and-project-instructi.md)
- Requirement items: S40.16, S40.17, S40.30
- Detail: Mobile: S40.30; CLI: S40.30; VS Code: S40.30; Chrome: S40.16, S40.17, S40.30

## GAP-F040-06-01

**Agent authoring exists only in the CLI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-06](../../20-features/040-instructions-preferences-and-personal-style/F040-06-agent-instructions-cli.md)
- Detail: Affects: Web, Desktop, Mobile, VS Code, Chrome. Work needed: Product decision on parity.
- Evidence: brief S40.18 missing; no code found

## GAP-F040-06-02

**Delete is permanent, no Trash step.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-06](../../20-features/040-instructions-preferences-and-personal-style/F040-06-agent-instructions-cli.md)
- Detail: Affects: CLI users. Work needed: Follow AGENTS.md section 9 if it applies to user files [proposed].
- Evidence: agents.rs:1157

## GAP-F040-06-03

**Draft cites tui_app.rs:1198 and lib.rs:5040 that I did not verify.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-06](../../20-features/040-instructions-preferences-and-personal-style/F040-06-agent-instructions-cli.md)
- Detail: Affects: Engineers. Work needed: Read those flows.
- Evidence: not opened

## GAP-F040-06-04

**Individual agent tests were not read.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-06](../../20-features/040-instructions-preferences-and-personal-style/F040-06-agent-instructions-cli.md)
- Detail: Affects: Testers. Work needed: List test names.
- Evidence: agents.rs:1705+

## GAP-F040-06-NOTBUILT

**Agent instructions (CLI): not built on Web, Desktop, Mobile, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, VS Code, Chrome
- Features: [F040-06](../../20-features/040-instructions-preferences-and-personal-style/F040-06-agent-instructions-cli.md)
- Requirement items: S40.18
- Detail: Web: S40.18; Desktop: S40.18; Mobile: S40.18; VS Code: S40.18; Chrome: S40.18

## GAP-F040-07-01

**Per-conversation choices are not synced across devices.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-07](../../20-features/040-instructions-preferences-and-personal-style/F040-07-per-conversation-override.md)
- Detail: Affects: Web, Desktop and Mobile users with more than one device. Work needed: Store the override with the conversation record or in the account settings and read it on open.
- Evidence: style-store.ts:255-258 persists locally; style-store.ts:305-312 syncs only customStyles; no Mobile sync code found

## GAP-F040-07-02

**VS Code and Chrome have no per-chat style override.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-07](../../20-features/040-instructions-preferences-and-personal-style/F040-07-per-conversation-override.md)
- Detail: Affects: VS Code and Chrome users. Work needed: Add a per-thread or per-tab choice.
- Evidence: outputStyles.ts:85, 122 stores one global choice; no Chrome code found

## GAP-F040-07-03

**Deleting a custom style also drops the length choice of chats that used it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-07](../../20-features/040-instructions-preferences-and-personal-style/F040-07-per-conversation-override.md)
- Detail: Affects: Web and Desktop users. Work needed: Reset only the style field and keep the length.
- Evidence: style-store.ts:210-214

## GAP-F040-07-04

**Mobile has no response-length override and no custom styles.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-07](../../20-features/040-instructions-preferences-and-personal-style/F040-07-per-conversation-override.md)
- Detail: Affects: Mobile users. Work needed: Add length and custom style support if parity is wanted.
- Evidence: chatViewStore.ts:14, 64-66 hold style only

## GAP-F040-07-05

**Mobile test title says 4 options while 5 exist.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-07](../../20-features/040-instructions-preferences-and-personal-style/F040-07-per-conversation-override.md)
- Detail: Affects: Test maintainers. Work needed: Fix the test to assert all five options.
- Evidence: apps/mobile/__tests__/StyleSelector.test.tsx:100-107

## GAP-F040-07-NOTBUILT

**Per-conversation override: not built on VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F040-07](../../20-features/040-instructions-preferences-and-personal-style/F040-07-per-conversation-override.md)
- Requirement items: S40.19
- Detail: VS Code: S40.19; Chrome: S40.19

## GAP-F040-08-01

**Connecting a writing source (S40.21) is not built.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-08](../../20-features/040-instructions-preferences-and-personal-style/F040-08-learn-style-from-writing-samples.md)
- Detail: Affects: All apps. Work needed: Design consent, source picker, import pipeline and deletion.
- Evidence: Brief status all missing; no code found

## GAP-F040-08-02

**A learned writing-style summary (S40.22) is not built.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-08](../../20-features/040-instructions-preferences-and-personal-style/F040-08-learn-style-from-writing-samples.md)
- Detail: Affects: All apps. Work needed: Create a summary generated from samples, show it, allow edit and delete.
- Evidence: Brief status all missing

## GAP-F040-08-03

**Samples are missing on Mobile, CLI, VS Code and Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-08](../../20-features/040-instructions-preferences-and-personal-style/F040-08-learn-style-from-writing-samples.md)
- Detail: Affects: Those apps' users. Work needed: Add custom styles with samples to Mobile first, others per decision on scope.
- Evidence: Brief S40.20; mobile styles are presets only (chatExecutionStore.ts:1189-1195)

## GAP-F040-08-04

**No warning when a sample is longer than the 1200 characters used.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-08](../../20-features/040-instructions-preferences-and-personal-style/F040-08-learn-style-from-writing-samples.md)
- Detail: Affects: Web and Desktop users. Work needed: Add a counter or raise the limit.
- Evidence: StyleSelector.tsx:378-385 has no limit; style-store.ts:356

## GAP-F040-08-05

**Sample voice quality has no measured check.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-08](../../20-features/040-instructions-preferences-and-personal-style/F040-08-learn-style-from-writing-samples.md)
- Detail: Affects: Product quality. Work needed: Add a sample-based evaluation.
- Evidence: No eval file found for it

## GAP-F040-08-NOTBUILT

**Learn style from writing samples: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F040-08](../../20-features/040-instructions-preferences-and-personal-style/F040-08-learn-style-from-writing-samples.md)
- Requirement items: S40.20, S40.21, S40.22
- Detail: Web: S40.21, S40.22; Desktop: S40.21, S40.22; Mobile: S40.20, S40.21, S40.22; CLI: S40.20, S40.21, S40.22; VS Code: S40.20, S40.21, S40.22; Chrome: S40.20, S40.21, S40.22

## GAP-F040-09-01

**Mobile has no custom styles.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-09](../../20-features/040-instructions-preferences-and-personal-style/F040-09-custom-output-styles.md)
- Detail: Affects: Mobile users. Work needed: Add a custom style store and UI, syncing with the Web payload.
- Evidence: chatExecutionStore.ts:1189-1195 presets only; brief S40.27 mobile missing

## GAP-F040-09-02

**VS Code cannot delete a custom style, and the brief marks VS Code missing although create and edit exist.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-09](../../20-features/040-instructions-preferences-and-personal-style/F040-09-custom-output-styles.md)
- Detail: Affects: VS Code users; brief accuracy. Work needed: Add delete with a confirmation; correct the brief status.
- Evidence: outputStyles.ts:65-125

## GAP-F040-09-03

**CLI delete is permanent with no Trash step.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-09](../../20-features/040-instructions-preferences-and-personal-style/F040-09-custom-output-styles.md)
- Detail: Affects: CLI users. Work needed: Move the file to the OS Trash or a recoverable folder first.
- Evidence: output_styles.rs:257-260; AGENTS.md section 9

## GAP-F040-09-04

**Web form does not stop duplicate names or very long fields.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-09](../../20-features/040-instructions-preferences-and-personal-style/F040-09-custom-output-styles.md)
- Detail: Affects: Web and Desktop users. Work needed: Add duplicate check and length limits.
- Evidence: StyleSelector.tsx:161-176, 364-399

## GAP-F040-09-05

**CLI has no edit command.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-09](../../20-features/040-instructions-preferences-and-personal-style/F040-09-custom-output-styles.md)
- Detail: Affects: CLI users. Work needed: Add /output-style edit or open the file in the editor.
- Evidence: claude_parity.rs:1309-1313

## GAP-F040-09-06

**Web sync is last-write-wins without expectedVersion.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-09](../../20-features/040-instructions-preferences-and-personal-style/F040-09-custom-output-styles.md)
- Detail: Affects: Users editing on two devices. Work needed: Send expectedVersion and merge on 412.
- Evidence: style-store.ts:308-311; route.ts:235-246

## GAP-F040-09-07

**Chrome has no custom styles.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-09](../../20-features/040-instructions-preferences-and-personal-style/F040-09-custom-output-styles.md)
- Detail: Affects: Chrome users. Work needed: Decide scope and build.
- Evidence: No code found

## GAP-F040-09-NOTBUILT

**Custom output styles: not built on Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, Chrome
- Features: [F040-09](../../20-features/040-instructions-preferences-and-personal-style/F040-09-custom-output-styles.md)
- Requirement items: S40.27
- Detail: Mobile: S40.27; Chrome: S40.27

## GAP-F040-10-01

**No dedicated goals or interests field on any app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-10](../../20-features/040-instructions-preferences-and-personal-style/F040-10-goals-and-interests.md)
- Detail: Affects: All six apps. Work needed: Decide scope with the owner, then add fields on the shared personalization path.
- Evidence: Brief S40.04 all missing; searches found only 'More about you'

## GAP-F040-10-02

**Brief status and code differ in meaning: a free-text field mentions interests.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-10](../../20-features/040-instructions-preferences-and-personal-style/F040-10-goals-and-interests.md)
- Detail: Affects: Planning accuracy. Work needed: Decide if S40.04 is satisfied by relabelling.
- Evidence: PersonalizationSection.tsx:581

## GAP-F040-10-03

**No way to see that goals or interests are used in a chat.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-10](../../20-features/040-instructions-preferences-and-personal-style/F040-10-goals-and-interests.md)
- Detail: Affects: All apps. Work needed: Include in the effective instructions view.
- Evidence: No effective-instruction view on Web, Mobile (F040-11)

## GAP-F040-10-NOTBUILT

**Goals and interests: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F040-10](../../20-features/040-instructions-preferences-and-personal-style/F040-10-goals-and-interests.md)
- Requirement items: S40.04
- Detail: Web: S40.04; Desktop: S40.04; Mobile: S40.04; CLI: S40.04; VS Code: S40.04; Chrome: S40.04

## GAP-F040-11-01

**Web, Desktop, Mobile and Chrome have no view of the instructions in effect.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-11](../../20-features/040-instructions-preferences-and-personal-style/F040-11-see-and-import-effective-instructions.md)
- Detail: Affects: Users of those apps. Work needed: Build a shared 'what applies to this chat' view listing saved style, chat override, custom instructions, project instructions, memory and their sources.
- Evidence: Brief S40.28 missing; no code found

## GAP-F040-11-02

**The terminal UI shows a shorter list than the REPL for the same command.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-11](../../20-features/040-instructions-preferences-and-personal-style/F040-11-see-and-import-effective-instructions.md)
- Detail: Affects: CLI full-screen users. Work needed: Route the TUI to the shared overview.
- Evidence: tui_app.rs:5724-5742 vs claude_parity.rs:1378-1432

## GAP-F040-11-03

**VS Code view leaves out the output style and account personalization.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-11](../../20-features/040-instructions-preferences-and-personal-style/F040-11-see-and-import-effective-instructions.md)
- Detail: Affects: VS Code users. Work needed: Add those sources to the snapshot.
- Evidence: customInstructions.ts:128-141

## GAP-F040-11-04

**Import covers Claude Code files only and copies to the Local file only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-11](../../20-features/040-instructions-preferences-and-personal-style/F040-11-see-and-import-effective-instructions.md)
- Detail: Affects: CLI users coming from other assistants; own-key and Managed sessions. Work needed: Add other sources and an explicit boundary choice.
- Evidence: lib.rs:547-555; ecosystem.rs:586-593; memory.rs:50-56

## GAP-F040-11-05

**No import on Web, Desktop, Mobile, VS Code or Chrome, and no import of chat-app personalization from other assistants.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-11](../../20-features/040-instructions-preferences-and-personal-style/F040-11-see-and-import-effective-instructions.md)
- Detail: Affects: All non-CLI users. Work needed: Decide scope and build a guided import with consent.
- Evidence: Brief S40.29; no code found

## GAP-F040-11-06

**Brief code pointers for S40.29 are stale (lib.rs:3849 is project linking).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F040-11](../../20-features/040-instructions-preferences-and-personal-style/F040-11-see-and-import-effective-instructions.md)
- Detail: Affects: Documentation. Work needed: Update the brief to lib.rs:959-968 and 7170-7178.
- Evidence: lib.rs:3820-3850

## GAP-F040-11-NOTBUILT

**See and import effective instructions: not built on Web, Desktop, Mobile, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, VS Code, Chrome
- Features: [F040-11](../../20-features/040-instructions-preferences-and-personal-style/F040-11-see-and-import-effective-instructions.md)
- Requirement items: S40.28, S40.29
- Detail: Web: S40.28, S40.29; Desktop: S40.28, S40.29; Mobile: S40.28, S40.29; VS Code: S40.29; Chrome: S40.28, S40.29
