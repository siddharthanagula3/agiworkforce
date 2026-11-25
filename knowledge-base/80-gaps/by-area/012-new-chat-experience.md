---
id: "GAPS-AREA-012"
type: "gap-list"
title: "Gaps: New-chat experience"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 12. New-chat experience

72 open gaps that touch this area. Area page: [20-features/012-new-chat-experience](../../20-features/012-new-chat-experience/README.md).

## CMP-C264

**Slash command /deep-research**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F012-05](../../20-features/012-new-chat-experience/F012-05-search-research-agentic-and-coding-entries.md), [F013-11](../../20-features/013-composer-text-interaction/F013-11-context-chips-selected-sources-and-tools.md), [F035-01](../../20-features/035-research-workspace/F035-01-start-a-research-run-and-see-what-it-may-cost.md), [F035-04](../../20-features/035-research-workspace/F035-04-watch-the-run-progress-timeline-sources-and-findin.md), [F036-06](../../20-features/036-sources-and-grounding-interface/F036-06-conflicting-source-presentation.md), [F036-11](../../20-features/036-sources-and-grounding-interface/F036-11-citation-preserving-export.md)
- Detail: No deep-research command; /search answers one question from a web search.
- Evidence: searched: deep-research in apps/cli/src (only plan text)

## GAP-AREA012-LW06

**Guest chat status says mobile and CLI are done, but the only guest chat service and access code opened is web-only. The mobile and CLI guest behaviour was not established from code.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-012
- Detail: Area 12. New-chat experience
- Evidence: apps/web/lib/guest-chat/guest-chat-access.ts

## GAP-CAP-conversations-and-history-01

**Start a new chat: Unsent draft is not restored in the CLI or Chrome (S12.23). No shortcut check was made on every app.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F004-01](../../20-features/004-signed-in-application-destinations/F004-01-new-chat-and-past-chats.md), [F012-01](../../20-features/012-new-chat-experience/F012-01-new-chat-screen-and-greeting.md), [F012-09](../../20-features/012-new-chat-experience/F012-09-model-workspace-and-project-for-the-next-message.md), [F012-11](../../20-features/012-new-chat-experience/F012-11-unsent-draft-restore.md)
- Requirement items: S12.01, S12.20, S12.23, S4.01
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-conversations-and-history-13

**Temporary chat (not saved): No temporary-chat shortcut on web (comparison row without id). VS Code none. CLI and Chrome unclear.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F012-08](../../20-features/012-new-chat-experience/F012-08-temporary-chat.md), [F018-99](../../20-features/018-conversation-level-controls/F018-99-other-items.md), [F041-01](../../20-features/041-temporary-and-private-experiences/F041-01-start-a-temporary-chat.md), [F041-02](../../20-features/041-temporary-and-private-experiences/F041-02-temporary-mode-indicator-and-explainer.md)
- Requirement items: S12.17, S18.10, S41.01, S41.02
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-conversations-and-history-22

**Chat without an account: Web and desktop are partial per ledger; the kill switch stays off until final checks (per decision).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F012-12](../../20-features/012-new-chat-experience/F012-12-guest-use-and-sign-in-prompt.md)
- Requirement items: S12.24
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-conversations-and-history-24

**Move a chat into or out of a project: No move from CLI, VS Code, Chrome. Details sit on the projects page.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F012-09](../../20-features/012-new-chat-experience/F012-09-model-workspace-and-project-for-the-next-message.md), [F018-99](../../20-features/018-conversation-level-controls/F018-99-other-items.md)
- Requirement items: S12.20, S18.07
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-research-01

**Start a deep research run: No entry on CLI, VS Code or Chrome. Free users are denied by the capability handshake. Local-mode behaviour of the toggle was not confirmed in code.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F012-05](../../20-features/012-new-chat-experience/F012-05-search-research-agentic-and-coding-entries.md), [F013-11](../../20-features/013-composer-text-interaction/F013-11-context-chips-selected-sources-and-tools.md), [F035-01](../../20-features/035-research-workspace/F035-01-start-a-research-run-and-see-what-it-may-cost.md)
- Requirement items: S12.11, S13.33, S35.01
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-F012-01-01

**No-flash rule not applied on the web new-chat screen**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-01](../../20-features/012-new-chat-experience/F012-01-new-chat-screen-and-greeting.md)
- Detail: Affects: Web and Desktop (Electron). Work needed: Use nameResolved and an opted-out loading state in GreetingBanner, with a test.
- Evidence: useGreeting.ts:68 returns nameResolved; GreetingBanner.tsx:14 ignores it; only CloudCodePage.tsx:461 uses it

