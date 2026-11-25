---
id: "GAPS-AREA-013"
type: "gap-list"
title: "Gaps: Composer text interaction"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 13. Composer text interaction

87 open gaps that touch this area. Area page: [20-features/013-composer-text-interaction](../../20-features/013-composer-text-interaction/README.md).

## CMP-C264

**Slash command /deep-research**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F012-05](../../20-features/012-new-chat-experience/F012-05-search-research-agentic-and-coding-entries.md), [F013-11](../../20-features/013-composer-text-interaction/F013-11-context-chips-selected-sources-and-tools.md), [F035-01](../../20-features/035-research-workspace/F035-01-start-a-research-run-and-see-what-it-may-cost.md), [F035-04](../../20-features/035-research-workspace/F035-04-watch-the-run-progress-timeline-sources-and-findin.md), [F036-06](../../20-features/036-sources-and-grounding-interface/F036-06-conflicting-source-presentation.md), [F036-11](../../20-features/036-sources-and-grounding-interface/F036-11-citation-preserving-export.md)
- Detail: No deep-research command; /search answers one question from a web search.
- Evidence: searched: deep-research in apps/cli/src (only plan text)

## CMP-CP180

**Steer a running turn by sending a message**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F013-13](../../20-features/013-composer-text-interaction/F013-13-queued-and-steering-messages-side-questions.md), [F016-09](../../20-features/016-user-message-components/F016-09-sending-state-queued-pending-draft.md), [F019-01](../../20-features/019-streaming-and-response-presentation-states/F019-01-turn-accepted-queued-and-preparing.md), [F060-07](../../20-features/060-agentic-work-product/F060-07-steer-pause-resume-and-stop.md)
- Detail: The app server can steer, the terminal screen cannot Messages typed during a turn are queued for after it; /btw asks aside. The app server can steer, the terminal screen cannot.
- Evidence: apps/cli/src/tui/tui_app.rs:2024-2034; apps/cli/src/app_server/developer_host.rs:133

## CMP-CP21

**Queue a message while the agent works**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F013-13](../../20-features/013-composer-text-interaction/F013-13-queued-and-steering-messages-side-questions.md), [F016-09](../../20-features/016-user-message-components/F016-09-sending-state-queued-pending-draft.md), [F019-01](../../20-features/019-streaming-and-response-presentation-states/F019-01-turn-accepted-queued-and-preparing.md), [F060-07](../../20-features/060-agentic-work-product/F060-07-steer-pause-resume-and-stop.md)
- Detail: There is no send-now key Typing during a turn queues the message and a stopped turn returns queued text to the composer; there is no send-now key.
- Evidence: apps/cli/src/tui/tui_app.rs:8423; apps/cli/src/tui/tui_app.rs:8686

## CMP-CP27

**Steer or queue a message while a turn is running**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F013-13](../../20-features/013-composer-text-interaction/F013-13-queued-and-steering-messages-side-questions.md), [F016-09](../../20-features/016-user-message-components/F016-09-sending-state-queued-pending-draft.md), [F019-01](../../20-features/019-streaming-and-response-presentation-states/F019-01-turn-accepted-queued-and-preparing.md), [F060-07](../../20-features/060-agentic-work-product/F060-07-steer-pause-resume-and-stop.md)
- Detail: It cannot steer the running turn and Up does not pull queued text back (a stop returns it to the composer) Typing while a turn runs queues the message for later; it cannot steer the running turn and Up does not pull queued text back (a stop returns it to the composer).
- Evidence: apps/cli/src/tui/tui_app.rs:8423,8686

## GAP-AREA013-LW06

**Chrome Enter handling sends on any Enter without Shift; there is no way to choose a different send key, and long text and code paste are not handled.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-013
- Detail: Area 13. Composer text interaction
- Evidence: apps/extension/src/side_panel.ts:14574

## GAP-AREA013-LW07

**Follow-up suggestions are built but disabled by a hardcoded false default, so no user sees them.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-013
- Detail: Area 13. Composer text interaction
- Evidence: apps/web/features/chat/components/messages/ChatMessageList.tsx:1104

## GAP-AREA013-LW08

**Queued messages with attachments cannot be steered, and queued attachments are dropped when you switch chat, so those messages can be lost in part (the user is told).**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-013
- Detail: Area 13. Composer text interaction
- Evidence: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4483 and :4407

## GAP-CAP-editing-regeneration-and-branching-11

