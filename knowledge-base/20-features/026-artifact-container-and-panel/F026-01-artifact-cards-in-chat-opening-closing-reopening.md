---
id: "F026-01"
type: "feature"
title: "Artifact cards in chat, opening, closing, reopening"
aliases: ["Artifact card", "Inline artifact card", "Open artifact / Hide artifact", "Artifacts toggle", "+N more", "Download all", "Artifact launch card", "Outputs popover (Chrome)", "Code: Show Artifacts (VS Code)"]
area: "26 Artifact container and panel"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S26.01", "S26.02", "S26.03", "S26.05", "S26.06", "S26.07"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:local", "mode:cloud", "SYS-files-artifacts-and-storage", "SYS-sync-and-continuity", "SYS-chat-turn-pipeline", "SYS-shared-ui-and-design", "file:packages/platform/artifacts/src/artifact-store.ts", "api:POST /api/chat/sync", "api:GET /api/artifacts/index"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F026-01 Artifact cards in chat, opening, closing, reopening

Each artifact a reply makes appears as a card under the reply with its title and kind. On web, desktop (the web app in Electron) and Chrome the card opens or hides the viewer beside the chat. On mobile it opens a full-screen sheet. CLI and VS Code have list commands, not cards. Closing never deletes the artifact.

Area: [26. Artifact container and panel](README.md). Requirement items: [S26.01](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2601), [S26.02](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2602), [S26.03](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2603), [S26.05](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2605), [S26.06](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2606), [S26.07](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2607).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | built (this page lists unfinished parts) | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows each artifact as a small card in the conversation, opens it in the viewer, closes the viewer without deleting anything, and lets the person reopen it from the card, the artifacts toggle or the list. Web caps the message at three cards, adds a '+N more' button and a 'Download all' button (InlineArtifactCards.tsx:14,39-85).

**Why it exists.** Long code or documents would flood the chat. A card keeps the answer readable and the artifact one tap away, as in the leading assistants. [inferred] The repository guidance asks for real file cards that stay valid after refresh (doc: docs/product/competitive-guidance.md:285).

**Who uses it.** Anyone who asks the assistant to build a page, document, diagram or file, on web, the Desktop window, the phone app and the Chrome side panel. CLI and VS Code users reach artifacts by list and open commands.

**Problems it solves**

- Keeps big generated content out of the message body
- Gives a stable way to find and reopen what was made
- Lets many artifacts from one reply be reached or saved together

**Use cases**

- Ask for a landing page, click Open on the card and read it beside the chat
- Close the viewer, then reopen it later from the artifacts toggle
- Save every artifact of a reply with Download all
- On a phone tap the card to read the document full screen

## 2. User experience

**Where to find it**

- Web and Desktop (Electron shows the hosted web app, doc: AGENTS.md section 5): under an assistant reply the card list labelled 'Artifacts' (InlineArtifactCards.tsx:44); chat header button 'Open artifacts panel' / 'Close artifacts panel' with title 'Artifacts' (ArtifactsPanel.tsx:890-891); panel title 'Artifacts' (ArtifactsPanel.tsx:697)
- Mobile: card under the reply (MessageBubble.tsx:2804-2812); also the Artifacts screen that opens the same full-screen viewer (features/artifacts/index.tsx:249)
- Chrome side panel: card with 'Open' / 'Hide' (artifactPanel.ts:647) and an Outputs popover that counts artifacts (artifactPanel.ts:919-921)
- CLI: 'agi artifacts list|show|open' and the '/artifacts' slash command (lib.rs:1082-1085, cloud/artifacts.rs:609-657)
- VS Code: commands 'Code: Show Artifacts', 'Code: Open Artifact' (package.json:689-705) and a tree of artifacts (artifactsTree.ts:32-59)

**Before you start**

- The reply must contain an artifact (derived from the message content, or a generated file)
- Web '+N more' needs more than three artifacts in one reply; 'Download all' needs more than one (InlineArtifactCards.tsx:58,70)
- CLI and VS Code need a signed-in Cloud account (client.rs:361-378; artifactsTree.ts:99)

