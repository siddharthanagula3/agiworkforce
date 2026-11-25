---
id: "F030-07"
type: "feature"
title: "AI edits to slides"
aliases: ["Ask about slide", "Rewrite slide", "Edit with AI (selection)", "Selection-based AI edits", "Slide change request", "S30.20", "S30.21", "S30.22", "S30.23", "buildSlideEditRequest"]
area: "30 Presentation workspace"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S30.20", "S30.21", "S30.22", "S30.23"]
depends_on: ["surface:web", "surface:mobile", "SYS-chat-turn-pipeline", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-files-artifacts-and-storage", "SYS-shared-ui-and-design", "file:packages/ui/unified-chat/src/lib/deck-request.ts", "F030-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F030-07 AI edits to slides

In the Presentation workspace, a person asks the assistant to change one slide. Web has an 'Ask about slide' box, a 'Rewrite slide' button and a selection toolbar ('Edit with AI'). Mobile has the same ask and rewrite. Each sends a chat message that tells the assistant to change only that slide. Nothing checks the reply.

Area: [30. Presentation workspace](README.md). Requirement items: [S30.20](../../10-requirements/capabilities/030-presentation-workspace.md#s3020), [S30.21](../../10-requirements/capabilities/030-presentation-workspace.md#s3021), [S30.22](../../10-requirements/capabilities/030-presentation-workspace.md#s3022), [S30.23](../../10-requirements/capabilities/030-presentation-workspace.md#s3023).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Turns a request about one slide (or a selected passage) into a normal chat message that names the deck, the slide number and the slide text, and tells the assistant to leave every other slide as it is. The reply becomes a new version of the deck. (packages/ui/unified-chat/src/lib/deck-request.ts:14-42)

**Why it exists.** So people can improve one slide without regenerating the whole deck. The brief wants selection edits, single-slide rewrite, single-slide regenerate and whole-deck restructuring (S30.20-S30.23). (doc: knowledge-base/data/area-briefs/030-presentation-workspace.md)

**Who uses it.** A signed-in person who has a deck open in the artifact panel on web, or in the full-screen deck viewer on mobile, inside a chat.

**Problems it solves**

- Rewriting one weak slide without losing the others
- Changing the tone or length of one passage
- Not having to copy slide text into a new chat message by hand

**Use cases**

- Open slide 3, click 'Ask about slide', type 'add a number', send.
- Click 'Rewrite slide' to tighten the current slide.
- Select a sentence on a slide and choose 'Make shorter' in the selection toolbar.
- On mobile, tap 'Ask about slide 2', type a change and send.

## 2. User experience

**Where to find it**

- Web: artifact panel, presentation toolbar button 'Ask about slide' (apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.tsx:503-515).
- Web: select text on a slide to get the selection toolbar with 'Edit with AI', 'Improve' and 'Comment' (apps/web/features/chat/components/artifacts/ArtifactSelectionToolbar.tsx:22-26).
- Mobile: deck viewer button with label 'Ask about slide N' (apps/mobile/src/features/chat/components/artifact-viewers/presentation/PresentationDeckView.tsx:503).
- Desktop (Electron) shows the hosted web app, so it gets the web controls (doc: AGENTS.md section 5). Chrome, VS Code, CLI: none found in the code.

**Before you start**

- A deck open in the web artifact panel with edit rights (editable) and the latest version shown (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1956-1959).
- A chat to send to: the 'Ask' button only shows when the page passes onRequestEdits (PresentationWorkspace.tsx:503). On web that is the chat send (apps/web/features/chat/pages/WebChatPage.tsx:6097-6103,7894).
- Mobile: the viewer shows the ask control only when the host passes onAsk; a test says there is no ask control outside a chat (apps/mobile/src/features/chat/components/artifact-viewers/__tests__/PresentationDeckView.test.tsx:206).

**Screens and controls**

- Web: 'Ask about slide' toggle button (aria-pressed); inline form with a text box 'What should change on slide N?', a 'Rewrite slide' button and a check button 'Send the change request' (PresentationWorkspace.tsx:559-600).
- Web: Escape in the text box closes the form (PresentationWorkspace.tsx:573-578).
- Web: selection toolbar with preset actions such as Rewrite, Make shorter, Make longer, tones and audiences, plus a free text 'Describe the change...' box (packages/ui/unified-chat/src/lib/artifact-selection-request.ts:34-75; ArtifactSelectionToolbar.tsx:26-27).
- Mobile: 'Ask about slide N' button, text box, 'Rewrite slide' button, 'Send the change request' (PresentationDeckView.tsx:503-580).

**Journey**

1. Open a deck in a chat (web artifact panel or mobile full screen).
2. Pick the slide with the thumbnail rail or arrows.
3. Click or tap 'Ask about slide'.
4. Type the change, or press 'Rewrite slide' to send the built-in instruction.
5. Press send. The form closes and the text box clears when the message is sent (PresentationWorkspace.tsx:254-257).
6. The assistant answers in the chat; its reply is meant to be the full updated deck, stored as a new version (packages/ui/unified-chat/src/lib/artifact-edit-request.ts:47-55).

**What the person sees and gets**

- If the message could not be sent: toast 'The change request was not sent. Try again.' and the form stays open (PresentationWorkspace.tsx:258).
- Send is disabled while the text box is empty (PresentationWorkspace.tsx:593).
- The reply appears as a chat message and, if it is a valid deck, as a new version of the artifact [inferred from artifact-edit-request.ts:23 comment that the title links the reply to versions].

**Settings**

- None found in the code for this feature. The built-in rewrite wording is the constant REWRITE_SLIDE_INSTRUCTION (deck-request.ts:7-8).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web builds and sends the slide request through onRequestEdits, with title, slide number, slide count, slide text and the instruction (PresentationWorkspace.tsx:240-260; deck-request.ts:14-42).
- Web includes the whole current deck only when the person hand-edited it (versionCount above 1) and it is at most 24,000 characters (ArtifactPreview.tsx:1957; deck-request.ts:28; artifact-edit-request.ts:8).
- Instruction text is trimmed and cut to 2,000 characters (artifact-edit-request.ts:7,12-14).
- Web selection edits send the selected passage with a scope 'slide N' taken from data-slide-index (ArtifactPreview.tsx:2177-2200).
- Web: the 'Ask' control is hidden unless the shown version is the latest (ArtifactPreview.tsx:1959).
- Mobile builds the same request with buildSlideEditRequest and the shared rewrite instruction (PresentationDeckView.tsx:172-189,560).
- Comments can be turned into an edit request for the assistant (apps/web/features/chat/components/artifacts/comments/comment-request.ts:20-35).

**Incomplete**

- Nothing in the files read checks that the reply changed only the named slide. The 'only this slide' rule is a sentence in the prompt (deck-request.ts:23).
- No dedicated control for whole-deck restructuring (reorder, merge, split). A person can only type a request in the main chat [inferred]. Slide reorder is manual in the Slide menu (PresentationWorkspace.tsx:384-403).

**Present but disconnected or switched off**

- The brief marks S30.20-S30.22 as 'missing' on every app, but web and mobile code exist and tests exist (brief vs PresentationWorkspace.tsx:240; PresentationDeckView.test.tsx:211,253). The brief is stale.

**Not available**

- Desktop Tauri app: no deck viewer or ask control found (grep of apps/desktop/src for PresentationArtifact and PresentationWorkspace found nothing).
- Chrome extension, VS Code extension, CLI: no deck ask control found in apps/extension/src, apps/extension-vscode/src or apps/cli (searched for presentation and pptx; only side-panel generated-file code matched).

## 4. Required behaviour

**Established requirements**

- The user selects part of a slide and asks the AI to change only that part (S30.20). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S30.20)
- The user asks the AI to rewrite one slide and only that slide changes (S30.21). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S30.21)
- The user regenerates one slide while the rest of the deck is kept (S30.22). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S30.22)
- The user can have the AI restructure a whole existing deck: reorder, merge, split sections (S30.23). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S30.23)
- Presentations are versioned objects. (source: doc: docs/product/experience-contract.md:44)