## GAP-F012-01-02

**Opt-out could flash a name**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-01](../../20-features/012-new-chat-experience/F012-01-new-chat-screen-and-greeting.md)
- Detail: Affects: Web, Desktop. Work needed: Treat unknown as hidden until the preference loads.
- Evidence: useNameOptedOut.ts:18 starts false

## GAP-F012-01-03

**No name greeting on CLI and no time greeting on VS Code**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-01](../../20-features/012-new-chat-experience/F012-01-new-chat-screen-and-greeting.md)
- Detail: Affects: CLI, VS Code. Work needed: Decide whether these surfaces should greet and add it, or record the deviation.
- Evidence: tui_app.rs:2773; webviewContent.ts:172

## GAP-F012-01-04

**Brief and decisions disagree with code**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-01](../../20-features/012-new-chat-experience/F012-01-new-chat-screen-and-greeting.md)
- Detail: Affects: Mobile, Chrome. Work needed: Update the brief and decision text; many brief line numbers are stale.
- Evidence: 2026-11-13 decision says mobile name greeting not built; ChatEmptyState.tsx:59 builds one; brief says Chrome greeting missing; side_panel.ts:5867 exists

## GAP-F012-01-05

**Retained Tauri empty state has no opt-out**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-01](../../20-features/012-new-chat-experience/F012-01-new-chat-screen-and-greeting.md)
- Detail: Affects: Internal Tauri desktop. Work needed: Apply the shared opt-out or remove the surface.
- Evidence: apps/desktop/src/features/v3/EmptyChat.tsx passes user?.name

## GAP-F012-01-NOTBUILT

**New chat screen and greeting: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F012-01](../../20-features/012-new-chat-experience/F012-01-new-chat-screen-and-greeting.md)
- Requirement items: S12.02
- Detail: CLI: S12.02; VS Code: S12.02; Chrome: S12.02

## GAP-F012-02-01

**No suggested prompts on Web, Mobile, CLI, Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-02](../../20-features/012-new-chat-experience/F012-02-suggested-prompts-and-recommendations.md)
- Detail: Affects: All apps except the one-off Web onboarding hand-off. Work needed: Owner decision, then a shared capability-aware list.
- Evidence: No prompt list found in WebChatPage.tsx empty state (7646-7710) or ChatEmptyState.tsx

## GAP-F012-02-02

**Recommended Skills only in VS Code**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-02](../../20-features/012-new-chat-experience/F012-02-suggested-prompts-and-recommendations.md)
- Detail: Affects: Web, Desktop, Mobile, CLI, Chrome. Work needed: Decide scope; reuse the skill list per surface.
- Evidence: startSuggestions.ts:28-37 is the only implementation found

## GAP-F012-02-03

**Brief cites Chrome side_panel.ts lines as suggested prompts but they are attachment chips**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-02](../../20-features/012-new-chat-experience/F012-02-suggested-prompts-and-recommendations.md)
- Detail: Affects: Chrome. Work needed: Correct the brief status.
- Evidence: apps/extension/src/side_panel.ts:10655-10700 builds page-snapshot chips

## GAP-F012-02-04

**Silent failure**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-02](../../20-features/012-new-chat-experience/F012-02-suggested-prompts-and-recommendations.md)
- Detail: Affects: Mobile, Web, VS Code. Work needed: Optional retry or hint; AGENTS.md section 9 forbids silent failures [inferred conflict].
- Evidence: catch blocks return empty (NewChatConnectorSuggestions.tsx:46-51; startSuggestions.ts:24)

## GAP-F012-02-05

**Mobile chips versus the 'nothing that suggests' decision**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-02](../../20-features/012-new-chat-experience/F012-02-suggested-prompts-and-recommendations.md)
- Detail: Affects: Mobile. Work needed: Record an owner ruling.
- Evidence: docs/decisions/2026-11-10-founder-decisions.md D-2026-11-10-01 vs ChatEmptyState.tsx:34-40

## GAP-F012-02-NOTBUILT

**Suggested prompts and recommendations: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F012-02](../../20-features/012-new-chat-experience/F012-02-suggested-prompts-and-recommendations.md)
- Requirement items: S12.04, S12.08, S12.09
- Detail: Mobile: S12.04; CLI: S12.04; VS Code: S12.04; Chrome: S12.04, S12.08, S12.09

