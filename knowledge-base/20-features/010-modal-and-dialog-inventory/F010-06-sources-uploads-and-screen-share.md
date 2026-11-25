---
id: "F010-06"
type: "feature"
title: "Sources, uploads and screen share"
aliases: ["Select sources", "Research sources", "Upload from device", "Add photos and files", "Screen sharing source", "Share a screen or window", "S10.16", "S10.17", "S10.35"]
area: "10 Modal and dialog inventory"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S10.16", "S10.17", "S10.35"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:local", "plan:free", "SYS-files-artifacts-and-storage", "SYS-chat-turn-pipeline", "SYS-connectors-plugins-and-skills", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "SYS-voice-and-media"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F010-06 Sources, uploads and screen share

Three input choices. Sources: before a research run starts, the person chooses sites, files and connected apps it may use (web and mobile). Upload: Add photos and files opens the device file chooser (all apps). Screen share: Electron shows a picker before any capture; the web composer's live-screen entry was not found mounted.

Area: [10. Modal and dialog inventory](README.md). Requirement items: [S10.16](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1016), [S10.17](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1017), [S10.35](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1035).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Sources limits what a Deep Research run may read. Upload attaches files from the device to the next message. Screen share lets the person pick a screen or window before anything is captured.

**Why it exists.** People want control over where an answer's evidence comes from, need to give the assistant their files, and must stay in control of what the screen capture sees. The brief states these three rules (doc: knowledge-base/data/area-briefs/010-modal-and-dialog-inventory.md, S10.16, S10.17, S10.35).

**Who uses it.** Anyone using chat; research sources apply to Deep Research users.

**Problems it solves**

- Research that reads unwanted sites.
- Getting a document into a chat.
- Accidentally exposing the wrong screen.

**Use cases**

- Restrict a research run to one site and never another.
- Attach a PDF and ask a question.
- Capture a screenshot for feedback by choosing a window.

## 2. User experience

**Where to find it**

- Web and desktop: Deep Research plan card 'Sources for this run' with 'Add a source' and options 'Only this site', 'Never this site', 'My files', 'Connected app' (apps/web/features/chat/components/research/ResearchActivity.tsx:198-204,676-760). It appears only while a plan awaits approval (ResearchActivity.tsx:459).
- Mobile: research plan options 'Sources' with a switch for 'My files, chats and reports', fields 'Only these sites', 'Never these sites', and 'Connected apps' (apps/mobile/src/features/chat/components/research/ResearchPlanOptions.tsx:258-340).
- Upload on web: plus menu row 'Add photos & files' opens a hidden file input labelled 'File upload' (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:147,906; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7010-7022).
- Upload on mobile: Add to chat sheet items Camera, Photos, 'Paste image', 'File' (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:696-722; apps/mobile/app/(app)/(tabs)/chat.tsx:1029-1046).
- Upload on Chrome: side panel attach menu 'Upload from device' (apps/extension/src/side_panel.ts:14670-14700; _locales spAttachUploadFromDevice).
- Upload on VS Code: menu 'Attach file…' and a dialog titled 'Attach Workspace Files to Chat' (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:6601; ChatStateManager.ts:3982-3990).
- Upload on CLI: the --file / -f flag attaches an image to a prompt (apps/cli/src/lib.rs:8351-8372).
- Screen share on desktop: when the web page asks for display capture, Electron shows 'Share a screen or window' with the message 'Choose what to share with <product name>' (apps/desktop/electron/main.ts:851-880).
- Web: the feedback dialog button 'Capture screen' calls the browser picker (apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:335-344).

**Before you start**

- Sources: a research plan that is awaiting approval (ResearchActivity.tsx:459) and a surface that can send.
- Upload: composer enabled; on restricted Free chat the file input is disabled unless the vision promotion applies (ChatComposerNew.tsx:7013-7015).
- Screen share: a trusted app page, a user gesture and a requested video track (main.ts:852-858); macOS screen recording permission for desktop screenshot paths (apps/desktop/electron/screenshot.ts:34-48).

**Screens and controls**