**Acceptance criteria**

1. On web, with an editable latest-version deck, 'Ask about slide' opens a box labelled 'What should change on slide N?' for the slide on screen.
2. Pressing 'Rewrite slide' sends a chat message that contains the slide text and the rewrite instruction, and the form closes.
3. The sent message names slide N of M and says to keep every other slide, title and order.
4. After a hand edit the message also carries the current deck (up to 24,000 characters).
5. When sending is refused, the toast 'The change request was not sent. Try again.' shows and the typed text is kept.
6. On an older, read-only version, no Ask button appears.
7. On mobile, 'Ask about slide N' sends the same request text and 'Rewrite slide' uses the shared instruction.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A reply that changes other slides should be detected or discouraged, because the brief says only that slide changes [inferred from S30.21].
- Local and own-key chats should handle the request the same as Cloud, because it is an ordinary chat message [inferred from WebChatPage.tsx:6097-6101].

**Proposed improvements** (suggestions, not requirements)

- [proposed] After the reply, compare the new deck with the old one and show which slides changed; warn if slides other than N changed.
- [proposed] Add a 'Restructure deck' action with its own request builder and a preview before saving.
- [proposed] Add Ask about slide to desktop, Chrome and VS Code deck views or mark them out of scope.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | PresentationWorkspace | `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.tsx` | Web deck workspace; ask form, Rewrite slide, sendSlideRequest (lines 240-260,503-600). |
| service | buildSlideEditRequest / REWRITE_SLIDE_INSTRUCTION | `packages/ui/unified-chat/src/lib/deck-request.ts` | Shared builder of the chat message for one slide; used by web and mobile. |
| service | artifact-edit-request helpers | `packages/ui/unified-chat/src/lib/artifact-edit-request.ts` | normalizeEditInstruction (2,000 chars), MAX_INLINE_DOCUMENT_CHARS (24,000), artifactReplyFormat('presentation'). |
| service | artifact-selection-request | `packages/ui/unified-chat/src/lib/artifact-selection-request.ts` | Preset selection actions and the request builder used for selected passages. |
| component | ArtifactSelectionToolbar | `apps/web/features/chat/components/artifacts/ArtifactSelectionToolbar.tsx` | Floating toolbar with 'Edit with AI', 'Improve', 'Comment'. |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Passes onRequestEdits and handEdited into the workspace (1952-1975); requestSelectionEdit (2177-2200). |
| hook | handleArtifactEditRequest | `apps/web/features/chat/pages/WebChatPage.tsx` | Sends the request through handleSend and returns false if blocked (6097-6103); wired to ArtifactsPanel at 7894. |
| component | SlideView | `apps/web/features/chat/components/artifacts/presentation/SlideView.tsx` | Renders a slide with data-slide-index so selection edits know the slide. |
| component | PresentationDeckView | `apps/mobile/src/features/chat/components/artifact-viewers/presentation/PresentationDeckView.tsx` | Mobile deck viewer with ask and rewrite (172-189,503-580). |
| component | ArtifactViewer | `apps/mobile/src/features/chat/components/artifact-viewers/ArtifactViewer.tsx` | Chooses the deck viewer and passes onAsk, onSave, handEdited (46-56). |
| component | ArtifactFullScreen | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | Mobile host: handleViewerAsk, versionCount for handEdited (1697-1710). |
| service | comment-request | `apps/web/features/chat/components/artifacts/comments/comment-request.ts` | Builds an edit request from comment threads including slide anchors. |
| test | deck-request.test.ts | `packages/ui/unified-chat/src/lib/deck-request.test.ts` | Covers the request builder. |
| test | PresentationWorkspace.test.tsx | `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.test.tsx` | Covers ask and rewrite (lines 147,163). |
| test | PresentationDeckView.test.tsx | `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/PresentationDeckView.test.tsx` | Covers mobile ask and rewrite (lines 206-312). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person types a change and presses send; the page builds the request text from the slide, title, counts and instruction. | device | PresentationWorkspace.tsx:240-253; deck-request.ts:14-42 |
| The request is sent as a normal chat message through the page's chat send. | device and our servers | WebChatPage.tsx:6097-6103 (web). Mobile host passes onAsk (ArtifactFullScreen.tsx:1697). |
| The chat turn runs on whichever model route the conversation uses and returns a reply with the full updated deck. | our servers | packages/ui/unified-chat/src/lib/artifact-edit-request.ts:47-55 states the reply format; the model route is not read here (unknown). |
| The reply is stored as the artifact's new version in the artifacts store. | device | ArtifactPreview.tsx:1153-1158 shows the store upsert for saves; the path for model replies is not read (unknown). |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Slide request text (title, slide text, optional whole deck) | Chat message in the conversation | As any chat message (see SYS-chat-turn-pipeline); not read here | Follows conversation retention; unknown |
| Resulting deck version | Client artifacts store (web artifacts-store.ts) | unknown | Older versions stay and can be restored (ArtifactPreview.tsx:1008-1033) |