**Screens and controls**

- Web card: icon, title, one-line type and extension, optional 'Published' line, download icon, a Globe link when published, and an 'Open' or 'Hide' button (ArtifactCard.tsx:118-170)
- Web '+N more' button, aria-label 'View N more artifacts' (InlineArtifactCards.tsx:60-67)
- Web 'Download all' button with a folder icon (InlineArtifactCards.tsx:70-85); panel header also has 'Download all artifacts as zip' (ArtifactsPanel.tsx:732-750)
- Web panel tab strip: one tab per artifact (ArtifactsPanel.tsx:775-804)
- Mobile card: type icon, title, language or kind label, audience chip, preview lines; tap to expand (InlineArtifactCard.tsx:250-303)
- Chrome card toggle text 'Open' / 'Hide' (artifactPanel.ts:647); panel close button 'Close artifact' (_locales/en/messages.json:3277)

**Journey**

1. Ask the assistant for something that makes an artifact
2. While it writes, web shows a 'Creating <file name>' row; afterwards a collapsed 'Created a file' row and the card(s) (ArtifactCreatingRow.tsx:19-25,92-119; MessageBubble.tsx:2975-2987)
3. Click 'Open' on a card: the artifact is selected and the panel opens beside the chat (InlineArtifactCards.tsx:28-35)
4. Click 'Hide' on the same card or the panel close button: the viewer closes (InlineArtifactCards.tsx:50-54)
5. Reopen from any card, from the chat-header toggle, or from a tab or the list
6. On mobile: tap the card, read in the full-screen sheet, tap 'Close' to return (ArtifactFullScreen.tsx:1167)

**What the person sees and gets**

- The open card gets a stronger border and the button reads 'Hide' (ArtifactCard.tsx:119-125,168)
- Download all shows a toast: 'Preparing artifact download…', then 'Artifact download ready', or a user message on failure (InlineArtifactCards.tsx:74-78)
- Panel header shows the artifact count, 'Not saved' when browser storage is full, and 'Syncing…', 'Synced' or 'Sync retrying' (ArtifactsPanel.tsx:698-725)
- Toggle badge shows the artifact count while the panel is closed (ArtifactsPanel.tsx:894-898)

**Settings**

- Panel width (web): stored with the UI settings, see F026-03
- No setting found that turns cards off

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: cards, Open/Hide, +N more, Download all, panel toggle, tabs, deep link, conversation switch (InlineArtifactCards.tsx:22-88; ArtifactsPanel.tsx:622-650)
- Web: closing only calls setPanelOpen(false); the artifact list is untouched (ArtifactsPanel.tsx:845; artifacts-store.ts:819-821)
- Web: artifacts persist in browser storage under 'agi-artifacts-store' and sync to the account (artifacts-store.ts:591; use-artifact-cloud-sync.ts:19-60)
- Mobile: InlineArtifactCard opens ArtifactFullScreen; closing sets the expanded artifact to null, nothing is deleted (MessageBubble.tsx:1389-1397,3204-3213)
- Mobile: artifacts persist on the device in a store named 'artifact-store' (store.ts:577-578)
- Chrome: cards with Open/Hide, auto-open panel, Outputs popover (artifactPanel.ts:647,901-921)
- CLI: list, show, open and a '/artifacts' slash command (cloud/artifacts.rs:299-330,609-657)
- VS Code: tree view and read-only open (artifactActions.ts:104-135)

**Incomplete**

- Mobile has no '+N more' or 'Download all' in the files opened [inferred from InlineArtifactCard.tsx and MessageBubble.tsx:2804-2812 showing every card]
- Mobile card does not toggle: a second tap on the card reopens, it is the sheet's Close that hides (ArtifactFullScreen.tsx:1167)
- Mobile keeps at most 200 artifacts and 20 versions each (store.ts:36,45); web keeps at most 200 (artifacts-store.ts:30)

**Present but disconnected or switched off**

- Tauri desktop (retained internal code) has its own AgiWorkArtifacts screen (docs/product/surface-feature-matrix.md:189); not opened by this review

