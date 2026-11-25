---
id: "GAPS-AREA-017"
type: "gap-list"
title: "Gaps: Assistant-message components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 17. Assistant-message components

59 open gaps that touch this area. Area page: [20-features/017-assistant-message-components](../../20-features/017-assistant-message-components/README.md).

## GAP-AREA017-LW06

**Copy writes plain text only. Rich or formatted copy (S17.16) is not built on any app: the copy handler calls navigator.clipboard.writeText with plain text.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-017
- Detail: Area 17. Assistant-message components
- Evidence: apps/web/features/chat/components/messages/MessageBubble.tsx:2273-2276

## GAP-CAP-editing-regeneration-and-branching-04

**Retry or regenerate a response: No regenerate in the CLI chat. Retry after a failed answer re-ran the first turn on web (defect).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F017-06](../../20-features/017-assistant-message-components/F017-06-regenerate-retry-continue-branch-and-answer-versio.md), [F090-02](../../20-features/090-conversation-and-synchronization-components/F090-02-versions-branches-and-forks.md)
- Requirement items: S17.19, S90.03
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-editing-regeneration-and-branching-05

**Regenerate with a different model: Whether Local chats hide cloud models in this menu was not checked.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F017-06](../../20-features/017-assistant-message-components/F017-06-regenerate-retry-continue-branch-and-answer-versio.md)
- Requirement items: S17.22
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-editing-regeneration-and-branching-07

**Retry a failed send or failed answer in place: Defects seen on web: Retry re-ran turn 1 instead of the failed turn; limit denial shows a raw 'Error:' line with no upgrade path; reload mid-answer shows a misleading banner.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F016-06](../../20-features/016-user-message-components/F016-06-resend-retry.md), [F017-06](../../20-features/017-assistant-message-components/F017-06-regenerate-retry-continue-branch-and-answer-versio.md), [F017-09](../../20-features/017-assistant-message-components/F017-09-stopped-failed-and-refused-answers.md), [F091-05](../../20-features/091-model-and-inference-components/F091-05-retries-fallback-and-provider-errors.md)
- Requirement items: S16.15, S16.16, S17.20, S17.40, S91.26
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-editing-regeneration-and-branching-09

**Branch a conversation into a new chat from a message: Mobile code ships Branch Conversation from Here although decision D-2026-09-28-15 keeps branching off the phone. Chrome has none. A web console 404 on the branches request was seen on the first turn.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F016-07](../../20-features/016-user-message-components/F016-07-branch-from-here.md), [F017-06](../../20-features/017-assistant-message-components/F017-06-regenerate-retry-continue-branch-and-answer-versio.md), [F062-07](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md), [F072-03](../../20-features/072-cli-and-terminal-application/F072-03-saved-sessions-list-resume-fork-export.md)
- Requirement items: S16.10, S17.27, S62.17, S72.13
- Detail: Claude no, ChatGPT yes; AGI partly built

## GAP-CAP-editing-regeneration-and-branching-12

**Stopped state keeps partial text and offers Try again: Two retry controls appear together on a stopped web answer; stopped artifact shows raw HTML in chat.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F017-09](../../20-features/017-assistant-message-components/F017-09-stopped-failed-and-refused-answers.md), [F019-05](../../20-features/019-streaming-and-response-presentation-states/F019-05-how-a-turn-ends-completed-partly-done-stopped.md)
- Requirement items: S17.37, S17.39, S19.18
- Detail: Claude unknown, ChatGPT partly; AGI built

## GAP-CAP-editing-regeneration-and-branching-13

**Continue a cut-off answer: Missing in VS Code and Chrome.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F017-06](../../20-features/017-assistant-message-components/F017-06-regenerate-retry-continue-branch-and-answer-versio.md)
- Requirement items: S17.21
- Detail: Claude unknown, ChatGPT unknown; AGI partly built

## GAP-CAP-research-15