**Models and providers.** The request is model agnostic text. Which model answers depends on the chat's route (Cloud, own key or Local) and is chosen outside this feature; not read here. No model name is coded in the builder (deck-request.ts).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web needs a signed-in chat. The comment path needs sign-in; the ask path inherits chat send rules. Exact guard is SEND_GUARD_BLOCKED in WebChatPage.tsx:6100; its rules were not read. |
| Permissions | Controls show only when the deck is editable and the latest version (ArtifactPreview.tsx:1956-1959). No role check beyond canEditSource was read. |
| Subscription | none found in the code for the ask control itself. The message counts as a chat turn, so chat entitlements apply (see SYS-subscriptions-entitlements-and-usage); rules not read. |
| Limits and metering | Instruction 2,000 characters; inline deck 24,000 characters (artifact-edit-request.ts:7-8). Metering of the resulting chat turn: not read. |
| Feature flags | none found in the code |
| Model compatibility | Any model that can return a fenced markdown deck; no per-model gate found. |
| Provider restrictions | none found in the code for this feature. |
| Local mode | Web has no Local mode surface in the files read. On mobile the ask sends a chat message; whether a Local model answers is decided by the chat route and was not read (unknown). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Send refused | Toast 'The change request was not sent. Try again.'; form stays open | PresentationWorkspace.tsx:258 |
| Empty instruction | Send button disabled; Rewrite slide still works | PresentationWorkspace.tsx:593,585 |
| Older version shown | Ask control hidden; deck read-only | ArtifactPreview.tsx:1959; PresentationWorkspace.test.tsx:225 |
| Deck larger than 24,000 characters after hand edit | Whole deck left out of the request; only the slide is sent | deck-request.ts:28 |
| Slide text contains triple backticks | Backticks are reduced so the quoted block is not closed early | deck-request.ts:11; deck-request.test.ts:59 |
| Editing a slide in place | The Ask form is hidden while editing | PresentationWorkspace.tsx:559 |
| Loading / cancel / timeout / offline for the reply | not handled in this feature's code; handled by the chat pipeline (not read) | not found in files read |
| Accessibility | Form has an aria-label and a screen-reader label; buttons have aria-labels; touch targets 44px on small screens | PresentationWorkspace.tsx:563-566,581,594 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/lib/deck-request.test.ts`: Request scopes to one slide, whole deck included only while it fits, fences kept safe.
- `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.test.tsx`: Ask about the current slide; one-click rewrite; deck carried after hand edits.
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/PresentationDeckView.test.tsx`: Mobile ask scoped to the slide, rewrite instruction, current deck only after edits, ask passed through ArtifactViewer.
- `packages/ui/unified-chat/src/lib/artifact-selection-request.test.ts`: Selection request builder.