**Stop generation: Web defects seen: false 'Free limit reached' banner after Stop; empty 'Writing response' row stays; an 'Agent run failed' notification after Stop; a stopped answer returns longer after reload; cloud task Stop adds 'model failed' text.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F013-02](../../20-features/013-composer-text-interaction/F013-02-send-and-stop-buttons.md), [F019-05](../../20-features/019-streaming-and-response-presentation-states/F019-05-how-a-turn-ends-completed-partly-done-stopped.md), [F091-04](../../20-features/091-model-and-inference-components/F091-04-streaming-cancellation-and-time-limits.md), [F092-03](../../20-features/092-tool-calling-and-agent-loop-components/F092-03-running-tools-in-a-turn.md)
- Requirement items: S13.07, S19.17, S19.18, S91.24, S92.20
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-editing-regeneration-and-branching-14

**Send, queue or steer while a reply is running: Ledger and comparison disagree on Chrome queue (ledger missing, comparison Better with code). CLI queue is partial.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F013-13](../../20-features/013-composer-text-interaction/F013-13-queued-and-steering-messages-side-questions.md), [F016-09](../../20-features/016-user-message-components/F016-09-sending-state-queued-pending-draft.md), [F060-07](../../20-features/060-agentic-work-product/F060-07-steer-pause-resume-and-stop.md)
- Requirement items: S13.38, S13.39, S13.40, S16.17, S60.20
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-research-01

**Start a deep research run: No entry on CLI, VS Code or Chrome. Free users are denied by the capability handshake. Local-mode behaviour of the toggle was not confirmed in code.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F012-05](../../20-features/012-new-chat-experience/F012-05-search-research-agentic-and-coding-entries.md), [F013-11](../../20-features/013-composer-text-interaction/F013-11-context-chips-selected-sources-and-tools.md), [F035-01](../../20-features/035-research-workspace/F035-01-start-a-research-run-and-see-what-it-may-cost.md)
- Requirement items: S12.11, S13.33, S35.01
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-F013-01-01

**No right-to-left attribute on VS Code and Chrome inputs.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-01](../../20-features/013-composer-text-interaction/F013-01-typing-new-lines-and-height.md)
- Detail: Affects: Arabic and Hebrew users on VS Code and Chrome.. Work needed: Add dir=auto and test with Arabic text.
- Evidence: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3344; apps/extension/src/side_panel.ts:14170 (no dir attribute in the code read)

## GAP-F013-01-02

**Mobile has no typing cap and no counter; the cap is handled only for pasted blocks in Cloud mode.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-01](../../20-features/013-composer-text-interaction/F013-01-typing-new-lines-and-height.md)
- Detail: Affects: Mobile users typing very long text.. Work needed: Decide the mobile behaviour at the cap and show feedback.
- Evidence: apps/mobile/src/features/chat/components/ChatInput.tsx:2085-2130; :877-888

## GAP-F013-01-03