**Which model runs research: The context threshold is a constant in code (500,000); the project says limits should be configuration. Not checked against the catalogue guard.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F015-12](../../20-features/015-model-selector-interface/F015-12-switch-safety-fallback-and-substitution-notices.md), [F017-01](../../20-features/017-assistant-message-components/F017-01-who-answered-and-live-status.md), [F079-03](../../20-features/079-routing-and-model-neutral-orchestration/F079-03-understanding-the-request.md)
- Requirement items: S15.32, S17.36, S79.10
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-F017-01-01

**The brief marks live status done on all apps but the web TypingIndicator has no announcement of its own.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-01](../../20-features/017-assistant-message-components/F017-01-who-answered-and-live-status.md)
- Detail: Affects: Screen reader users on web and Desktop. Work needed: Confirm the list-level line covers the pre-token state, or add a status role.
- Evidence: TypingIndicator.tsx:9-21 versus ChatMessageList.tsx:2089

## GAP-F017-01-02

**Chrome meta label has no token counts.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-01](../../20-features/017-assistant-message-components/F017-01-who-answered-and-live-status.md)
- Detail: Affects: Chrome users. Work needed: Pass token fields into the meta label if the brief's usage requirement should apply.
- Evidence: bubbles.ts:463-469

## GAP-F017-01-03

**Brief line references are stale (for example the follow-up flag moved from 1048 to 1104).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-01](../../20-features/017-assistant-message-components/F017-01-who-answered-and-live-status.md)
- Detail: Affects: Anyone following the brief. Work needed: Regenerate the brief code index.
- Evidence: ChatMessageList.tsx:1104

## GAP-F017-02-01

**No inline citation markers in CLI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-02](../../20-features/017-assistant-message-components/F017-02-work-and-sources-shown-under-the-answer.md)
- Detail: Affects: CLI users. Work needed: Number claims in output or document footer-only behaviour.
- Evidence: apps/cli/src/sources.rs:91-105 footer only; brief S17.06 missing

## GAP-F017-02-02

**VS Code inline markers not confirmed and no Show sources control.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-02](../../20-features/017-assistant-message-components/F017-02-work-and-sources-shown-under-the-answer.md)
- Detail: Affects: VS Code users. Work needed: Check the render path then add markers.
- Evidence: webviewContent.ts:4755-4783

## GAP-F017-02-03

**Brief says timeline is open while streaming; web code defaults closed except no-results.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-02](../../20-features/017-assistant-message-components/F017-02-work-and-sources-shown-under-the-answer.md)
- Detail: Affects: Web users and testers. Work needed: Decide the intended default and align the doc or code.
- Evidence: MessageBubble.tsx:2677

## GAP-F017-02-NOTBUILT

**Work and sources shown under the answer: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F017-02](../../20-features/017-assistant-message-components/F017-02-work-and-sources-shown-under-the-answer.md)
- Requirement items: S17.06, S17.07
- Detail: CLI: S17.06, S17.07; VS Code: S17.07

## GAP-F017-03-01

**Inline audio results do not exist anywhere.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-03](../../20-features/017-assistant-message-components/F017-03-files-images-video-and-widgets-the-answer-made.md)
- Detail: Affects: All six apps. Work needed: Add an audio player block to the shared renderer and each surface.
- Evidence: no audio element found in answer components; brief S17.11 missing

## GAP-F017-03-02

**VS Code has no file, artifact or image cards.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-03](../../20-features/017-assistant-message-components/F017-03-files-images-video-and-widgets-the-answer-made.md)
- Detail: Affects: VS Code users. Work needed: Add cards in the webview.
- Evidence: brief S17.08 to S17.10; none found in webviewContent.ts greps

## GAP-F017-03-03

**CLI video missing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-03](../../20-features/017-assistant-message-components/F017-03-files-images-video-and-widgets-the-answer-made.md)
- Detail: Affects: CLI users. Work needed: Print a link or path for video.
- Evidence: brief S17.12

## GAP-F017-03-NOTBUILT