## GAP-F012-02-PARTLY

**Suggested prompts and recommendations: partly built on Web, Desktop**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F012-02](../../20-features/012-new-chat-experience/F012-02-suggested-prompts-and-recommendations.md)
- Requirement items: S12.04, S12.09

## GAP-F012-03-01

**No recent-projects shortcut on the new-chat screen itself**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-03](../../20-features/012-new-chat-experience/F012-03-recent-projects-and-files.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome. Work needed: Decide whether the sidebar counts; if not add a short list.
- Evidence: Projects appear in the sidebar (Sidebar.tsx:710) and pickers, not in the empty-state area (WebChatPage.tsx:7646-7710)

## GAP-F012-03-02

**CLI project shortcuts not established**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-03](../../20-features/012-new-chat-experience/F012-03-recent-projects-and-files.md)
- Detail: Affects: CLI. Work needed: Verify or implement.
- Evidence: mentions.rs covers files only

## GAP-F012-03-03

**Recency of projects not proven**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-03](../../20-features/012-new-chat-experience/F012-03-recent-projects-and-files.md)
- Detail: Affects: Web. Work needed: Confirm order or sort by last_used_at.
- Evidence: sidebarProjects order follows the store (WebChatPage.tsx:1658)

## GAP-F012-03-04

**Chrome not read**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-03](../../20-features/012-new-chat-experience/F012-03-recent-projects-and-files.md)
- Detail: Affects: Chrome. Work needed: Read side_panel.ts selectActiveProject and the project chooser.
- Evidence: Brief says done; no code opened

## GAP-F012-03-05

**Brief line pointers are stale**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-03](../../20-features/012-new-chat-experience/F012-03-recent-projects-and-files.md)
- Detail: Affects: All. Work needed: Regenerate the brief.
- Evidence: e.g. WebChatPage.tsx:5313 no longer matches

## GAP-F012-03-NOTBUILT

**Recent projects and files: not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F012-03](../../20-features/012-new-chat-experience/F012-03-recent-projects-and-files.md)
- Requirement items: S12.06, S12.07
- Detail: Chrome: S12.06, S12.07

## GAP-F012-04-01

**No dedicated mode explanation with examples on Web/Desktop new-chat screen**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-04](../../20-features/012-new-chat-experience/F012-04-task-shortcuts-and-mode-explanation.md)
- Detail: Affects: Web, Desktop. Work needed: Decide whether titles suffice; add if not.
- Evidence: Only titles (ChatComposerNew.tsx:326-329) and slash examples (slashCommands.ts)

## GAP-F012-04-02

**Mobile TaskChips file does not exist**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-04](../../20-features/012-new-chat-experience/F012-04-task-shortcuts-and-mode-explanation.md)
- Detail: Affects: Mobile. Work needed: Correct brief; record that mobile intentionally has none (D-2026-11-10-01).
- Evidence: find over apps/mobile for TaskChips* returned nothing

## GAP-F012-04-03

**'Next message only' behaviour unproven on Web**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-04](../../20-features/012-new-chat-experience/F012-04-task-shortcuts-and-mode-explanation.md)
- Detail: Affects: Web, Desktop. Work needed: Trace and test.
- Evidence: toggles cleared on clear (ChatComposerNew.tsx:2292) but mode persistence after send not traced

## GAP-F012-04-04

**No task shortcuts on VS Code and CLI empty screens**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-04](../../20-features/012-new-chat-experience/F012-04-task-shortcuts-and-mode-explanation.md)
- Detail: Affects: CLI, VS Code. Work needed: Owner decision.
- Evidence: tui_app.rs start panel; webviewContent.ts:172

## GAP-F012-04-PARTLY

**Task shortcuts and mode explanation: partly built on Web, Desktop**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F012-04](../../20-features/012-new-chat-experience/F012-04-task-shortcuts-and-mode-explanation.md)
- Requirement items: S12.21

## GAP-F012-05-01

**?mode=agiwork alone is ignored**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-05](../../20-features/012-new-chat-experience/F012-05-search-research-agentic-and-coding-entries.md)
- Detail: Affects: Web, Desktop. Work needed: Return an entry when mode is set.
- Evidence: new-chat-entry.ts:75

## GAP-F012-05-02

**Research missing on CLI, VS Code, Chrome; search missing on Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-05](../../20-features/012-new-chat-experience/F012-05-search-research-agentic-and-coding-entries.md)
- Detail: Affects: CLI, VS Code, Chrome. Work needed: Implement or record deviation.
- Evidence: brief S12.10-S12.11; no entry found in files read