- Research source chips with a remove button 'Remove <label> from this research run' (ResearchActivity.tsx:700-715).
- Empty selection text 'Searching the whole web. Add a source to narrow it.' (ResearchActivity.tsx:688).
- Upload limits note 'Up to <n> files, <size> each' (ChatComposerNew.tsx:921).
- Native dialog buttons list screens first then windows, up to 12, plus 'Cancel' (apps/desktop/electron/garnishCore.ts:245-262; main.ts:864-880).

**Journey**

1. 1. Sources: a research plan appears; the person adds sites, files or connected apps, then presses Start; the choices go with the start decision.
2. 2. Upload: person opens the plus menu, chooses Add photos and files, picks files in the system chooser; previews and any refusals appear in the composer.
3. 3. Screen share: person asks to share; the native dialog lists screens and windows; choosing one starts capture, Cancel returns an empty answer and nothing is captured.

**What the person sees and gets**

- Research card text 'Sources for this run' with chips, and counts of searches and sources (ResearchActivity.tsx:370-400,686-715).
- Composer notices for refused files and the limits note 'Up to <n> files, <size> each' (ChatComposerNew.tsx:921,947-952).
- Mobile alert 'Failed to pick document. Please try again.' on a picker error (chat.tsx:1043-1046).
- Electron: native message box 'Share a screen or window'; on macOS a message explaining Screen Recording permission (main.ts:864-880; screenshot.ts:34-48).
- Feedback dialog preview of the captured screenshot (ComposerFeedbackDialog.tsx:135-150).

**Settings**

- Plan tier decides the attachment limits (ChatComposerNew.tsx:915-935).
- Connected apps list depends on the account's connector permissions and, on mobile, FEATURES.connectors (ResearchPlanOptions.tsx:212).
- macOS System Settings, Privacy and Security, Screen and System Audio Recording for the desktop app (screenshot.ts:34-48).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web sources: addResearchSource and researchSourceRequest turn the list into files, allowDomains, denyDomains and connectors; the request is sent with the Start decision (ResearchActivity.tsx:408-460,800-812; packages/contracts/types/src/research.ts:195-240). The server research loop reads those four settings (apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:530-540).
- Mobile has the same source choices in ResearchPlanOptions, with connected apps gated by FEATURES.connectors (ResearchPlanOptions.tsx:212,296-340).
- Web upload: hidden multiple file input, with accept list, passes picked files to handleFileDrop; limits come from plan tier and published limits (ChatComposerNew.tsx:905-960,7010-7022).
- Mobile upload: DocumentPicker with multiple files and mime filter (chat.tsx:1029-1046).
- Chrome upload: file input with multiple files and an accept list feeds acceptIncomingComposerFiles (side_panel.ts:14677-14700).
- VS Code attach: native open dialog for workspace files, requires a trusted workspace, and caps a batch (ChatStateManager.ts:3978-4000).
- CLI image attach: reads, decodes and re-encodes an image for the prompt (apps/cli/src/lib.rs:8351-8380).
- Desktop screen picker: Electron's display-media handler refuses unless the page is a trusted origin with a user gesture, drops unnamed helper windows, shows a native choice and returns only the chosen source (main.ts:851-880; garnishCore.ts:247-262).

**Incomplete**

- Sources UI exists only inside the research plan approval step; there is no standalone sources dialog (ResearchActivity.tsx:459,676-690).
- The Sources button on a message bubble opens a viewer for cited sources, not a chooser (apps/web/features/chat/components/research/ResearchPanel.tsx:604-630).
- Web screen capture found today is the feedback dialog's 'Capture screen' (ComposerFeedbackDialog.tsx:53-71,335-344). A 'Share live screen' item and a 'Take a screenshot' item exist in the shared AttachmentMenu (packages/ui/unified-chat/src/components/AttachmentMenu.tsx:692,726) but its mount in the web composer was not found, and apps/web imports of AttachmentMenu or ChatInput were not found.
- The Electron picker is a native message box rather than a thumbnail picker (main.ts:864-880).

**Present but disconnected or switched off**

- Shared unified-chat AttachmentMenu 'Share live screen' and 'Take a screenshot' (packages/ui/unified-chat/src/components/AttachmentMenu.tsx:613-660,726); consumer on web not found. Desktop internal connectionStore uses getDisplayMedia for pairing (apps/desktop/src/stores/connectionStore.ts:623) and is internal Tauri code.