**Not available**

- CLI and VS Code have no card in a transcript (CLI prints text, apps/cli/src/cloud/artifacts.rs:660-690; VS Code shows a tree, artifactsTree.ts:32)
- CLI and VS Code cannot see artifacts in Local mode: the CLI refuses non-managed mode (client.rs:368-372)

## 4. Required behaviour

**Established requirements**

- An assistant reply that produces an artifact shows a card in the transcript and activating it opens that artifact (S26.01) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.01)
- The title is shown on card and viewer with a fallback when none (S26.02) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.02)
- The kind is shown on the card and in the viewer (S26.03) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.03)
- The user can open an artifact from the chat or from a list (S26.05) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.05)
- Closing the viewer hides it without deleting the artifact (S26.06) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.06)
- After closing, the same artifact can be reopened from the chat, a toggle or a list, including after a reload (S26.07) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.07)
- Artifacts in chat show real file cards that remain valid after refresh (source: doc: docs/product/competitive-guidance.md:285)

**Acceptance criteria**

1. Web: a reply with one HTML artifact shows one card with title, type line and an 'Open' button; clicking opens the panel and the button reads 'Hide'
2. Web: clicking 'Hide' closes the panel and the card and the tab list still hold the artifact; the header toggle reopens it
3. Web: a reply with five artifacts shows three cards, a '+2 more' button that opens the fourth, and a 'Download all' button
4. Web: an artifact with no title shows the title 'Untitled' on its card
5. Mobile: tapping a card opens the full-screen sheet; 'Close' returns to the chat and the card is still there
6. After a page reload the artifact still opens from its card (web) or from the Artifacts screen (mobile)
7. If Download all fails, a toast shows a plain message, not a raw error

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Cards should appear in the order the artifacts were made [inferred: list order follows the derived order in MessageBubble.tsx:1917-1932; not separately checked]
- Phone web must not open the panel by itself because it covers the chat (artifacts-store.ts:33-37,823-826)

**Proposed improvements** (suggestions, not requirements)