## GAP-F012-05-03

**Mobile coding entry not found**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-05](../../20-features/012-new-chat-experience/F012-05-search-research-agentic-and-coding-entries.md)
- Detail: Affects: Mobile. Work needed: Verify elsewhere or record.
- Evidence: grep in chat.tsx

## GAP-F012-05-04

**Brief line pointers stale**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-05](../../20-features/012-new-chat-experience/F012-05-search-research-agentic-and-coding-entries.md)
- Detail: Affects: All. Work needed: Regenerate brief.
- Evidence: ChatComposerNew.tsx:4562 etc. are unrelated now

## GAP-F012-05-05

**Limits by plan not established**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-05](../../20-features/012-new-chat-experience/F012-05-search-research-agentic-and-coding-entries.md)
- Detail: Affects: All. Work needed: Read the entitlement tables in SYS-subscriptions.
- Evidence: no limits read

## GAP-F012-05-NOTBUILT

**Search, research, agentic and coding entries: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F012-05](../../20-features/012-new-chat-experience/F012-05-search-research-agentic-and-coding-entries.md)
- Requirement items: S12.10, S12.11
- Detail: CLI: S12.11; VS Code: S12.11; Chrome: S12.10, S12.11

## GAP-F012-06-01

**No /video slash command**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-06](../../20-features/012-new-chat-experience/F012-06-image-and-video-entries.md)
- Detail: Affects: Web, Desktop. Work needed: Add or record.
- Evidence: slashCommands.ts:30-80 lists no video

## GAP-F012-06-02

**Media entry missing on VS Code and Chrome; video missing on CLI**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-06](../../20-features/012-new-chat-experience/F012-06-image-and-video-entries.md)
- Detail: Affects: VS Code, Chrome, CLI. Work needed: Owner decision.
- Evidence: brief S12.12-S12.13

## GAP-F012-06-03

**Whether media mode lasts one send on web**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-06](../../20-features/012-new-chat-experience/F012-06-image-and-video-entries.md)
- Detail: Affects: Web, Desktop. Work needed: Trace and test.
- Evidence: not traced

## GAP-F012-06-04

**Brief cites stale lines and a mobile file name that differs**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-06](../../20-features/012-new-chat-experience/F012-06-image-and-video-entries.md)
- Detail: Affects: Documentation. Work needed: Regenerate brief.
- Evidence: TaskChips.tsx not found; AddToChatSheet.tsx holds the rows

## GAP-F012-06-NOTBUILT

**Image and video entries: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F012-06](../../20-features/012-new-chat-experience/F012-06-image-and-video-entries.md)
- Requirement items: S12.12, S12.13
- Detail: CLI: S12.13; VS Code: S12.12, S12.13; Chrome: S12.12, S12.13

## GAP-F012-07-01

**Web voice entry hides silently for Local and own-key chats; no reason shown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-07](../../20-features/012-new-chat-experience/F012-07-voice-entry.md)
- Detail: Affects: Web and desktop users on Local or own-key models. Work needed: Show a short unavailable reason in the composer (requirement M-VOICE-004 style).
- Evidence: apps/web/features/chat/pages/WebChatPage.tsx:5907

## GAP-F012-07-02

**VS Code has no voice mode.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-07](../../20-features/012-new-chat-experience/F012-07-voice-entry.md)
- Detail: Affects: VS Code. Work needed: Decide scope; product doc not found.
- Evidence: brief S12.14 status missing

## GAP-F012-07-03

**Brief status for Chrome is absent but a mic button exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-07](../../20-features/012-new-chat-experience/F012-07-voice-entry.md)
- Detail: Affects: Chrome. Work needed: Open the Chrome voice code and classify it as dictation or voice mode.
- Evidence: apps/extension/src/side_panel.ts:14099

## GAP-F012-07-04

**Brief line numbers for web and mobile voice code have drifted (for example ChatComposerNew.tsx:5181 is no longer the voice button).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-07](../../20-features/012-new-chat-experience/F012-07-voice-entry.md)
- Detail: Affects: Anyone following the brief. Work needed: Refresh the brief's code references.
- Evidence: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6955

## GAP-F012-07-NOTBUILT

**Voice entry: not built on VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code
- Features: [F012-07](../../20-features/012-new-chat-experience/F012-07-voice-entry.md)
- Requirement items: S12.14
- Detail: VS Code: S12.14