**Not available**

- Sources chooser on CLI, VS Code and Chrome: not found.
- Screen share on mobile, CLI, VS Code and Chrome: not found in this review (Chrome has an in-page screenshot capture path in side_panel.ts around 14640; not a share picker).
- Standalone Sources dialog for ordinary (non-research) answers: not found.

## 4. Required behaviour

**Established requirements**

- A dialog lets the user choose which sources (sites, files, apps) an answer or research run may use. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.16)
- Choosing upload opens the device file chooser and the picked files attach to the message. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.17)
- When sharing the screen, the user picks which screen or window to share before anything is captured. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.35)
- The server enforces research domain rules at ingestion, files are searched only when asked for, and connectors are read only while permissions allow. (source: (doc comment: apps/web/features/chat/components/research/ResearchActivity.tsx:150-158))

**Acceptance criteria**

1. A research run started with Only this site reads only that domain.
2. A run with Never this site excludes that domain.
3. 'My files' off means files are not searched.
4. Add photos and files opens the system chooser and attached files appear in the composer.
5. Files above the plan limit are refused with a message.
6. No screen content is captured before a screen or window is chosen; Cancel captures nothing.
7. Mobile source choice matches web.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Source choice applies to the next research run, not to ordinary chat turns [inferred from the choice being tied to the plan Start decision].
- Upload limits are subscription-driven [inferred from composerAttachmentLimits taking the billing tier].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Mount a screen share entry in the web composer or remove the unused menu item.
- [proposed] Offer a standalone Sources control for non-research answers if the brief's 'an answer' wording is kept.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ResearchActivity | `apps/web/features/chat/components/research/ResearchActivity.tsx` | Web research plan and source chooser |
| service | research source helpers | `packages/contracts/types/src/research.ts` | addResearchSource, researchSourceKey, researchSourceRequest, FILES_RESEARCH_SOURCE |
| service | research-loop | `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts` | Server applies files, allow and deny domains and connectors |
| component | ResearchPlanOptions (mobile) | `apps/mobile/src/features/chat/components/research/ResearchPlanOptions.tsx` | Mobile source switches and domain lists |
| service | researchPlanChoices | `apps/mobile/src/features/chat/utils/researchPlanChoices.ts` | Mobile choices state (file exists; contents not read) |
| component | ComposerPlusMenu | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | 'Add photos & files' row |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Hidden file input, attachment limits, useAttachments |
| component | AddToChatSheet | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Mobile Camera, Photos, File entries |
| screen | Mobile chat tab | `apps/mobile/app/(app)/(tabs)/chat.tsx` | DocumentPicker handler handleSheetFile |
| component | Chrome attach menu | `apps/extension/src/side_panel.ts` | Upload from device item and file input |
| service | VS Code attach | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Workspace file picker and attachFiles handling |
| command | agi --file | `apps/cli/src/lib.rs` | CLI image attachment |
| config | setDisplayMediaRequestHandler | `apps/desktop/electron/main.ts` | Electron screen or window picker and trust checks |
| service | pickableCaptureSources | `apps/desktop/electron/garnishCore.ts` | Filters and limits capture sources |
| component | ComposerFeedbackDialog | `apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx` | Web screen capture through the browser picker |
| component | AttachmentMenu (shared) | `packages/ui/unified-chat/src/components/AttachmentMenu.tsx` | Shared menu with screenshot and live screen items |
| service | visual-session-capture | `packages/contracts/types/src/visual-session-capture.ts` | Live source sampler and denied/busy messages |
| service | screenshot (Electron) | `apps/desktop/electron/screenshot.ts` | Screen and window capture to chat with permission explanation |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person edits the source list in the research plan card; it exists only in component state until Start. | device | ResearchActivity.tsx:408-460 |
| Start sends the sources with the plan decision; the server research loop applies domain, file and connector filters to every source. | our servers | ResearchActivity.tsx:800-812; research-loop.ts:530-540 |
| The research run calls search and model services; which search provider and model: see research loop. | outside service | apps/web/app/__tests__/published-safety-claims.test.ts:560-566 asserts the subprocessor page names a search recipient |
| Upload: the browser file chooser returns files to the device; useAttachments checks count and size limits, then upload goes to the account's storage when the message is sent. | device and our servers | ChatComposerNew.tsx:905-960,7010-7022; ComposerPlusMenu.tsx:147 retention note 'Saved to your Library until you delete them' |
| Screen share: the page requests display media; Electron checks gesture and origin, lists sources, shows the native dialog and returns only the chosen source. | device | apps/desktop/electron/main.ts:851-880 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Source choices | component state, then the research run request | Sent to our servers on Start | Not persisted by the chooser itself |
| Uploaded files | Library storage in the account unless the chat is temporary | Yes | Kept until deleted; deleted files restorable for the recovery window; temporary chats keep them out of the Library (ComposerPlusMenu.tsx:155-158) |
| Screen capture frames | device memory; a feedback screenshot is sent with feedback | Only when the person sends feedback | Screenshot may be dropped by the server (ComposerFeedbackDialog.tsx:205-209) |