**No test found for newline keys on mobile, VS Code Shift+Enter (default), Chrome keydown, or web autosize growth.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-01](../../20-features/013-composer-text-interaction/F013-01-typing-new-lines-and-height.md)
- Detail: Affects: Testers of those apps.. Work needed: Add unit or e2e cases.
- Evidence: searched apps/mobile/__tests__, apps/extension/__tests__, apps/web/features/chat/components/Composer/*.test.tsx; only IME and e2e cases found

## GAP-F013-01-04

**Rich editor arm is off by default, so the shared editor and its tests cover a path most users do not run.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-01](../../20-features/013-composer-text-interaction/F013-01-typing-new-lines-and-height.md)
- Detail: Affects: Web and Desktop.. Work needed: Owner decision on switching the default; unknown from code.
- Evidence: apps/web/features/chat/lib/composer-editor-gate.ts:46

## GAP-F013-02-01

**Disabled reason is not visible to sighted users except offline.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-02](../../20-features/013-composer-text-interaction/F013-02-send-and-stop-buttons.md)
- Detail: Affects: Web and Desktop users with blocked Send.. Work needed: Show the reason visibly.
- Evidence: SendButton.tsx:101 (sr-only); ChatComposerNew.tsx:3588 (only offline sets a visible notice)

## GAP-F013-02-02

**Secret hold-back only on web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-02](../../20-features/013-composer-text-interaction/F013-02-send-and-stop-buttons.md)
- Detail: Affects: Mobile, CLI, VS Code, Chrome users.. Work needed: Decide scope per app, share the detector.
- Evidence: containsSecrets found only in apps/web/features/chat/components/Composer/ChatComposerNew.tsx and apps/web/lib/security/secrets-audit.ts

## GAP-F013-02-03

**Whether Stop keeps the partial answer is not established for web, mobile and VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-02](../../20-features/013-composer-text-interaction/F013-02-send-and-stop-buttons.md)
- Detail: Affects: Those apps.. Work needed: Read stopStreaming and the mobile and extension handlers, or test.
- Evidence: Only CLI (tui_app.rs:8713-8721) and Chrome (side_panel.ts:7622) were read

## GAP-F013-02-04

**No test found for the secret hold-back flow in the composer or the visible/reader disabled reasons.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-02](../../20-features/013-composer-text-interaction/F013-02-send-and-stop-buttons.md)
- Detail: Affects: Testers.. Work needed: Add composer tests.
- Evidence: Search of apps/web tests found containsSecrets only in lib/security/secret-patterns.test.ts

## GAP-F013-02-05

**VS Code Escape-to-stop is off by default while web has it on.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-02](../../20-features/013-composer-text-interaction/F013-02-send-and-stop-buttons.md)
- Detail: Affects: VS Code users expecting parity.. Work needed: Owner decision.
- Evidence: package.json:1264; ChatComposerNew.tsx:4665

## GAP-F013-03-01

**Web rich editor ignores 'Send with Enter'.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-03](../../20-features/013-composer-text-interaction/F013-03-enter-key-choice-and-shortcuts.md)
- Detail: Affects: Web and Desktop users on the editor arm.. Work needed: Pass sendShortcut from the setting and add a test.
- Evidence: packages/ui/unified-chat/src/composer-editor/ComposerEditor.tsx:94 (default); apps/web/features/chat/components/Composer/ComposerInput.tsx:160-228 (no sendShortcut prop)

## GAP-F013-03-02

**No Enter preference on mobile, CLI or Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-03](../../20-features/013-composer-text-interaction/F013-03-enter-key-choice-and-shortcuts.md)
- Detail: Affects: Users of those apps.. Work needed: Owner decides; add settings where needed.
- Evidence: none found in ChatInput.tsx, tui_app.rs, side_panel.ts

## GAP-F013-03-03

**Undo on mobile and VS Code unverified; no test for CLI undo, redo or external editor found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-03](../../20-features/013-composer-text-interaction/F013-03-enter-key-choice-and-shortcuts.md)
- Detail: Affects: Testers.. Work needed: Add tests or run human checks.
- Evidence: apps/cli/src/tui/composer_edits.rs has no test module; apps/mobile/__tests__ search found none

## GAP-F013-03-04

**The brief marks S13.08 missing on all apps but the code has it on web and VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-03](../../20-features/013-composer-text-interaction/F013-03-enter-key-choice-and-shortcuts.md)
- Detail: Affects: Anyone reading the brief.. Work needed: Correct the brief status.
- Evidence: GeneralSection.tsx:607; package.json:1251

## GAP-F013-03-NOTBUILT

**Enter key choice and shortcuts: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F013-03](../../20-features/013-composer-text-interaction/F013-03-enter-key-choice-and-shortcuts.md)
- Requirement items: S13.08
- Detail: Web: S13.08; Desktop: S13.08; Mobile: S13.08; CLI: S13.08; VS Code: S13.08; Chrome: S13.08

## GAP-F013-03-PARTLY

**Enter key choice and shortcuts: partly built on Mobile, VS Code**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Mobile, VS Code
- Features: [F013-03](../../20-features/013-composer-text-interaction/F013-03-enter-key-choice-and-shortcuts.md)
- Requirement items: S13.10

## GAP-F013-04-01

**No test found for the web expand control or the expandable threshold.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-04](../../20-features/013-composer-text-interaction/F013-04-manual-expand-and-full-screen-editing.md)
- Detail: Affects: Web and Desktop testers.. Work needed: Add a component or e2e test.
- Evidence: search of apps/web test and e2e files for expand control text found none

## GAP-F013-04-02

**VS Code and Chrome have no manual expansion.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-04](../../20-features/013-composer-text-interaction/F013-04-manual-expand-and-full-screen-editing.md)
- Detail: Affects: VS Code and Chrome users.. Work needed: Add an expand control or open-in-editor action.
- Evidence: webviewContent.ts:5140 (140px cap); side_panel.ts:3865 (120px cap)

## GAP-F013-04-03

**Web has no full-screen editor, only a taller box.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-04](../../20-features/013-composer-text-interaction/F013-04-manual-expand-and-full-screen-editing.md)
- Detail: Affects: Web and Desktop users with very long drafts.. Work needed: Owner decision; [inferred] from the brief wording.
- Evidence: ComposerInput.tsx:54

## GAP-F013-04-04

**CLI has no test for the external editor or key handling.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-04](../../20-features/013-composer-text-interaction/F013-04-manual-expand-and-full-screen-editing.md)
- Detail: Affects: CLI testers.. Work needed: Add tests.
- Evidence: composer_edits.rs has no test module

## GAP-F013-04-NOTBUILT

**Manual expand and full-screen editing: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F013-04](../../20-features/013-composer-text-interaction/F013-04-manual-expand-and-full-screen-editing.md)
- Requirement items: S13.04, S13.05
- Detail: CLI: S13.04; VS Code: S13.04, S13.05; Chrome: S13.04, S13.05

## GAP-F013-05-01

**VS Code and Chrome do not handle long text or code on paste.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-05](../../20-features/013-composer-text-interaction/F013-05-paste-handling.md)
- Detail: Affects: VS Code and Chrome users.. Work needed: Route through the shared paste decision.
- Evidence: webviewContent.ts:7730-7745; side_panel.ts:14584-14589

## GAP-F013-05-02

**Mobile has no code fencing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-05](../../20-features/013-composer-text-interaction/F013-05-paste-handling.md)
- Detail: Affects: Mobile users.. Work needed: Add and test.
- Evidence: No code-fence logic found in ChatInput.tsx (search for pastedCodeFence returned none there)

## GAP-F013-05-03

**CLI collapse does not apply while a reply is running.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-05](../../20-features/013-composer-text-interaction/F013-05-paste-handling.md)
- Detail: Affects: CLI users pasting mid-turn.. Work needed: Use the same collapse in the in-turn draft.
- Evidence: tui_app.rs:8485-8489

## GAP-F013-05-04

**No test found for rich-text normalisation or for the paste block while disabled.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-05](../../20-features/013-composer-text-interaction/F013-05-paste-handling.md)
- Detail: Affects: Testers.. Work needed: Add tests.
- Evidence: search of web Composer tests

## GAP-F013-05-05

**Mobile detects a large paste by the size of one text change, so any single insertion of 10,000 characters (for example a dictation result) would also become a chip [inferred].**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-05](../../20-features/013-composer-text-interaction/F013-05-paste-handling.md)
- Detail: Affects: Mobile users.. Work needed: Verify on a device.
- Evidence: ChatInput.tsx:1256-1286

## GAP-F013-05-NOTBUILT

**Paste handling: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F013-05](../../20-features/013-composer-text-interaction/F013-05-paste-handling.md)
- Requirement items: S13.13, S13.14
- Detail: Mobile: S13.13; CLI: S13.13; VS Code: S13.13, S13.14; Chrome: S13.13, S13.14

## GAP-F013-06-01

**Chrome has no counter or warning.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-06](../../20-features/013-composer-text-interaction/F013-06-length-counter-and-context-warning.md)
- Detail: Affects: Chrome extension users.. Work needed: Decide the Chrome cap and add the indicator.
- Evidence: apps/extension/src/side_panel.ts (no length constant or message found by search)

## GAP-F013-06-02

**Mobile has no indicator for the typed draft.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-06](../../20-features/013-composer-text-interaction/F013-06-length-counter-and-context-warning.md)
- Detail: Affects: Mobile users writing very long text.. Work needed: Add a draft counter near the cap.
- Evidence: ContextWarningChip.tsx:14-20 props are chat messages only

## GAP-F013-06-03

**No test found for the web counter, its thresholds or the red state.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-06](../../20-features/013-composer-text-interaction/F013-06-length-counter-and-context-warning.md)
- Detail: Affects: Web and Desktop testers.. Work needed: Add tests.
- Evidence: no web test mentions 'limit reached' or composer-char-counter

## GAP-F013-06-04

**Server-side enforcement of the 100,000 cap was not read.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-06](../../20-features/013-composer-text-interaction/F013-06-length-counter-and-context-warning.md)
- Detail: Affects: All apps.. Work needed: Read the contract and add a cross-check test.
- Evidence: comment at ChatComposerNew.tsx:289-293 names the schema; schema not opened

## GAP-F013-06-05

**Web counter ignores the model's context window.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-06](../../20-features/013-composer-text-interaction/F013-06-length-counter-and-context-warning.md)
- Detail: Affects: Web users in long chats.. Work needed: Owner decision.
- Evidence: ChatComposerNew.tsx:4761-4762

## GAP-F013-06-NOTBUILT

**Length counter and context warning: not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F013-06](../../20-features/013-composer-text-interaction/F013-06-length-counter-and-context-warning.md)
- Requirement items: S13.15
- Detail: Chrome: S13.15

## GAP-F013-07-01

**CLI has no draft saving across exits; only in-memory parking.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-07](../../20-features/013-composer-text-interaction/F013-07-drafts-autosave-recovery-isolation.md)
- Detail: Affects: CLI. Work needed: Write parked drafts to the config directory per session.
- Evidence: apps/cli/src/tui/tui_app.rs:608,1133 (memory map only)

## GAP-F013-07-02

**VS Code drafts exist in webview state but the brief says missing; survival after window restart is unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-07](../../20-features/013-composer-text-interaction/F013-07-drafts-autosave-recovery-isolation.md)
- Detail: Affects: VS Code. Work needed: Verify in a real window and correct the brief.
- Evidence: webviewContent.ts:5957-5966; brief S13.16

## GAP-F013-07-03

**Chrome drafts are lost when Chrome restarts and never cross devices.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-07](../../20-features/013-composer-text-interaction/F013-07-drafts-autosave-recovery-isolation.md)
- Detail: Affects: Chrome. Work needed: Use durable storage or the server draft path.
- Evidence: brief S13.16 Unfinished; side_panel.ts:10110

## GAP-F013-07-04

**Mobile has no server draft sync and its draft write failures are silent.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-07](../../20-features/013-composer-text-interaction/F013-07-drafts-autosave-recovery-isolation.md)
- Detail: Affects: Mobile. Work needed: Decide on continuity; add a notice on write failure.
- Evidence: draftStore.ts:182-184

## GAP-F013-07-05

**Stranded queued attachments are dropped.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-07](../../20-features/013-composer-text-interaction/F013-07-drafts-autosave-recovery-isolation.md)
- Detail: Affects: Web, Desktop. Work needed: Keep files as pending attachments.
- Evidence: ChatComposerNew.tsx:4408-4411

## GAP-F013-07-PARTLY

**Drafts: autosave, recovery, isolation: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F013-07](../../20-features/013-composer-text-interaction/F013-07-drafts-autosave-recovery-isolation.md)
- Requirement items: S13.16, S13.17, S13.18
- Detail: Chrome S13.16: Chrome keeps text in the current browser session. Recovery after Chrome restarts and across devices is open. | Chrome S13.17: Same-session panel reopen, reload, and delayed-read handling verified with a Chromium extension fixture. Authenticated side-panel acceptance and recovery after Chrome restarts remain open. | Chrome S13.18: Text is keyed by chat, account, and login session. Chromium verified isolation, including keyboard undo and Temporary Chat, in an extension fixture. Authenticated history navigation in the side panel remains unverified.

## GAP-F013-08-01

**Web and Desktop suggestions only show after searched or research turns because the default constant is false.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-08](../../20-features/013-composer-text-interaction/F013-08-prompt-history-and-prompt-suggestions.md)
- Detail: Affects: Web, Desktop. Work needed: Flip the constant per the brief after deciding cost and quota effect.
- Evidence: ChatMessageList.tsx:1104,1468

## GAP-F013-08-02

**CLI history has no search key.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-08](../../20-features/013-composer-text-interaction/F013-08-prompt-history-and-prompt-suggestions.md)
- Detail: Affects: CLI. Work needed: Add reverse search.
- Evidence: brief S13.19; none found in tui_app.rs

## GAP-F013-08-03

**Chrome and CLI show no suggestions.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-08](../../20-features/013-composer-text-interaction/F013-08-prompt-history-and-prompt-suggestions.md)
- Detail: Affects: Chrome, CLI. Work needed: Add or decide to leave out.
- Evidence: no code found

## GAP-F013-08-04

**Mobile has suggestions but no setting to turn them off, unlike Web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-08](../../20-features/013-composer-text-interaction/F013-08-prompt-history-and-prompt-suggestions.md)
- Detail: Affects: Mobile. Work needed: Add the same toggle.
- Evidence: no setting reference found in apps/mobile

## GAP-F013-08-05

**Brief is out of date: it says Mobile is missing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-08](../../20-features/013-composer-text-interaction/F013-08-prompt-history-and-prompt-suggestions.md)
- Detail: Affects: Documentation. Work needed: Correct brief S13.20.
- Evidence: apps/mobile/app/(app)/chat/[id].tsx:2597

## GAP-F013-08-NOTBUILT

**Prompt history and prompt suggestions: not built on CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, Chrome
- Features: [F013-08](../../20-features/013-composer-text-interaction/F013-08-prompt-history-and-prompt-suggestions.md)
- Requirement items: S13.20
- Detail: CLI: S13.20; Chrome: S13.20

## GAP-F013-08-PARTLY

**Prompt history and prompt suggestions: partly built on Web, Desktop**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F013-08](../../20-features/013-composer-text-interaction/F013-08-prompt-history-and-prompt-suggestions.md)
- Requirement items: S13.20
- Detail: Web S13.20: switch-on (deploy step 'follow-ups on'): change FOLLOW_UP_SUGGESTIONS_ENABLED_DEFAULT to true at apps/web/features/chat/components/messages/ChatMessageList.tsx:1048; generator and settings toggle are built | Desktop S13.20: switch-on (deploy step 'follow-ups on'): change FOLLOW_UP_SUGGESTIONS_ENABLED_DEFAULT to true at apps/web/features/chat/components/messages/ChatMessageList.tsx:1048; generator and settings toggle are built

## GAP-F013-09-01

**Mobile has no custom commands or templates.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-09](../../20-features/013-composer-text-interaction/F013-09-slash-commands-templates-and-skills.md)
- Detail: Affects: Mobile. Work needed: Add template insertion or document the decision.
- Evidence: CommandPalette.tsx:15-45 lists four fixed commands

## GAP-F013-09-02

**A custom command can share a built-in name and takes priority.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-09](../../20-features/013-composer-text-interaction/F013-09-slash-commands-templates-and-skills.md)
- Detail: Affects: Web, Desktop. Work needed: Block reserved names in the form.
- Evidence: ChatComposerNew.tsx:3177; CustomCommandsSettings.tsx:35-50

## GAP-F013-09-03

**Mobile palette opens for any text starting with a slash, even with spaces.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-09](../../20-features/013-composer-text-interaction/F013-09-slash-commands-templates-and-skills.md)
- Detail: Affects: Mobile. Work needed: Match the web predicate.
- Evidence: ChatInput.tsx:1553

## GAP-F013-09-04

**Brief says Chrome lacks skill invocation; code has it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-09](../../20-features/013-composer-text-interaction/F013-09-slash-commands-templates-and-skills.md)
- Detail: Affects: Documentation. Work needed: Update brief S13.23.
- Evidence: side_panel.ts:15122-15180

## GAP-F013-09-05

**Brief says templates are done on VS Code and Chrome; the code shows VS Code takes commands from the CLI listing and Chrome from saved shortcuts, so it is only partly the same feature.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-09](../../20-features/013-composer-text-interaction/F013-09-slash-commands-templates-and-skills.md)
- Detail: Affects: VS Code, Chrome. Work needed: Verify in the apps.
- Evidence: surfaceMenu.ts:252-292; pageCommands.ts:67

## GAP-F013-09-NOTBUILT

**Slash commands, templates and skills: not built on Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, Chrome
- Features: [F013-09](../../20-features/013-composer-text-interaction/F013-09-slash-commands-templates-and-skills.md)
- Requirement items: S13.21, S13.23
- Detail: Mobile: S13.21; Chrome: S13.23

## GAP-F013-10-01

**Repository mention does not exist on any app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-10](../../20-features/013-composer-text-interaction/F013-10-mentions-of-projects-files-folders-apps-tabs-and-a.md)
- Detail: Affects: All apps. Work needed: Design and build a repository row from connected GitHub.
- Evidence: brief S13.28

## GAP-F013-10-02

**Mobile has no project, folder, connector, tab or agent mention.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-10](../../20-features/013-composer-text-interaction/F013-10-mentions-of-projects-files-folders-apps-tabs-and-a.md)
- Detail: Affects: Mobile. Work needed: Add or decide to leave out.
- Evidence: ChatInput.tsx:1770-1795 skill and file only

## GAP-F013-10-03

**Web agent mention is missing; only CLI and the VS Code native panel have one.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-10](../../20-features/013-composer-text-interaction/F013-10-mentions-of-projects-files-folders-apps-tabs-and-a.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome. Work needed: Define agents as mention targets.
- Evidence: brief S13.24

## GAP-F013-10-04

**Desktop browser tab is a dialog, not an inline mention.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-10](../../20-features/013-composer-text-interaction/F013-10-mentions-of-projects-files-folders-apps-tabs-and-a.md)
- Detail: Affects: Desktop. Work needed: Add a tab row to the mention menu if wanted.
- Evidence: BrowserToolsDialog.tsx:40-45

## GAP-F013-10-05

**Brief says Mobile file mention is missing; code has library files and skills.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-10](../../20-features/013-composer-text-interaction/F013-10-mentions-of-projects-files-folders-apps-tabs-and-a.md)
- Detail: Affects: Documentation. Work needed: Correct brief S13.26.
- Evidence: ChatInput.tsx:1785

## GAP-F013-10-NOTBUILT

**@ mentions of projects, files, folders, apps, tabs and agents: not built on Web, Desktop, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, CLI, VS Code, Chrome
- Features: [F013-10](../../20-features/013-composer-text-interaction/F013-10-mentions-of-projects-files-folders-apps-tabs-and-a.md)
- Requirement items: S13.24, S13.26, S13.27, S13.28, S13.30
- Detail: Web: S13.24, S13.27, S13.28; Desktop: S13.24, S13.28; CLI: S13.28; VS Code: S13.27, S13.28, S13.30; Chrome: S13.24, S13.26, S13.28, S13.30

## GAP-F013-11-01

**Two different tool lists on Web: pill and queued label can disagree.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-11](../../20-features/013-composer-text-interaction/F013-11-context-chips-selected-sources-and-tools.md)
- Detail: Affects: Web, Desktop. Work needed: Share one derived list.
- Evidence: ChatComposerNew.tsx:3406 versus 4850

## GAP-F013-11-02

**Tool indicators have no per-chip remove control.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-11](../../20-features/013-composer-text-interaction/F013-11-context-chips-selected-sources-and-tools.md)
- Detail: Affects: Web, Mobile. Work needed: Add x or decide against.
- Evidence: ChatComposerNew.tsx:6230; ChatInput.tsx:1817

## GAP-F013-11-03

**CLI shows no skill, source or tool chips; Chrome shows no tool chips.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-11](../../20-features/013-composer-text-interaction/F013-11-context-chips-selected-sources-and-tools.md)
- Detail: Affects: CLI, Chrome. Work needed: Add compact status text.
- Evidence: tui_app.rs:3122-3135; brief S13.33

## GAP-F013-11-04

**Web Work mode and web search appear in the queued label but not in the pill.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-11](../../20-features/013-composer-text-interaction/F013-11-context-chips-selected-sources-and-tools.md)
- Detail: Affects: Web. Work needed: Align.
- Evidence: ChatComposerNew.tsx:3408-3411

## GAP-F013-11-NOTBUILT

**Context chips, selected sources and tools: not built on CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, Chrome
- Features: [F013-11](../../20-features/013-composer-text-interaction/F013-11-context-chips-selected-sources-and-tools.md)
- Requirement items: S13.32, S13.33
- Detail: CLI: S13.32, S13.33; Chrome: S13.33

## GAP-F013-12-01

**Web and Desktop dictation and voice have no Local or own-key path, so they are unavailable there.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-12](../../20-features/013-composer-text-interaction/F013-12-menu-output-format-dictation-and-voice.md)
- Detail: Affects: Web, Desktop. Work needed: Add on-device speech for Local mode, free of subscription.
- Evidence: ChatComposerNew.tsx:2052-2054; WebChatPage.tsx:5907

## GAP-F013-12-02

**Brief is out of date: VS Code has dictation.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-12](../../20-features/013-composer-text-interaction/F013-12-menu-output-format-dictation-and-voice.md)
- Detail: Affects: Documentation. Work needed: Fix brief S13.36 and experience-contract.md:641.
- Evidence: webviewContent.ts:3362

## GAP-F013-12-03

**No Output format on VS Code and Chrome; no voice conversation there either.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-12](../../20-features/013-composer-text-interaction/F013-12-menu-output-format-dictation-and-voice.md)
- Detail: Affects: VS Code, Chrome. Work needed: Decide scope.
- Evidence: brief S13.34, S13.37; none found

## GAP-F013-12-04

**Task draft names Word, PowerPoint, Excel but labels are Document, Presentation, Spreadsheet.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-12](../../20-features/013-composer-text-interaction/F013-12-menu-output-format-dictation-and-voice.md)
- Detail: Affects: Documentation. Work needed: Use the code labels.
- Evidence: skills.ts:22-26

## GAP-F013-12-05

**System-wide desktop dictation remains unwired.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-12](../../20-features/013-composer-text-interaction/F013-12-menu-output-format-dictation-and-voice.md)
- Detail: Affects: Desktop. Work needed: Finish or keep gated.
- Evidence: docs/product/experience-contract.md:669-674

## GAP-F013-12-NOTBUILT

**+ menu, output format, dictation and voice: not built on VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F013-12](../../20-features/013-composer-text-interaction/F013-12-menu-output-format-dictation-and-voice.md)
- Requirement items: S13.34, S13.36, S13.37
- Detail: VS Code: S13.34, S13.36, S13.37; Chrome: S13.34, S13.37

## GAP-F013-13-01

**Brief says CLI queue is missing, but the CLI TUI queues typed prompts.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-13](../../20-features/013-composer-text-interaction/F013-13-queued-and-steering-messages-side-questions.md)
- Detail: Affects: CLI; the knowledge base status. Work needed: Correct the brief status; decide whether per-message Edit/Cancel is required.
- Evidence: apps/cli/src/tui/tui_app.rs:8482 and :7274; brief S13.38

## GAP-F013-13-02

**Brief says Chrome queue is missing, but the Chrome side panel has a queue with Edit and Cancel.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-13](../../20-features/013-composer-text-interaction/F013-13-queued-and-steering-messages-side-questions.md)
- Detail: Affects: Chrome. Work needed: Correct the brief status.
- Evidence: apps/extension/src/side_panel.ts:8701-8765, :15317-15364

## GAP-F013-13-03

**Steering marked done on Chrome and CLI, but no steering code was found there.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-13](../../20-features/013-composer-text-interaction/F013-13-queued-and-steering-messages-side-questions.md)
- Detail: Affects: Chrome, CLI. Work needed: Build steering or correct the brief; verify CLI app-server steer (apps/cli/src/app_server/developer_host.rs:139) is not connected to the TUI.
- Evidence: search of apps/extension/src and apps/cli/src/tui finds no steer code (CLI steer hits only remote-control and app-server)

## GAP-F013-13-04

**CLI queue merges all queued prompts into one message and has no Edit or Cancel per item.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-13](../../20-features/013-composer-text-interaction/F013-13-queued-and-steering-messages-side-questions.md)
- Detail: Affects: CLI. Work needed: List queued items individually with Edit and Cancel.
- Evidence: tui_app.rs:7274-7275

## GAP-F013-13-05

**Mobile chat composer has no Steer on a queued message and no Queue/Steer setting.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-13](../../20-features/013-composer-text-interaction/F013-13-queued-and-steering-messages-side-questions.md)
- Detail: Affects: Mobile. Work needed: Add steer and the setting, or document the separate task-level control as the design.
- Evidence: ChatInput.tsx queue code (942-955, 1851-1910) has no steer

## GAP-F013-13-06

**No side question outside the CLI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-13](../../20-features/013-composer-text-interaction/F013-13-queued-and-steering-messages-side-questions.md)
- Detail: Affects: Web, desktop, mobile, VS Code, Chrome. Work needed: Design and build a side-question control that does not touch the main task.
- Evidence: brief S13.41

## GAP-F013-13-07

**Web queued messages are lost on reload.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-13](../../20-features/013-composer-text-interaction/F013-13-queued-and-steering-messages-side-questions.md)
- Detail: Affects: Web, desktop. Work needed: Persist or warn.
- Evidence: state in useState at ChatComposerNew.tsx:910

## GAP-F013-13-08

**No end-to-end test found for steer reaching the model at a step boundary.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F013-13](../../20-features/013-composer-text-interaction/F013-13-queued-and-steering-messages-side-questions.md)
- Detail: Affects: Web cloud tasks. Work needed: Add an executor-level test and a live run.
- Evidence: test files listed only cover route and composer units

## GAP-F013-13-NOTBUILT

**Queued and steering messages, side questions: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F013-13](../../20-features/013-composer-text-interaction/F013-13-queued-and-steering-messages-side-questions.md)
- Requirement items: S13.38, S13.39, S13.41
- Detail: Web: S13.41; Desktop: S13.41; Mobile: S13.41; CLI: S13.38, S13.39; VS Code: S13.41; Chrome: S13.38, S13.39, S13.41