**Test scenarios**

- **Ask about one slide (web)**
  1. Open a 4-slide deck in the artifact panel
  2. Select slide 2
  3. Click 'Ask about slide'
  4. Type 'add a number' and send
  - Expected: A chat message names slide 2 of 4 and keeps other slides; the reply creates a new version; slides 1, 3, 4 are unchanged.
- **Rewrite slide after hand edit**
  1. Edit slide 1 text by hand and press Done
  2. Click 'Ask about slide' then 'Rewrite slide'
  - Expected: The message includes the hand-edited deck text and the rewrite instruction.
- **Send refused**
  1. Block the send (for example a send guard)
  2. Press send in the ask form
  - Expected: Toast 'The change request was not sent. Try again.' and the form keeps the text.
- **Reply touches other slides**
  1. Ask for a change to slide 2
  2. Compare the new version with the old one
  - Expected: Only slide 2 differs. If other slides differ, record it as a defect; no automatic check exists.
- **Mobile ask**
  1. Open a deck in the full-screen viewer in a chat
  2. Tap 'Ask about slide 2', type a change, send
  - Expected: The chat receives the same request text; the form closes.
- **Selection edit**
  1. Select a sentence on a slide in the web panel
  2. Choose 'Make shorter'
  - Expected: A request with the selected text and scope 'slide N' is sent.