- [proposed] Bring '+N more' and 'Download all' to the mobile transcript
- [proposed] For CLI, print a one-line count after a turn that made artifacts

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | InlineArtifactCards | `apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx` | Card list, three-card cap, '+N more', 'Download all' |
| component | ArtifactCard | `apps/web/features/chat/components/artifacts/ArtifactCard.tsx` | One web card with Open/Hide, download and published link |
| other | ArtifactLabels | `apps/web/features/chat/components/artifacts/ArtifactLabels.tsx` | Title fallback 'Untitled', type icon, extension label |
| component | ArtifactCreatingRow / ArtifactCreatedRow | `apps/web/features/chat/components/artifacts/ArtifactCreatingRow.tsx` | 'Creating' and 'Created a file' rows |
| component | MessageBubble (web) | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Chooses which artifacts become cards and mounts the rows (lines 1917-1940, 2975-2987, 3206-3208) |
| component | ArtifactsPanel / ArtifactsToggleButton | `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` | Panel, tab list, toggle, deep link, conversation switch |
| store | useArtifactsStore | `apps/web/features/chat/stores/artifacts-store.ts` | Artifact list, selection, panel open state, browser persistence, cloud merge |
| store | createArtifactStore | `packages/platform/artifacts/src/artifact-store.ts` | Shared engine for list, versions, selection and panelOpen |
| hook | useArtifactCloudSync | `apps/web/features/chat/hooks/use-artifact-cloud-sync.ts` | Pulls and pushes artifacts to the account every 30 seconds |
| service | downloadAllArtifacts | `apps/web/features/chat/utils/downloadArtifacts.ts` | Builds a zip of artifacts in the browser (JSZip, line 107) |
| component | InlineArtifactCard (mobile) | `apps/mobile/src/features/chat/components/InlineArtifactCard.tsx` | Mobile card |
| component | MessageBubble (mobile) | `apps/mobile/src/features/chat/components/MessageBubble.tsx` | Mounts cards and the full-screen viewer (lines 1154,1318,2804,3204) |
| screen | Artifacts screen (mobile) | `apps/mobile/src/features/artifacts/index.tsx` | List of saved artifacts that opens the same viewer |
| store | artifact-store (mobile) | `apps/mobile/src/features/artifacts/store.ts` | Device-persisted artifact list and versions |
| component | artifactPanel (Chrome) | `apps/extension/src/features/side-panel/artifactPanel.ts` | Side panel cards, panel and Outputs popover |
| command | agi artifacts | `apps/cli/src/cloud/artifacts.rs` | List, show, open, publish for the CLI and the /artifacts slash command |
| component | ArtifactsTreeProvider | `apps/extension-vscode/src/features/artifacts/artifactsTree.ts` | VS Code tree of artifacts |
| config | windowPolicy | `apps/desktop/electron/windowPolicy.ts` | Electron window rules for pop-outs from the hosted web app |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The reply text arrives; the app derives artifacts from fenced blocks in the message and, while a fence is open, shows a 'Creating' row | device | use-streaming-artifact.ts:90-110; MessageBubble.tsx:2980-2987 |
| Finished artifacts are filtered (generated images excluded from cards) and drawn as cards | device | MessageBubble.tsx:1917-1932,3206-3208 |
| Click Open: selectArtifact(id) then setPanelOpen(true) | device | InlineArtifactCards.tsx:28-35 |
| The list is saved in browser storage and pushed to and pulled from the account by sync | device and our servers | artifacts-store.ts:591; artifact-cloud-sync.ts:60,114 |
| Download all builds a zip in the browser and saves it | device | downloadArtifacts.ts:107-130 |
| Mobile: tap sets the expanded artifact and the full-screen modal shows it; list is read from the device store | device | MessageBubble.tsx:1389-1397; store.ts:577-578 |
| CLI and VS Code read the account index and the source message from the hosted API | our servers | cloud/artifacts.rs:25-27,330-341; artifactActions.ts:57-72 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Artifact list, versions, selected id (web) | Browser localStorage key 'agi-artifacts-store' (artifacts-store.ts:591); panel-open flag is not in the persisted shape [inferred from partialize at lines 608-625 listing artifacts, versionsById, selectedArtifactId] | Yes to the account unless the conversation holds on-device turns or is temporary (artifacts-store.ts:1054-1068) | Capped at 200 artifacts (artifacts-store.ts:30); stops saving when browser storage is full and shows 'Not saved' (artifacts-store.ts:562-587; ArtifactsPanel.tsx:703-710) |
| Artifact list and versions (mobile) | Device store 'artifact-store' via mmkvStorage (store.ts:577-578) | Cloud-scoped rows are queued for push through pendingCloudPushes when signed in (store.ts:340-352); Local rows stay on the device [inferred from store.ts:60] | 200 artifacts, 20 versions each (store.ts:36,45) |
| Account artifact index (CLI, VS Code, Chrome link) | Our servers, read through /api/artifacts/index (cloud/artifacts.rs:25) | Read only | unknown |