**Files, images, video and widgets the answer made: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F017-03](../../20-features/017-assistant-message-components/F017-03-files-images-video-and-widgets-the-answer-made.md)
- Requirement items: S17.09, S17.10, S17.11, S17.12
- Detail: Web: S17.11; Desktop: S17.11; Mobile: S17.11; CLI: S17.11, S17.12; VS Code: S17.09, S17.10, S17.11, S17.12; Chrome: S17.11, S17.12

## GAP-F017-04-01

**Web default is off; suggestions appear only after searched turns.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-04](../../20-features/017-assistant-message-components/F017-04-follow-up-suggestions.md)
- Detail: Affects: Web and Desktop. Work needed: Flip the constant when owners approve.
- Evidence: ChatMessageList.tsx:1104, 1468

## GAP-F017-04-02

**Brief says mobile missing; code shows it built for Cloud chats.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-04](../../20-features/017-assistant-message-components/F017-04-follow-up-suggestions.md)
- Detail: Affects: Brief accuracy. Work needed: Update the brief status.
- Evidence: chat/[id].tsx:2593

## GAP-F017-04-03

**No follow-ups on CLI, Chrome inline row, VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-04](../../20-features/017-assistant-message-components/F017-04-follow-up-suggestions.md)
- Detail: Affects: Those apps. Work needed: Decide scope.
- Evidence: no chip row found

## GAP-F017-04-04

**Draft said a tap sends on web; the code wires onSendMessage to setComposerPrefill.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-04](../../20-features/017-assistant-message-components/F017-04-follow-up-suggestions.md)
- Detail: Affects: Web testers. Work needed: Confirm the behaviour in a live run.
- Evidence: WebChatPage.tsx:7762

## GAP-F017-04-NOTBUILT

**Follow-up suggestions: not built on CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, Chrome
- Features: [F017-04](../../20-features/017-assistant-message-components/F017-04-follow-up-suggestions.md)
- Requirement items: S17.14
- Detail: CLI: S17.14; Chrome: S17.14

## GAP-F017-04-PARTLY

**Follow-up suggestions: partly built on Web, Desktop**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F017-04](../../20-features/017-assistant-message-components/F017-04-follow-up-suggestions.md)
- Requirement items: S17.14
- Detail: Web S17.14: switch-on (deploy step 'follow-ups on'): change FOLLOW_UP_SUGGESTIONS_ENABLED_DEFAULT to true at apps/web/features/chat/components/messages/ChatMessageList.tsx:1048; generator and settings toggle are built | Desktop S17.14: switch-on (deploy step 'follow-ups on'): change FOLLOW_UP_SUGGESTIONS_ENABLED_DEFAULT to true at apps/web/features/chat/components/messages/ChatMessageList.tsx:1048; generator and settings toggle are built

## GAP-F017-05-01

**Formatted copy missing on every app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-05](../../20-features/017-assistant-message-components/F017-05-copy-read-aloud-share-export-and-save.md)
- Detail: Affects: All six apps. Work needed: Write rich and plain flavours.
- Evidence: MessageBubble.tsx:2274 writeText only

## GAP-F017-05-02

**Brief says save to project and save as document missing on web; both exist.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-05](../../20-features/017-assistant-message-components/F017-05-copy-read-aloud-share-export-and-save.md)
- Detail: Affects: Brief accuracy. Work needed: Update brief.
- Evidence: MessageBubble.tsx:4026-4049

## GAP-F017-05-03

**Mobile has save as document; brief says missing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-05](../../20-features/017-assistant-message-components/F017-05-copy-read-aloud-share-export-and-save.md)
- Detail: Affects: Brief accuracy. Work needed: Update brief.
- Evidence: mobile MessageBubble.tsx:1700-1705

## GAP-F017-05-04

**Chrome has read aloud; brief says missing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-05](../../20-features/017-assistant-message-components/F017-05-copy-read-aloud-share-export-and-save.md)
- Detail: Affects: Brief accuracy. Work needed: Update brief.
- Evidence: bubbles.ts:536

## GAP-F017-05-05