## GAP-F012-08-01

**Brief says Chrome temporary chat is missing, but it exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-08](../../20-features/012-new-chat-experience/F012-08-temporary-chat.md)
- Detail: Affects: Chrome; brief readers. Work needed: Correct the brief status.
- Evidence: apps/extension/src/side_panel.ts:14937

## GAP-F012-08-02

**No in-chat temporary control in the CLI; only a startup flag.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-08](../../20-features/012-new-chat-experience/F012-08-temporary-chat.md)
- Detail: Affects: CLI. Work needed: Decide whether the flag meets S12.17; add a toggle if not.
- Evidence: apps/cli/src/lib.rs:433

## GAP-F012-08-03

**No temporary chat in VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-08](../../20-features/012-new-chat-experience/F012-08-temporary-chat.md)
- Detail: Affects: VS Code. Work needed: Product decision.
- Evidence: brief S12.17

## GAP-F012-08-04

**Brief says the mobile control is on the chat screen; the code puts it in the header and mobile Cloud project choice vs temporary conflict was not checked.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-08](../../20-features/012-new-chat-experience/F012-08-temporary-chat.md)
- Detail: Affects: Mobile. Work needed: Check mobile project rule against the web rule.
- Evidence: apps/mobile/app/(app)/(tabs)/chat.tsx:1255

## GAP-F012-08-NOTBUILT

**Temporary chat: not built on VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code
- Features: [F012-08](../../20-features/012-new-chat-experience/F012-08-temporary-chat.md)
- Requirement items: S12.17
- Detail: VS Code: S12.17

## GAP-F012-09-01

**CLI lacks a workspace line and a project picker was not found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-09](../../20-features/012-new-chat-experience/F012-09-model-workspace-and-project-for-the-next-message.md)
- Detail: Affects: CLI. Work needed: Decide the CLI equivalent (working folder and account scope line).
- Evidence: apps/cli/src/tui/tui_app.rs:5553

## GAP-F012-09-02

**Chrome has no workspace line found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-09](../../20-features/012-new-chat-experience/F012-09-model-workspace-and-project-for-the-next-message.md)
- Detail: Affects: Chrome. Work needed: Confirm and add if required.
- Evidence: apps/extension/src/side_panel.ts search

## GAP-F012-09-03

**Brief code references for WebChatPage.tsx:6175 and several composer lines have drifted.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-09](../../20-features/012-new-chat-experience/F012-09-model-workspace-and-project-for-the-next-message.md)
- Detail: Affects: Brief readers. Work needed: Refresh references.
- Evidence: apps/web/features/chat/pages/WebChatPage.tsx:7647

## GAP-F012-09-04

**The model name does not state whether it runs Local, own key or Cloud (except the Local badge).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-09](../../20-features/012-new-chat-experience/F012-09-model-workspace-and-project-for-the-next-message.md)
- Detail: Affects: All apps. Work needed: Consider a mode label, in line with AGENTS.md section 6 visible provider label.
- Evidence: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1463

## GAP-F012-09-NOTBUILT

**Model, workspace and project for the next message: not built on CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, Chrome
- Features: [F012-09](../../20-features/012-new-chat-experience/F012-09-model-workspace-and-project-for-the-next-message.md)
- Requirement items: S12.19
- Detail: CLI: S12.19; Chrome: S12.19

## GAP-F012-10-01

**No automatic route to /welcome after sign-up found in code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-10](../../20-features/012-new-chat-experience/F012-10-first-use-introduction.md)
- Detail: Affects: Web, Desktop. Work needed: Confirm the redirect (identity provider setting or proxy) and add a test.
- Evidence: apps/web/app/signup/complete/page.tsx:12

## GAP-F012-10-02

**Mobile onboarding does not explain Local, own key and Cloud in plain words as the requirement asks.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-10](../../20-features/012-new-chat-experience/F012-10-first-use-introduction.md)
- Detail: Affects: Mobile. Work needed: Add the explanation or update the requirement.
- Evidence: apps/mobile/app/(public)/onboarding.tsx:700 versus docs/product/requirements.md:944

## GAP-F012-10-03

**Brief line references for VS Code (package.json:671) and mobile are stale.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-10](../../20-features/012-new-chat-experience/F012-10-first-use-introduction.md)
- Detail: Affects: Brief readers. Work needed: Refresh references.
- Evidence: apps/extension-vscode/package.json:818

## GAP-F012-10-04