**Models and providers.** The card feature does not call a model. The model only writes the reply that holds the artifact. Which provider wrote it can restrict later actions such as publishing (ArtifactsPanel.tsx:241-263), see F026-04 and the publish features.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web and mobile cards work without a separate account step beyond using chat. Account sync needs a signed-in session (use-artifact-cloud-sync.ts:36). CLI and VS Code need a signed-in Cloud account (client.rs:376-378; artifactsTree.ts:99). |
| Permissions | none found in the code for opening or closing a card |
| Subscription | none found in the code in the card, panel and toggle files opened (InlineArtifactCards.tsx, ArtifactCard.tsx, ArtifactsPanel.tsx); other files were not searched for plan checks |
| Limits and metering | 200 retained artifacts on web and mobile; 20 versions per artifact on mobile (artifacts-store.ts:30; store.ts:36,45). No usage metering found for opening a card. |
| Feature flags | none found in the code |
| Model compatibility | Any model whose reply contains a fenced artifact block; derivation depends on the message's artifact policy (MessageBubble.tsx:1348-1364). |
| Provider restrictions | none found for cards. Live runtime and publishing depend on whether the conversation is Cloud-managed (ArtifactsPanel.tsx:396-401). |
| Local mode | Web and mobile cards work in Local mode because artifacts are derived on the device. Conversations that hold on-device turns are not pushed to the account (artifacts-store.ts:1054-1068). The CLI refuses non-managed mode (client.rs:368-372), so CLI listing is Cloud only. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty (no artifacts) | Web panel shows 'No artifacts yet' with 'Renderable code and generated files will appear here' (ArtifactsPanel.tsx:160-169). CLI prints 'No artifacts in your AGI account yet.' (cloud/artifacts.rs:669) | ArtifactsPanel.tsx:160-169 |
| More than three artifacts | Web shows three cards and a '+N more' button that opens the fourth | InlineArtifactCards.tsx:14,39-41,58-69 |
| Phone-width web | The panel is a modal dialog sheet; a reply does not auto-open it | ArtifactsPanel.tsx:652-654,677-679; artifacts-store.ts:823-826 |
| Switch conversation | If the selected artifact belongs to the new conversation it stays; otherwise the first artifact of that conversation or none is selected | ArtifactsPanel.tsx:622-633 |
| Deep link with an unknown id | Nothing happens: the id is applied only if the artifact exists | ArtifactsPanel.tsx:642-650 |
| Browser storage full | 'Not saved' label; artifacts vanish when the tab closes | ArtifactsPanel.tsx:703-710 |
| Sync failure | 'Sync retrying' with the error as tooltip; retry delay grows to five minutes | ArtifactsPanel.tsx:711-724; use-artifact-cloud-sync.ts:21-23 |
| Offline | not handled in the code beyond sync retry in the files opened; cards still show from local storage | use-artifact-cloud-sync.ts:21-23; artifacts-store.ts:591 |
| Accessibility | List role with label 'Artifacts'; Open/Hide has aria-expanded and a descriptive label; overlay panel is aria-modal with focus handling | InlineArtifactCards.tsx:44; ArtifactCard.tsx:160-167; ArtifactsPanel.tsx:674-680 |
| Download all fails | Toast with a user-readable message | InlineArtifactCards.tsx:77 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/InlineArtifactCards.test.tsx`: Card naming, Open then Hide, kind and extension line, published line, three-card cap with one row for the rest
- `apps/web/e2e/artifact-card-panel.spec.ts`: Browser flow: HTML artifact streams as a creating row, opens in the panel and leaves a card; panel stays closed on phone width with no sideways scroll
- `apps/web/features/chat/components/artifacts/ArtifactsPanel.test.tsx`: Streaming view, hand-off to the saved artifact, other conversation's stream hidden, sync status, fallback to first artifact
- `apps/web/features/chat/components/artifacts/ArtifactsPanel.mobileSheet.test.tsx`: Modal sheet on a phone viewport, docked with resize handle on wide, reopen on the selected artifact
- `apps/mobile/__tests__/InlineArtifactCardGeneratedFile.test.tsx`: Mobile card for generated pictures and files, share action
- `apps/mobile/__tests__/InlineArtifactCardDeck.test.tsx`: Mobile card for decks [inferred from file name; not opened]
- `apps/mobile/__tests__/LibraryArtifactOpen.test.tsx`: Opening an artifact from the library into the viewer
- `apps/extension/__tests__/side-panel-artifacts.test.ts`: Chrome card with Open and a download, Open turns into Hide, panel auto-opening, Escape close
- `apps/extension-vscode/src/__tests__/artifactsView.test.ts`: VS Code tree mapping, sign-in prompt, content re-derivation from the source message

**Test scenarios**

- **Open and hide on web**
  1. Ask for an HTML page
  2. Click Open on the card
  3. Click Hide on the same card
  4. Click the chat-header 'Open artifacts panel' toggle
  - Expected: Panel opens beside the chat, closes, then reopens on the same artifact; nothing is lost
- **More than three artifacts**
  1. Ask for five files in one reply
  2. Count cards
  3. Click '+2 more'
  4. Click 'Download all'
  - Expected: Three cards plus the button; fourth artifact opens; a zip of all five downloads with a ready toast
- **Reload**
  1. Open an artifact
  2. Reload the page
  3. Open the same conversation and click its card
  - Expected: The artifact still opens
- **Phone sheet on mobile**
  1. On the phone app ask for a document
  2. Tap the card
  3. Tap Close
  - Expected: Full-screen sheet opens then closes; the card remains
- **CLI listing**
  1. Sign in to Cloud mode
  2. Run 'agi artifacts list'
  3. Switch to Local mode and repeat
  - Expected: Cloud lists artifacts; Local refuses with a not-managed message

**Where to look when it fails**

- Web: logger lines 'Artifact persistence disabled: browser storage quota exhausted' (artifacts-store.ts:583)
- Web: header status 'Sync retrying' and its tooltip (ArtifactsPanel.tsx:717)
- CLI: CloudError::NotManaged and SignedOut (client.rs:362-378)
- Mobile: error 'Artifact persistence requires Local scope or a non-empty Cloud owner id' (store.ts:60)

**Hands-on test plans**

- Web: [70-qa/test-plans/web/026-artifact-container-and-panel.md](../../70-qa/test-plans/web/026-artifact-container-and-panel.md)
- Desktop: [70-qa/test-plans/desktop/026-artifact-container-and-panel.md](../../70-qa/test-plans/desktop/026-artifact-container-and-panel.md)
- Mobile: [70-qa/test-plans/mobile/026-artifact-container-and-panel.md](../../70-qa/test-plans/mobile/026-artifact-container-and-panel.md)
- CLI: [70-qa/test-plans/cli/026-artifact-container-and-panel.md](../../70-qa/test-plans/cli/026-artifact-container-and-panel.md)
- VS Code: [70-qa/test-plans/vscode/026-artifact-container-and-panel.md](../../70-qa/test-plans/vscode/026-artifact-container-and-panel.md)
- Chrome: [70-qa/test-plans/chrome/026-artifact-container-and-panel.md](../../70-qa/test-plans/chrome/026-artifact-container-and-panel.md)

## 10. Gaps and dependencies

- **Brief says CLI and VS Code have no card; confirmed. They have list and open commands only.** Affects: CLI, VS Code. Evidence: cloud/artifacts.rs:660-690; artifactsTree.ts:32-59. Work needed: Decide whether a terminal or editor needs an in-session notice that a turn made artifacts
- **Mobile has no '+N more' or 'Download all'** Affects: Mobile. Evidence: MessageBubble.tsx:2804-2812 maps every card with no cap or bulk action. Work needed: Add a bulk save control if parity is wanted
- **The web brief says reload keeps artifacts in browser storage only; the code also syncs to the account, so the brief wording is incomplete** Affects: Web, Desktop. Evidence: use-artifact-cloud-sync.ts:19-60; artifacts-store.ts:1054-1068. Work needed: Correct the brief; no code change
- **Panel open state is not kept across reload [inferred]** Affects: Web. Evidence: artifacts-store.ts:608-625 persists artifacts, versions and selection. Work needed: Confirm in a browser whether closed or open state survives a reload
- **Brief code line numbers are stale (InlineArtifactCards.tsx has 88 lines, brief cites :364)** Affects: Documentation. Evidence: InlineArtifactCards.tsx length 88. Work needed: Refresh the brief

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:local
- mode:cloud
- SYS-files-artifacts-and-storage
- SYS-sync-and-continuity
- SYS-chat-turn-pipeline
- SYS-shared-ui-and-design
- file:packages/platform/artifacts/src/artifact-store.ts
- api:POST /api/chat/sync
- api:GET /api/artifacts/index

## Unknown

- Whether the Tauri retained desktop card behaves like web (not opened)
- Server retention rules for synced artifacts
- Whether mobile shows any count or cap on cards beyond what MessageBubble.tsx:2804 shows
- Whether web panel-open state survives reload
- Chrome side panel behaviour in Local mode