**CLI export is whole-conversation, not one answer; no read aloud or share.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-05](../../20-features/017-assistant-message-components/F017-05-copy-read-aloud-share-export-and-save.md)
- Detail: Affects: CLI users. Work needed: Add per-answer export if required.
- Evidence: registry.rs:440-470

## GAP-F017-05-06

**Save to Project missing on mobile, CLI, VS Code, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-05](../../20-features/017-assistant-message-components/F017-05-copy-read-aloud-share-export-and-save.md)
- Detail: Affects: Those apps. Work needed: Add or document.
- Evidence: none found

## GAP-F017-05-NOTBUILT

**Copy, read aloud, share, export and save: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F017-05](../../20-features/017-assistant-message-components/F017-05-copy-read-aloud-share-export-and-save.md)
- Requirement items: S17.16, S17.17, S17.32, S17.33, S17.34, S17.35
- Detail: Web: S17.16, S17.34; Desktop: S17.16, S17.34; Mobile: S17.16, S17.33, S17.34; CLI: S17.16, S17.17, S17.32, S17.33, S17.34; VS Code: S17.16, S17.17, S17.32, S17.33, S17.34, S17.35; Chrome: S17.16, S17.17, S17.32, S17.33, S17.34, S17.35

## GAP-F017-06-01

**CLI /continue is a new prompt, not a resume; no regenerate, retry-answer or answer-level branch.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-06](../../20-features/017-assistant-message-components/F017-06-regenerate-retry-continue-branch-and-answer-versio.md)
- Detail: Affects: CLI users. Work needed: Resume same answer or document.
- Evidence: claude_parity.rs:185-188

## GAP-F017-06-02

**VS Code has no continue and regenerate only on the latest answer.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-06](../../20-features/017-assistant-message-components/F017-06-regenerate-retry-continue-branch-and-answer-versio.md)
- Detail: Affects: VS Code users. Work needed: Add continue; allow older answers.
- Evidence: webviewContent.ts:759-760

## GAP-F017-06-03

**Chrome has no branch or continue.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-06](../../20-features/017-assistant-message-components/F017-06-regenerate-retry-continue-branch-and-answer-versio.md)
- Detail: Affects: Chrome users. Work needed: Add or document.
- Evidence: no hits in side-panel greps

## GAP-F017-06-04

**Web code comment says Continue covers user-stopped turns; the list excludes them.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-06](../../20-features/017-assistant-message-components/F017-06-regenerate-retry-continue-branch-and-answer-versio.md)
- Detail: Affects: Maintainers. Work needed: Fix the comment.
- Evidence: WebChatPage.tsx:6428-6431 versus ChatMessageList.tsx:1353-1357

## GAP-F017-06-05

**Web branch has no temporary-chat gate found, unlike the brief.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-06](../../20-features/017-assistant-message-components/F017-06-regenerate-retry-continue-branch-and-answer-versio.md)
- Detail: Affects: Web users. Work needed: Verify live and add a gate if needed.
- Evidence: no temporary check in MessageBubble.tsx, ChatMessageList.tsx or branches/route.ts

## GAP-F017-06-NOTBUILT

**Regenerate, retry, continue, branch and answer versions: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F017-06](../../20-features/017-assistant-message-components/F017-06-regenerate-retry-continue-branch-and-answer-versio.md)
- Requirement items: S17.19, S17.20, S17.21, S17.22, S17.27, S17.28
- Detail: CLI: S17.19, S17.20, S17.22, S17.28; VS Code: S17.21, S17.22, S17.28; Chrome: S17.21, S17.27, S17.28

## GAP-F017-07-01

**No one-step Shorten, Expand or Change tone on any app**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-07](../../20-features/017-assistant-message-components/F017-07-rewrite-the-answer-shorter-longer-tone-and-revise.md)
- Detail: Affects: All six apps; all users. Work needed: Design the action row entry, build a shared rewrite instruction builder, send it as a turn that creates a linked answer version, add tests per app.
- Evidence: Brief S17.23-S17.25 status missing; labels found only in artifact-selection-request.ts