**Where to look when it fails**

- Toast text 'The change request was not sent. Try again.' means onRequestEdits returned false (send guard or send failure).
- Check the chat message list for the request text starting 'Edit the presentation'.
- Compare versions with the version timeline (aria-label 'Version N of M. Show version history').

**Hands-on test plans**

- Web: [70-qa/test-plans/web/030-presentation-workspace.md](../../70-qa/test-plans/web/030-presentation-workspace.md)
- Desktop: [70-qa/test-plans/desktop/030-presentation-workspace.md](../../70-qa/test-plans/desktop/030-presentation-workspace.md)
- Mobile: [70-qa/test-plans/mobile/030-presentation-workspace.md](../../70-qa/test-plans/mobile/030-presentation-workspace.md)

## 10. Gaps and dependencies

- **No check that only the named slide changed** Affects: Web and mobile users of Ask about slide and Rewrite slide. Evidence: deck-request.ts:23 is the only enforcement (prompt text). Work needed: Diff old and new decks after the reply and warn or reject.
- **No whole-deck restructuring control** Affects: All apps (S30.23). Evidence: No restructure builder found in packages/ui/unified-chat/src/lib. Work needed: Add a request builder and entry point, or document typing in chat as the way.
- **No deck AI edit on desktop Tauri, Chrome, VS Code, CLI** Affects: Those apps. Evidence: No deck component found in their source. Work needed: Decide scope; add or mark not applicable.
- **Brief marks S30.20-S30.22 as missing on all apps** Affects: Planning and tests. Evidence: Brief vs PresentationWorkspace.tsx:240 and test files. Work needed: Correct the brief statuses after a human run.
- **No regenerate-one-slide action distinct from rewrite** Affects: S30.22 on all apps. Evidence: Only REWRITE_SLIDE_INSTRUCTION exists (deck-request.ts:7). Work needed: Add a regenerate action or merge S30.22 into rewrite.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- SYS-chat-turn-pipeline
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-files-artifacts-and-storage
- SYS-shared-ui-and-design
- file:packages/ui/unified-chat/src/lib/deck-request.ts
- F030-08

## Unknown

- Whether a model reply that returns a full deck is saved as a new version automatically, and by which code (the reply-to-version path was not read).
- Whether the chat send applies quotas or Free-plan limits to artifact edit requests.
- Whether mobile ask runs on a Local model when the chat uses Local.
- Whether the desktop Tauri app has any deck AI edit.
