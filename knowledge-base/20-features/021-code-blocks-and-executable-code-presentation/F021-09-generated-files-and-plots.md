---
id: "F021-09"
type: "feature"
title: "Generated files and plots"
aliases: ["Generated files", "Generated-file output", "Plots", "Plot 1, Plot 2", "Code Execution plots", "answer files (Chrome)"]
area: "21 Code blocks and executable code presentation"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "missing", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S21.19", "S21.20"]
depends_on: ["F021-07", "F021-08", "SYS-files-artifacts-and-storage", "SYS-chat-turn-pipeline", "SYS-data-model-and-migrations", "SYS-shared-ui-and-design", "surface:web", "surface:mobile", "surface:chrome", "surface:desktop", "file:packages/ui/unified-chat/src/lib/code-execution-result.ts", "api:POST /api/chat/conversations/[id]/code-runs"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F021-09 Generated files and plots

Shows files a run produced and plots drawn by the code. Web lists generated files under the reply and can draw safe inline images as Plot 1, Plot 2. Mobile draws stored plot files under the output; Chrome lists files. Plots inline from the live web stream are not filled by the code read.

Area: [21. Code blocks and executable code presentation](README.md). Requirement items: [S21.19](../../10-requirements/capabilities/021-code-blocks-and-executable-code-presentation.md#s2119), [S21.20](../../10-requirements/capabilities/021-code-blocks-and-executable-code-presentation.md#s2120).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |
| VS Code | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lists files the sandbox created and shows chart images inline, numbered in order (apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:113-123).

**Why it exists.** Many code answers are charts or files such as spreadsheets; seeing them in chat is the point of running code. [inferred]

**Who uses it.** Users running data analysis or file-making code.

**Problems it solves**

- Charts show in the chat instead of a path.
- Files can be opened or downloaded.
- Unsafe image data is blocked.

**Use cases**

- Plot a chart with a script.
- Create a spreadsheet and download it.
- Re-run code on mobile and see the new plot.
- Open a plot full screen on mobile.

## 2. User experience

**Where to find it**

- Web: Plot N images in the Code Execution panel (CodeExecutionBlock.tsx:113-123); generated files under the reply from message metadata generatedFiles (apps/web/features/chat/components/messages/MessageBubble.tsx:1524-1525).
- Desktop: web app in Electron; the internal Tauri build uses the shared panel with Plot N (packages/ui/unified-chat/src/components/CodeExecutionOutput.tsx:116-127).
- Mobile: Plot N headings under the output (apps/mobile/src/features/chat/components/CodeExecutionPlots.tsx:64-66; CodeExecutionBlock.tsx:198-200); a tap opens the plot full screen (apps/mobile/__tests__/CodeExecutionPlots.test.tsx, test title).
- Mobile re-run: images drawn under Output with the label Code output N (CodeRunAgain.tsx:188-200).
- Chrome: answer file list under the reply (apps/extension/src/features/side-panel/bubbles.ts:729-731).
- CLI and VS Code: the brief says files are listed; the code was not confirmed here (brief S21.19).

**Before you start**

- A run that wrote a file or a figure.
- For web files: the turn must send x_generated_files (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1393-1405).
- Mobile plots need the app signed in to fetch stored images (CodeExecutionPlots.tsx:28).

**Screens and controls**

- Image under heading Plot N with alt text Code execution output N (web).
- Mobile 4:3 placeholder until load, Retry button on failure, Sign in message when signed out (CodeExecutionPlots.tsx:25-38, :106-119).
- File list with open or download (web ArtifactPreview, brief S21.19; not opened).

**Journey**

1. 1. Code runs and writes a figure or file.
2. 2. The server sends file descriptors in x_generated_files; up to 20 per turn are saved (assistant-turn-sources.ts:88).
3. 3. The client attaches them to the message (web MessageBubble.tsx:1524).
4. 4. The reply shows the file list and plots.
5. 5. Person opens or downloads a file.

**What the person sees and gets**

- Heading Plot 1, Plot 2 (CodeExecutionBlock.tsx:115; mobile CodeExecutionPlots.tsx:64-66).
- Mobile: This image could not be loaded. with Retry; Sign in to view this generated image (CodeExecutionPlots.tsx:27-28).
- Unsafe web images are dropped with no message (CodeExecutionBlock.tsx:40-44).

**Settings**

- none found

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web inline image rule: only gif, jpeg, png, webp with valid base64 are shown (CodeExecutionBlock.tsx:20-33).
- Web and shared panels number plots in order (CodeExecutionBlock.tsx:113-123; CodeExecutionOutput.tsx:116-127).
- Internal desktop maps images from the stream result (apps/desktop/src/runtime/cloudStreamDeltas.ts:259-268).
- Server persists up to 20 generated file descriptors per turn (assistant-turn-sources.ts:88).
- Managed sandbox returns PNG figures from notebook results in pngResults (apps/web/lib/e2b/runtime.ts:1246-1252).
- Mobile re-run returns images and draws them through the shared image rule (CodeRunAgain.tsx:188-200; packages/contracts/cloud-contracts/src/chat-code-runs.ts:25-30).
- Mobile draws stored png and jpeg plot files under the output and leaves svg files as cards (CodeExecutionPlots.tsx:25, :40-47; test title).
- Chrome parses and lists generated files (freeTrialClient.ts:1130; bubbles.ts:729-731).

**Incomplete**

- The web live stream builds the result with only stdout, stderr and returnCode, so the panel's images field is not filled by that path (useChatStream.ts:3598-3603). The store type allows images (web-chat-store.ts:394). Which web path fills plots from a run: not established.
- The mobile stream mapper drops images (apps/mobile/stores/chat/codeExecutionResult.ts:9-17).
- Failed or unsafe image data is skipped with no notice on web (CodeExecutionBlock.tsx:42-43).

**Present but disconnected or switched off**

- Mobile CodeExecutionBlock accepts result.images, but the mapper that feeds it never sets them (CodeExecutionBlock.tsx:76-80; codeExecutionResult.ts:13-17).

**Not available**

- Chrome: no inline plots (freeTrialClient.ts:879-908 parses text only).
- CLI and VS Code: inline plots not found in the code read (the VS Code body is text: webviewContent.ts:8950-8957).

## 4. Required behaviour

**Established requirements**

- Files produced by execution are listed and can be opened or downloaded. (source: brief S21.19)
- Plots and images produced by execution render inline. (source: brief S21.20)

**Acceptance criteria**

1. A run that writes a file adds it to the reply's file list with open or download.
2. A png plot appears under a heading Plot 1 with alt text; a second appears as Plot 2.
3. An image with a non-raster type or invalid base64 does not render and does not break the panel.
4. On mobile, an unloadable plot shows This image could not be loaded. and Retry reloads it.
5. On mobile, signed out shows the sign-in message with no Retry.
6. At most 20 generated files are saved per turn.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Image data must never become a navigable URL beyond a data URL for safe types [inferred from the code comment at CodeExecutionBlock.tsx:116].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show a small notice when an image is skipped.
- [proposed] Populate inline plots on web from the managed sandbox's figure results.
- [proposed] Show plots on Chrome, CLI and VS Code or link them as files.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | CodeExecutionBlock (web) | `apps/web/features/chat/components/messages/CodeExecutionBlock.tsx` | safeExecutionImageSrc and Plot N |
| service | safeExecutionImageSrc (shared) | `packages/ui/unified-chat/src/lib/code-execution-result.ts` | Same image rule shared by desktop and mobile |
| component | CodeExecutionOutput (shared) | `packages/ui/unified-chat/src/components/CodeExecutionOutput.tsx` | Plot N in the shared panel |
| service | desktop stream deltas | `apps/desktop/src/runtime/cloudStreamDeltas.ts` | Reads images from the code result |
| hook | useChatStream | `apps/web/lib/hooks/useChatStream.ts` | Builds the result without images (3598-3603) |
| service | tool loop generated files | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | generatedFilesEvent emits x_generated_files (1393-1405) |
| service | generated files (server) | `apps/web/lib/e2b/generated-files.ts` | Prepares sandbox files for the reply (by file name) |
| service | E2B runtime | `apps/web/lib/e2b/runtime.ts` | pngResults from notebook results (1246-1252) |
| service | python figure provenance | `apps/web/lib/e2b/python-figure-provenance.ts` | Marks figures made by Python (by file name) |
| service | assistant turn sources | `apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-sources.ts` | MAX_PERSISTED_TURN_GENERATED_FILES = 20 |
| component | MessageBubble (web) | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Reads generatedFiles metadata (1524) |
| component | ArtifactPreview (web) | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | File preview per brief (line 818, not opened) |
| component | CodeExecutionPlots (mobile) | `apps/mobile/src/features/chat/components/CodeExecutionPlots.tsx` | Stored plot files, retry, sign-in message |
| component | CodeExecutionBlock (mobile) | `apps/mobile/src/features/chat/components/CodeExecutionBlock.tsx` | Inline plot from result.images |
| component | CodeRunAgain | `apps/mobile/src/features/chat/components/CodeRunAgain.tsx` | Draws re-run images |
| schema | chat code run response | `packages/contracts/cloud-contracts/src/chat-code-runs.ts` | images array of strings |
| endpoint | POST code-runs | `apps/web/app/api/chat/conversations/[id]/code-runs/route.ts` | Returns images from pngResults |
| component | bubbles (Chrome) | `apps/extension/src/features/side-panel/bubbles.ts` | buildAnswerFiles under the reply |
| component | generatedFiles (Chrome) | `apps/extension/src/features/side-panel/generatedFiles.ts` | Answer file access and previews (by file name) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The sandbox runs code that writes files or draws a figure; PNG figures come back from notebook results. | outside service | apps/web/lib/e2b/runtime.ts:1246-1252 |
| The server stages output files and emits their descriptors in the stream. | our servers | tool-loop.ts:1393-1405; assistant-turn-sources.ts:88 |
| The client attaches descriptors to the message and draws the list and plots; images are checked by type and base64 before drawing. | device | MessageBubble.tsx:1524; CodeExecutionBlock.tsx:28-33 |
| Opening a file downloads it from storage (mobile signs in to fetch stored images). | device and our servers | CodeExecutionPlots.tsx:77-84, :27-28 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Generated file bytes | Server file storage; the exact bucket or table: unknown | yes, via the account [inferred] | unknown |
| Generated file descriptors (up to 20 per turn) | Saved with the turn on the server and in message metadata | yes for web and mobile accounts [inferred] | kept with the conversation [inferred] |
| Inline plot data (base64) | Message metadata in memory and the saved row when present | unknown | unknown |

**Models and providers.** Plot drawing is done by the code and the sandbox, not the model. The model's tool choice decides whether code writes a file. Sandbox figures are not tied to one provider (execution-tools.ts:207-209).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Mobile needs sign-in to load stored images (CodeExecutionPlots.tsx:28). Web file access follows the conversation owner [inferred]. |
| Permissions | none found in the code for display. |
| Subscription | Follows the run's entitlements (F021-07). Large chat file quotas exist per plan, such as dailyChatFileUploadBytes (packages/contracts/types/src/billing-catalog.ts:669-670); whether they apply to generated outputs: unknown. |
| Limits and metering | 20 file descriptors saved per turn (assistant-turn-sources.ts:88). |
| Feature flags | none found in the code. |
| Model compatibility | none found in the code beyond needing a run. |
| Provider restrictions | none found in the code. |
| Local mode | Mobile Local mode has no managed run so no generated plots. The internal Tauri desktop has local code tools (apps/desktop/src-tauri/src/core/llm/tool_executor/code_tools.rs, found by search; not opened). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unsafe image | Dropped silently | CodeExecutionBlock.tsx:40-44 |
| Loading plot (mobile) | Grey 4:3 placeholder | CodeExecutionPlots.tsx:26, :89-98 |
| Plot load error | Message and Retry | CodeExecutionPlots.tsx:27, :36 |
| Signed out | Sign-in message without Retry | CodeExecutionPlots.tsx:28, :34 |
| Invalid plot path | This image could not be loaded., no Retry | CodeExecutionPlots.tsx:35 |
| Accessibility | Alt text Code execution output N; mobile accessibilityLabel Retry Plot N | CodeExecutionBlock.tsx:119; CodeExecutionPlots.tsx:111 |
| Offline | not handled specifically for plots in the code read | CodeExecutionPlots.tsx maps only signed-out, invalid and error statuses (lines 30-38) |
| Many files | Only the first 20 descriptors per turn are saved | assistant-turn-sources.ts:88 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/e2b/__tests__/generated-files.test.ts`: Generated file handling (by file name)
- `apps/web/lib/e2b/__tests__/png-render-identity.test.ts`: PNG render identity (by file name)
- `apps/web/lib/e2b/__tests__/python-figure-provenance.integration.test.ts`: Python figure provenance (by file name)
- `apps/mobile/__tests__/CodeExecutionPlots.test.tsx`: Plot filtering, placeholder, retry, sign-in, numbering, full screen
- `apps/mobile/__tests__/CodeExecutionPlotsInChat.test.tsx`: Plots in chat (by file name)
- `apps/mobile/__tests__/CodeRunAgainOutcome.test.tsx`: Re-run plots drawn through the shared image rule
- `packages/ui/unified-chat/src/components/__tests__/MessageBubble.codeExecution.test.tsx`: Unsafe images dropped

**Test scenarios**

- **Plot a chart**
  1. Ask for a bar chart with code and Run code on.
  - Expected: A Plot 1 image or a generated file appears under the output.
- **Two plots**
  1. Ask for two charts.
  - Expected: Plot 1 and Plot 2 in order.
- **Unsafe image**
  1. Feed a result with an svg media type (test harness).
  - Expected: Nothing drawn, no crash.
- **File download**
  1. Ask the assistant to make a CSV with code.
  2. Open the file in the list.
  - Expected: File opens or downloads.
- **Mobile signed-out plot**
  1. Sign out, open an old chat with a stored plot.
  - Expected: Sign in to view this generated image.
- **Chrome file list**
  1. Run a cloud turn that makes a file in the side panel.
  - Expected: File appears under the reply.

**Where to look when it fails**

- Server: x_generated_files events in the stream.
- Client: message.metadata.generatedFiles.
- Mobile: testIDs code-execution.plot-failed and code-execution.plot-retry (CodeExecutionPlots.tsx:90, :108).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/web/021-code-blocks-and-executable-code-presentation.md)
- Desktop: [70-qa/test-plans/desktop/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/desktop/021-code-blocks-and-executable-code-presentation.md)
- Mobile: [70-qa/test-plans/mobile/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/mobile/021-code-blocks-and-executable-code-presentation.md)
- Chrome: [70-qa/test-plans/chrome/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/chrome/021-code-blocks-and-executable-code-presentation.md)

## 10. Gaps and dependencies

- **Web live path never sets images on the result** Affects: Web, desktop (Electron). Evidence: useChatStream.ts:3598-3603. Work needed: Confirm which path shows plots from a managed run and wire figures into the panel or the file list.
- **Mobile mapper drops images** Affects: Mobile. Evidence: apps/mobile/stores/chat/codeExecutionResult.ts:13-17. Work needed: Pass images through.
- **No notice when an image is skipped** Affects: Web. Evidence: CodeExecutionBlock.tsx:42-43. Work needed: Show a short line.
- **Chrome, CLI, VS Code do not show plots** Affects: Chrome, CLI, VS Code. Evidence: freeTrialClient.ts:879-908; webviewContent.ts:8950. Work needed: Add image or file link display.
- **Brief says mobile plots missing; code shows plots exist** Affects: Documentation. Evidence: CodeExecutionPlots.tsx; CodeRunAgain.tsx:188-200. Work needed: Correct the brief rows.
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- F021-07
- F021-08
- SYS-files-artifacts-and-storage
- SYS-chat-turn-pipeline
- SYS-data-model-and-migrations
- SYS-shared-ui-and-design
- surface:web
- surface:mobile
- surface:chrome
- surface:desktop
- file:packages/ui/unified-chat/src/lib/code-execution-result.ts
- api:POST /api/chat/conversations/[id]/code-runs

## Unknown

- Which web path puts plots into the Code Execution panel.
- Where generated file bytes are stored and how long they are kept.
- Open and download controls for generated files on CLI and VS Code: the brief says done; the cited lines were not confirmed.
- How web ArtifactPreview presents generated files (not opened).
- Whether Electron desktop differs from web.