## GAP-F017-07-02

**Selected-span support is quote-only on mobile and absent elsewhere**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-07](../../20-features/017-assistant-message-components/F017-07-rewrite-the-answer-shorter-longer-tone-and-revise.md)
- Detail: Affects: Web, Desktop, CLI, VS Code, Chrome users; mobile users wanting a real revise. Work needed: Add a revise action on mobile; add span selection on web answers; decide what CLI, VS Code and Chrome offer.
- Evidence: SelectTextSheet.tsx has one action; brief S17.26

## GAP-F017-07-03

**Artifact rewrite actions are not reused for chat answers**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-07](../../20-features/017-assistant-message-components/F017-07-rewrite-the-answer-shorter-longer-tone-and-revise.md)
- Detail: Affects: Web users. Work needed: Extract the toolbar so a chat answer can host it.
- Evidence: ArtifactPreview.tsx only importer of the toolbar

## GAP-F017-07-04

**The draft's claim that mobile 'revises' a selection is wrong**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-07](../../20-features/017-assistant-message-components/F017-07-rewrite-the-answer-shorter-longer-tone-and-revise.md)
- Detail: Affects: Anyone reading earlier docs. Work needed: Correct the brief wording for S17.26 mobile status (partial, not done).
- Evidence: SelectTextSheet.tsx only offers 'Quote in reply'

## GAP-F017-07-NOTBUILT

**Rewrite the answer (shorter, longer, tone) and revise a selected part: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F017-07](../../20-features/017-assistant-message-components/F017-07-rewrite-the-answer-shorter-longer-tone-and-revise.md)
- Requirement items: S17.23, S17.24, S17.25, S17.26
- Detail: Web: S17.26; Desktop: S17.26; Mobile: S17.23, S17.24, S17.25; CLI: S17.23, S17.24, S17.25, S17.26; VS Code: S17.23, S17.24, S17.25, S17.26; Chrome: S17.23, S17.24, S17.25, S17.26

## GAP-F017-08-01

**CLI has no per-answer rating or report**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-08](../../20-features/017-assistant-message-components/F017-08-feedback-and-report.md)
- Detail: Affects: CLI users. Work needed: Add rating and report commands using the shared feedback contract.
- Evidence: Brief S17.29-31 missing; only /feedback exists (claude_parity.rs:195-206)

## GAP-F017-08-02

**Chrome has no rating or report**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-08](../../20-features/017-assistant-message-components/F017-08-feedback-and-report.md)
- Detail: Affects: Chrome users. Work needed: Add buttons to side-panel bubbles and send via the contract.
- Evidence: No response_rating or content-report reference in apps/extension/src; contract already names chrome

## GAP-F017-08-03

**VS Code has no report**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-08](../../20-features/017-assistant-message-components/F017-08-feedback-and-report.md)
- Detail: Affects: VS Code users. Work needed: Add a Report action posting to the content-report intake.
- Evidence: No content-report reference in apps/extension-vscode/src

## GAP-F017-08-04

**Web report cannot choose a category, add a note or confirm**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-08](../../20-features/017-assistant-message-components/F017-08-feedback-and-report.md)
- Detail: Affects: Web and Desktop users, triage quality. Work needed: Add a short report form reusing the mobile categories.
- Evidence: MessageBubble.tsx:1170-1185 hard-codes category 'harmful'

## GAP-F017-08-05

**Local-mode mobile rating shows a thank-you toast but never leaves the device**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-08](../../20-features/017-assistant-message-components/F017-08-feedback-and-report.md)
- Detail: Affects: Mobile Local users; the team gets no signal. Work needed: Decide whether Local ratings should stay private and say so, or offer consented sending as reports do.
- Evidence: confirmRating runs after applyReaction regardless of mode (MessageBubble.tsx:1482-1492); server calls only for Cloud (chatMessageStore.ts:133-231)

## GAP-F017-08-06