**Models and providers.** Research runs use the platform's model routing and a search provider outside the chooser; the chooser itself does not select a model. Which models can read uploaded images is decided elsewhere (SYS-model-catalog-and-routing). Local models on device: unknown for research sources.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Research and uploads to the account need sign-in. Chrome and CLI need their own sign-in. Local mobile attachments stay on the device. |
| Permissions | Connectors are read only while the account's connector permissions allow (ResearchActivity.tsx:150-158). Desktop screen capture needs the operating system screen permission (screenshot.ts:34-48). VS Code attach needs a trusted workspace (ChatStateManager.ts:3978). |
| Subscription | Attachment count and size limits depend on plan tier (ChatComposerNew.tsx:915-935). Research has a credit estimate shown in the plan (ResearchActivity.tsx:380-400). Free restricted chat disables the file input unless a vision promotion applies (ChatComposerNew.tsx:7013). |
| Limits and metering | Up to maxFilesPerMessage, maxFileBytes, maxImageBytes and maxMessageBytes (ChatComposerNew.tsx:942-950). Research shows searches against a maximum and credits (ResearchActivity.tsx:370-395). Domain list max 32 on mobile (ResearchPlanOptions.tsx:25). |
| Feature flags | FEATURES.connectors gates the connected-apps list on mobile (ResearchPlanOptions.tsx:212). Others: none found. |
| Model compatibility | Whether a chosen model accepts images or PDFs is not decided by the upload row; compatibility notices are covered elsewhere (unknown for this feature). |
| Provider restrictions | none found in the code |
| Local mode | Mobile Local mode: uploads attach on device; research sources need the cloud research run (unknown whether research is offered in Local). Screen share is a desktop and web page feature using the hosted web app. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No sources chosen | Whole web search, stated in the card. | ResearchActivity.tsx:688 |
| Invalid domain | Add is disabled when the domain cannot be parsed. | ResearchActivity.tsx:415-422 |
| Duplicate source | Ignored by the key check. | packages/contracts/types/src/research.ts:197-210 |
| Upload refused | Refusals appear in the composer notice with limits text. | ChatComposerNew.tsx:947-952 |
| Picker cancelled (mobile) | Returns no attachments silently. | chat.tsx:1041-1042 |
| Picker error (mobile) | Alert 'Error: Failed to pick document. Please try again.' | chat.tsx:1043-1046 |
| Screen picker with no sources or untrusted origin | Handler answers empty, so nothing is captured. | main.ts:852-863 |
| Screen picker Cancel | Callback receives an empty result. | main.ts:876-880 |
| Camera or screen blocked or in use | Messages say access was blocked or the camera is in use. | packages/contracts/types/src/visual-session-capture.ts:38-60 |
| Screen recording permission denied on macOS | A native message explains how to enable it. | apps/desktop/electron/screenshot.ts:34-48 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/AddToChat.test.tsx`: Mobile Add to chat sheet (inferred from file name)
- `apps/mobile/__tests__/FileUploadLifecycle.test.tsx`: Mobile upload lifecycle (inferred)
- apps/web/features/projects/components/__tests__/AddSourcesModal.test.tsx (not found) (not found): Project sources modal (not research sources; inferred)
- `packages/ui/unified-chat/src/components/__tests__/AttachmentMenu.liveVisual.test.tsx`: Live visual items in the shared menu (inferred)
- `packages/contracts/types/src/__tests__/visual-session-capture.test.ts`: Live source sampler (inferred)
- `apps/desktop/electron/__tests__/deepLink.test.ts`: Electron main with a mocked setDisplayMediaRequestHandler and desktopCapturer (mock setup seen; picker assertions unknown)
- `apps/web/app/__tests__/published-safety-claims.test.ts`: Asserts the feedback screenshot uses getDisplayMedia (read, lines 558-566)

**Test scenarios**

- **Restrict research to one site**
  1. Start Deep Research.
  2. In the plan add Only this site: example.com.
  3. Press Start.
  - Expected: Report cites only that domain.
- **Never a site**
  1. Add Never this site for a domain.
  2. Start.
  - Expected: No citation from that domain.
- **Upload limit**
  1. Open Add photos and files.
  2. Pick more files than the plan allows.
  - Expected: Extra files are refused with the limits note.
- **Mobile upload**
  1. Open Add to chat, choose File, pick two files.
  - Expected: Both attach; cancel returns without error.
- **Desktop screen picker**
  1. In the Electron app, press Capture screen in the feedback dialog.
  2. Choose a window; repeat and choose Cancel.
  - Expected: Only the chosen window is captured; Cancel captures nothing.
- **Free restricted chat**
  1. Use a Free account in restricted chat.
  2. Try Add photos and files.
  - Expected: File input is disabled unless the vision promotion applies.

**Where to look when it fails**

- Composer notice text from useAttachments onError.
- Console warnings prefixed [screenshot] in the desktop main process.
- Research run events and sources counts (ResearchActivity.tsx:380-395).
- Visual source error states denied, busy, unavailable.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/web/010-modal-and-dialog-inventory.md)
- Desktop: [70-qa/test-plans/desktop/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/desktop/010-modal-and-dialog-inventory.md)
- Mobile: [70-qa/test-plans/mobile/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/mobile/010-modal-and-dialog-inventory.md)
- CLI: [70-qa/test-plans/cli/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/cli/010-modal-and-dialog-inventory.md)
- VS Code: [70-qa/test-plans/vscode/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/vscode/010-modal-and-dialog-inventory.md)
- Chrome: [70-qa/test-plans/chrome/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/chrome/010-modal-and-dialog-inventory.md)

## 10. Gaps and dependencies

- **Web screen share: only the feedback screenshot is wired in the files read; the composer menu items in the shared AttachmentMenu have no found web consumer.** Affects: Web and Electron desktop. Evidence: ComposerFeedbackDialog.tsx:53-71; packages/ui/unified-chat/src/components/AttachmentMenu.tsx:692,726; apps/web/features/chat/pages/WebChatPage.tsx (no import found). Work needed: Find or build the composer entry, or correct the brief.
- **Sources are chosen only at research plan approval, not for every answer.** Affects: Web, desktop, mobile. Evidence: ResearchActivity.tsx:459,676-690. Work needed: Decide whether the brief's 'an answer' needs a general control.
- **Brief says mobile sources are missing; mobile has them.** Affects: Documentation. Evidence: apps/mobile/src/features/chat/components/research/ResearchPlanOptions.tsx:258-340. Work needed: Update brief.
- **Brief pointers to ChatComposerNew.tsx:1098/1832/1947/4919 and main.ts:642/652 do not match the screen-share code, which sits at main.ts:851-880.** Affects: Documentation. Evidence: apps/desktop/electron/main.ts:851-880. Work needed: Correct the code references.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- mode:local
- plan:free
- SYS-files-artifacts-and-storage
- SYS-chat-turn-pipeline
- SYS-connectors-plugins-and-skills
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- SYS-voice-and-media

## Unknown

- Whether any web composer control starts live screen sharing (the shared AttachmentMenu consumer was not found in apps/web).
- Whether research sources work in mobile Local mode.
- Which search provider and model serve research sources (not read beyond the loop settings).
- Why brief pointers (ChatComposerNew.tsx:1098 and others) differ from the files read.
- Test contents (only names seen).
- Whether Chrome offers any screen-share picker beyond its screenshot capture path.