**Desktop has no own first-use flow beyond the hosted page.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-10](../../20-features/012-new-chat-experience/F012-10-first-use-introduction.md)
- Detail: Affects: Desktop. Work needed: Confirm that is intended.
- Evidence: AGENTS.md section 5

## GAP-F012-11-01

**CLI does not restore an unsent draft.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-11](../../20-features/012-new-chat-experience/F012-11-unsent-draft-restore.md)
- Detail: Affects: CLI. Work needed: Decide if needed; add a draft file.
- Evidence: brief S12.23; no draft code for the input line found in apps/cli/src

## GAP-F012-11-02

**Brief marks Chrome missing but code restores drafts in the session.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-11](../../20-features/012-new-chat-experience/F012-11-unsent-draft-restore.md)
- Detail: Affects: Chrome. Work needed: Update brief; decide on cross-restart persistence.
- Evidence: apps/extension/src/side_panel.ts:10119

## GAP-F012-11-03

**Cleanup of web drafts on sign-out is mentioned in a comment but not found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-11](../../20-features/012-new-chat-experience/F012-11-unsent-draft-restore.md)
- Detail: Affects: Web, Desktop. Work needed: Verify and test.
- Evidence: apps/web/features/chat/components/Composer/composer-draft-storage.ts:121

## GAP-F012-11-04

**Brief line numbers for web draft code are stale.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-11](../../20-features/012-new-chat-experience/F012-11-unsent-draft-restore.md)
- Detail: Affects: Brief readers. Work needed: Refresh references.
- Evidence: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4098

## GAP-F012-11-NOTBUILT

**Unsent draft restore: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F012-11](../../20-features/012-new-chat-experience/F012-11-unsent-draft-restore.md)
- Requirement items: S12.23
- Detail: CLI: S12.23

## GAP-F012-12-01

**Guest chat is switched off on the web by owner decision.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-12](../../20-features/012-new-chat-experience/F012-12-guest-use-and-sign-in-prompt.md)
- Detail: Affects: Web visitors. Work needed: Owner decision plus enabling AGI_BOT_CHALLENGE_ENFORCED=1 and the guest.chat flag.
- Evidence: brief S12.24 'Unfinished' note

## GAP-F012-12-02

**Desktop decline is by ruling, with no code gate found against the hosted guest page.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-12](../../20-features/012-new-chat-experience/F012-12-guest-use-and-sign-in-prompt.md)
- Detail: Affects: Desktop. Work needed: Verify what the Electron window shows for a signed-out visitor when the switch is on.
- Evidence: apps/desktop/electron/main.ts:764

## GAP-F012-12-03

**Mobile has no guest service; 'done' in the brief rests on Local use without an account.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-12](../../20-features/012-new-chat-experience/F012-12-guest-use-and-sign-in-prompt.md)
- Detail: Affects: Mobile. Work needed: Clarify the requirement for mobile.
- Evidence: apps/mobile/app/(app)/(tabs)/chat.tsx searched

## GAP-F012-12-04

**Status endpoint never reports remaining messages.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F012-12](../../20-features/012-new-chat-experience/F012-12-guest-use-and-sign-in-prompt.md)
- Detail: Affects: Web. Work needed: Fill remaining, or drop the field.
- Evidence: apps/web/app/api/llm/v1/chat/completions/guest/route.ts:81

## GAP-F012-12-NOTBUILT

**Guest use and sign-in prompt: not built on Desktop**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop
- Features: [F012-12](../../20-features/012-new-chat-experience/F012-12-guest-use-and-sign-in-prompt.md)
- Requirement items: S12.24
- Detail: Desktop: S12.24

## GAP-F012-12-PARTLY

**Guest use and sign-in prompt: partly built on Web, Desktop**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F012-12](../../20-features/012-new-chat-experience/F012-12-guest-use-and-sign-in-prompt.md)
- Requirement items: S12.24
- Detail: Web S12.24: web: switch-on AGI_BOT_CHALLENGE_ENFORCED=1 and flag guest.chat (surface web), off by owner decision for now. desktop: declined (lead ruling 2026-09-28): guest chat is web-only; the ChatGPT and Claude desktop apps require sign-in | Desktop S12.24: web: switch-on AGI_BOT_CHALLENGE_ENFORCED=1 and flag guest.chat (surface web), off by owner decision for now. desktop: declined (lead ruling 2026-09-28): guest chat is web-only; the ChatGPT and Claude desktop apps require sign-in