**Brief cites chatParticipant.ts:618 for VS Code rating, but the feedback hook is at line 680**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-08](../../20-features/017-assistant-message-components/F017-08-feedback-and-report.md)
- Detail: Affects: Brief accuracy. Work needed: Fix the brief reference.
- Evidence: chatParticipant.ts:680-682

## GAP-F017-08-07

**Report not persisted as reported after reload on web**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-08](../../20-features/017-assistant-message-components/F017-08-feedback-and-report.md)
- Detail: Affects: Web users may report twice. Work needed: Server idempotency covers the same reportId only; decide dedupe by message.
- Evidence: reportState is component state (MessageBubble.tsx:1141)

## GAP-F017-08-NOTBUILT

**Feedback and report: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F017-08](../../20-features/017-assistant-message-components/F017-08-feedback-and-report.md)
- Requirement items: S17.29, S17.30, S17.31
- Detail: CLI: S17.29, S17.30, S17.31; VS Code: S17.31; Chrome: S17.29, S17.30, S17.31

## GAP-F017-09-01

**VS Code does not mark a stopped answer**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-09](../../20-features/017-assistant-message-components/F017-09-stopped-failed-and-refused-answers.md)
- Detail: Affects: VS Code users. Work needed: Read payload.stopped, add a stopped notice with retry, add a test.
- Evidence: done {stopped:true} sent at ChatStateManager.ts:6874-6879; done handler webviewContent.ts:7870-7900 does not read it; brief says done

## GAP-F017-09-02

**Chrome has no refusal state**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-09](../../20-features/017-assistant-message-components/F017-09-stopped-failed-and-refused-answers.md)
- Detail: Affects: Chrome users. Work needed: Carry the finish reason through the managed stream and render a refusal notice with a next step.
- Evidence: Brief S17.38; no refusal handling in apps/extension/src

## GAP-F017-09-03

**VS Code empty reply has no dedicated message**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-09](../../20-features/017-assistant-message-components/F017-09-stopped-failed-and-refused-answers.md)
- Detail: Affects: VS Code users. Work needed: Confirm what the runtime sends and add explicit copy.
- Evidence: No 'no response' string in apps/extension-vscode/src or en/vscode.json; CLI maps NoResponse to provider_unavailable

## GAP-F017-09-04

**Mobile refusal has no Retry; mobile stopped answer with text has no Try again**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-09](../../20-features/017-assistant-message-components/F017-09-stopped-failed-and-refused-answers.md)
- Detail: Affects: Mobile users. Work needed: Decide the next steps and add actions.
- Evidence: MessageBubble.tsx (mobile) 2928-2958

## GAP-F017-09-05

**CLI has no Retry control for any case**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-09](../../20-features/017-assistant-message-components/F017-09-stopped-failed-and-refused-answers.md)
- Detail: Affects: CLI users. Work needed: Add a retry command or keybinding.
- Evidence: Brief S17.20 missing; hints say to send again

## GAP-F017-09-06

**Web refusal text lacks a rephrase or switch-model next step**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-09](../../20-features/017-assistant-message-components/F017-09-stopped-failed-and-refused-answers.md)
- Detail: Affects: Web and Desktop users. Work needed: Align wording and add a switch-model action.
- Evidence: ChatMessageList.tsx:1971 versus mobile MessageBubble.tsx:2941

## GAP-F017-09-07

**Line references in the brief for CLI, Web and Chrome have drifted**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F017-09](../../20-features/017-assistant-message-components/F017-09-stopped-failed-and-refused-answers.md)
- Detail: Affects: Brief accuracy. Work needed: Regenerate the code references.
- Evidence: tui_app.rs:5234 is not turn-ending code; bubbles.ts:185 is a map card

## GAP-F017-09-NOTBUILT

**Stopped, failed and refused answers: not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F017-09](../../20-features/017-assistant-message-components/F017-09-stopped-failed-and-refused-answers.md)
- Requirement items: S17.38
- Detail: Chrome: S17.38
