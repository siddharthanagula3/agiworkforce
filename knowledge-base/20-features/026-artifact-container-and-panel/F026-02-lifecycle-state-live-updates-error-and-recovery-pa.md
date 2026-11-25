---
id: "F026-02"
type: "feature"
title: "Lifecycle state, live updates, error and recovery panels"
aliases: ["Streaming artifact view", "Writing...", "Stopped artifact", "Interrupted notice", "Render error panel", "Loading preview", "Dependency loading state"]
area: "26 Artifact container and panel"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "missing", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S26.04", "S26.35", "S26.36", "S26.39"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:local", "mode:cloud", "SYS-chat-turn-pipeline", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "file:infrastructure/sandbox/index.html", "F026-01", "F026-03"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F026-02 Lifecycle state, live updates, error and recovery panels

Shows whether an artifact is being written, finished, stopped early or failed to render. Web and Chrome show a live view that grows as text arrives. Web adds a banner for a stopped artifact, an error panel with View source and Retry, and a loading state. Mobile shows 'Writing…', 'Failed' or 'Stopped' on its card. CLI has none.

Area: [26. Artifact container and panel](README.md). Requirement items: [S26.04](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2604), [S26.35](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2635), [S26.36](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2636), [S26.39](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2639).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Marks each artifact as writing, finished, stopped or failed, updates the view live while text arrives, and replaces a broken preview with a message and a way forward (ArtifactPreview.tsx:3228-3253).

**Why it exists.** Models take time to write a page, replies can be cut off, and previews can fail. A silent blank would look like a bug. The product contract asks for a repairable error on invalid generated content (doc: docs/product/experience-contract.md:782).

**Who uses it.** Anyone watching an artifact being generated or opening one that was stopped or cannot run.

**Problems it solves**

- No blank frame while a library loads
- A stopped reply is not mistaken for a complete file
- A failed render offers source and retry

**Use cases**

- Watch a page's code appear in the panel while the reply streams
- Open an artifact from a stopped reply and read the banner
- See 'This artifact couldn't be rendered.' and press Retry
- Wait while the sandbox loads the React runtime

## 2. User experience

**Where to find it**

- Web and Desktop: the artifacts panel streaming view header 'Writing…' (StreamingArtifactView.tsx:49); tab with a pulsing dot (ArtifactsPanel.tsx:785-801); viewer banner (ArtifactPreview.tsx:2961-2975)
- Mobile: card state label 'Writing…', 'Failed' or 'Stopped' (StreamingArtifactCard.tsx:65,134-141); preview error and loading in the full-screen viewer (SafeArtifactPreview.tsx:224-260,304-323)
- Chrome: panel status text while the preview starts or fails (artifactPanel.ts:820,847)
- VS Code: none for status; documents open when ready (artifactActions.ts:104-135)

**Before you start**

- A reply that is writing an artifact fence, or a saved artifact marked interrupted, or a preview that errors

**Screens and controls**

- Streaming view: title, type label, 'Writing…' status, auto-scrolling code (StreamingArtifactView.tsx:33-66)
- Banner 'This artifact was saved from a partial response. It may not include later output.' (ArtifactPreview.tsx:223-224)
- Error panel: 'This artifact couldn't be rendered.', the reason, 'View source' and 'Retry' (ArtifactPreview.tsx:3238-3252)
- PDF and image fallbacks with 'Retry' and 'Download' (ArtifactPreview.tsx:2027-2048,2076-2090)
- Loading text 'Loading preview…' (SandboxedIframe.tsx:388) and PreviewFrameLoading (ArtifactPreview.tsx:369)
- Mobile error: 'This preview stopped with an error.' with Retry and View source; 'This preview did not finish loading.' after 20 seconds (SafeArtifactPreview.tsx:34-37,235-258)
- Mobile card notice 'Stopped before it finished. Regenerate for the whole document.' (StreamingArtifactCard.tsx:22-23)

**Journey**

1. Send a request that makes an artifact
2. The panel opens by itself on wide screens and shows the code as it streams (use-streaming-artifact.ts:112-120)
3. When the fence closes the saved artifact replaces the streaming view under the same id
4. If the reply ended with the fence open, the partial text is kept as 'Stopped artifact' and the banner shows (use-streaming-artifact.ts:68-78)
5. If the preview errors, read the message and press View source or Retry
6. On mobile, tap the card while it writes to read the partial text

**What the person sees and gets**

- 'Writing…' with a pulsing dot
- Toast 'New partial output was not saved over the existing artifact.' or 'New partial output was not saved.' when a stopped fragment cannot be kept (use-streaming-artifact.ts:79-86)
- Warning banner for a stopped artifact; different wording when the reply is awaiting approval (ArtifactPreview.tsx:2970-2972)

**Settings**

- none found

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: streaming store entry, live view, auto-open once per reply unless the reader closed it (use-streaming-artifact.ts:90-120)
- Web: partial artifact retained as interrupted (artifacts-store.ts:694-700 and use-streaming-artifact.ts:68-78)
- Web: interrupted banner, render error panel, PDF and image fallbacks, loading frame (ArtifactPreview.tsx:2961,3228,2027,2065,3255)
- Web: sandbox reports errors and times out into a fallback (SandboxedIframe.tsx:37-38; index.html:910-923)
- Mobile: stream card, stopped notice, preview error, 20 second timeout and loading indicator (StreamingArtifactCard.tsx; SafeArtifactPreview.tsx:195-206,304-323)
- Chrome: streaming flag, 'Starting the preview…' and failure text, fallback to source (artifactPanel.ts:708-713,820,847)

**Incomplete**

- Mobile 'failed' only reflects a stream error flag on the message (StreamingArtifactCard.tsx:65); render failures are handled separately in the preview
- Brief says mobile is missing a dependency-loading state; code has a loading indicator and timeout, but only when the viewer asks for it (showsLoading, SafeArtifactPreview.tsx:83,191,304)

**Present but disconnected or switched off**

- nothing found

**Not available**

- CLI and VS Code have no lifecycle state for artifacts (artifacts are read after the fact, cloud/artifacts.rs:400-450)
- Chrome shows no stopped-artifact banner in the code opened [inferred from artifactPanel.ts having a 'streaming' flag only, lines 298-306]

## 4. Required behaviour

**Established requirements**

- The artifact shows its lifecycle state: being written, finished, stopped before it finished, or failed (S26.04) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.04)
- When an artifact fails while rendering or running, the viewer replaces it with an error panel offering source or retry (S26.35) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.35)
- While runtime or libraries load, the viewer shows a loading state and a failed load is reported (S26.36) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.36)
- While a reply is still producing an artifact the view updates live (S26.39) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.39)
- Invalid generated content produces a repairable error; failed edits keep the previous version (source: doc: docs/product/experience-contract.md:782)

**Acceptance criteria**

1. Web: while a reply streams an HTML fence the panel shows 'Writing…' and the code grows
2. Web: when the fence closes the same artifact shows as a saved artifact, not a duplicate
3. Web: stop a reply mid-fence; the artifact opens with the partial-response banner
4. Web: an HTML artifact that throws shows 'This artifact couldn't be rendered.' with 'View source' and 'Retry'
5. Web: a corrupt PDF shows 'This PDF couldn't be displayed.' with Retry and Download
6. Mobile: a card for a stopped reply shows 'Stopped' and the regenerate notice
7. Mobile: a preview that never loads shows 'This preview did not finish loading.' with Retry after 20 seconds
8. While the React runtime loads the viewer shows loading text, and a script load failure shows 'The React runtime could not be loaded from <address>'

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Failure of the cloud sync is not an artifact failure and is shown separately as 'Sync retrying' (ArtifactsPanel.tsx:711-724)

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the same stopped banner in the Chrome side panel
- [proposed] Show the loading indicator on every mobile preview, not only when showsLoading is set

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | StreamingArtifactView | `apps/web/features/chat/components/artifacts/StreamingArtifactView.tsx` | Live code view with 'Writing…' |
| hook | useStreamingArtifactSync | `apps/web/features/chat/hooks/use-streaming-artifact.ts` | Feeds the streaming store, auto-opens the panel, retains a stopped fragment |
| store | streaming-artifact-store | `apps/web/features/chat/stores/streaming-artifact-store.ts` | Holds the artifact being written [inferred from imports; file not opened] |
| store | retainPartialArtifact | `apps/web/features/chat/stores/artifacts-store.ts` | Saves a stopped fragment with interrupted=true (line 694) |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Interrupted banner, error panel, PDF and image fallbacks, loading frame |
| component | SandboxedIframe | `apps/web/features/chat/components/SandboxedIframe.tsx` | Hosts the sandbox, connect and document timeouts, loading text |
| other | Sandbox page | `infrastructure/sandbox/index.html` | Loads pinned React and Mermaid scripts, reports render-complete and render-error |
| other | artifact-sandbox message types | `apps/web/lib/artifact-sandbox.ts` | Message names sandbox-ready, render-complete, render-error |
| component | StreamingArtifactCard | `apps/mobile/src/features/chat/components/StreamingArtifactCard.tsx` | Mobile card for a block being written or stopped |
| component | SafeArtifactPreview | `apps/mobile/src/features/chat/components/SafeArtifactPreview.tsx` | Mobile preview with error, retry, timeout and loading |
| component | artifactPanel | `apps/extension/src/features/side-panel/artifactPanel.ts` | Chrome streaming flag and sandbox status |
| test | StreamingArtifactView.test | `apps/web/features/chat/components/artifacts/StreamingArtifactView.test.tsx` | Live view tests |
| test | ArtifactPreview.interrupted.test | `apps/web/features/chat/components/artifacts/ArtifactPreview.interrupted.test.tsx` | Stopped banner tests |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The chat stream appends text; a trailing unclosed fence is detected | device | use-streaming-artifact.ts:27,90-93 |
| The streaming store is updated with id, type, title and content | device | use-streaming-artifact.ts:102-110 |
| The panel auto-opens once per reply unless the reader closed it, and never on phone width | device | use-streaming-artifact.ts:112-120; artifacts-store.ts:823-826 |
| When the turn ends with the fence still open, the partial text is saved as interrupted | device | use-streaming-artifact.ts:57-84 |
| The preview posts the artifact to the sandbox page; the sandbox loads libraries from outside services with integrity hashes and reports success or error | outside service | index.html:207-221,910-923; SandboxedIframe.tsx:37-38 |
| Mobile loads the preview in a web view and watches a 20 second bound | device | SafeArtifactPreview.tsx:34,195-206 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Streaming draft | In memory in the streaming store, cleared at turn end (use-streaming-artifact.ts:85,123-127) | No | Cleared when the message changes or ends |
| Interrupted artifact | Same artifact list as F026-01, flagged interrupted (artifacts-store.ts:71,87) | Yes with the artifact (artifacts-store.ts:169) | Not saved over an existing artifact (use-streaming-artifact.ts:79-84) |

**Models and providers.** The model's streamed text is the source. Any model that streams a fenced block works. Library scripts (React, Babel, Mermaid) come from public script hosts, not from a model provider (index.html:56,207-226).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Viewing needs no extra account step in the files opened. The sandbox's AI and saved-data bridge is available only for a Cloud-managed origin: liveRuntime is true only when the origin mode is 'managed' (ArtifactsPanel.tsx:396-401,852). |
| Permissions | The sandbox page has a strict content policy and only listed script hosts (index.html:56). |
| Subscription | none found in the code in the files opened |
| Limits and metering | Mobile load bound 20 seconds; web connect bound 3 seconds and document bound 15 seconds (SafeArtifactPreview.tsx:34; SandboxedIframe.tsx:37-38). A cap of eight pending runtime requests exists in the sandbox (index.html, MAX_PENDING_RUNTIME_REQUESTS). |
| Feature flags | none found |
| Model compatibility | Any streaming model; live runtime is not tied to a model. |
| Provider restrictions | none found in these files |
| Local mode | Streaming view, banner and error panel work in Local mode. The runtime bridge says 'AI and saved data are available once this app is published and opened by a signed-in viewer.' (index.html, RUNTIME_UNAVAILABLE_MESSAGE). Loading React needs internet access to the script host (index.html:207-221). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | 'Loading preview…' until the page owns the frame; mobile spinner labelled 'Loading preview' | SandboxedIframe.tsx:383-390; SafeArtifactPreview.tsx:310-323 |
| Empty | 'Nothing to preview yet.' on web and mobile | ArtifactPreview.tsx:3227-3228; SafeArtifactPreview.tsx:216-224 |
| Success | render-complete clears the status | index.html:904; artifactPanel.ts:836-842 |
| Error | Panel with message, View source, Retry; mobile alert with Retry and View source; invalid SVG has no Retry | ArtifactPreview.tsx:3232-3252; SafeArtifactPreview.tsx:228-258 |
| Retry | Retry clears the error and increments a refresh key | ArtifactPreview.tsx:1752-1757 |
| Timeout | Web falls back after the connect or document bound; mobile shows the load timeout message; Chrome falls back to the source | SandboxedIframe.tsx:37-38,367-380; SafeArtifactPreview.tsx:199-206; side-panel-artifacts.test.ts:495 |
| Cancel | A stopped reply keeps the fragment as 'Stopped artifact' | use-streaming-artifact.ts:16,72 |
| Memory reclaim (mobile) | Up to three automatic recoveries when the system stops the web view | SafeArtifactPreview.tsx:32-33 |
| Offline | A script that cannot load reports 'The React runtime could not be loaded from <address>' | index.html:709-713 |
| Accessibility | Writing status is role=status aria-live=polite; mobile error has accessibilityRole alert | StreamingArtifactView.tsx:40-44; SafeArtifactPreview.tsx:228-231 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/StreamingArtifactView.test.tsx`: Partial content, title and type label, writing indicator, no cursor, growth across chunks
- `apps/web/features/chat/components/artifacts/ArtifactPreview.interrupted.test.tsx`: Fragment notice on a stopped stream, silent for a finished artifact, notice-only transitions, approval wording
- `apps/web/features/chat/components/artifacts/ArtifactPreview.live.test.tsx`: Live runtime preview [inferred from name; not opened]
- `apps/web/features/chat/components/artifacts/ArtifactsPanel.test.tsx`: Hand-off from streaming view to saved artifact; other conversation's stream hidden
- `apps/web/lib/__tests__/artifact-sandbox.test.ts`: Sandbox message handling [inferred from name]
- `apps/mobile/__tests__/SafeArtifactPreviewStates.test.tsx`: Content, script error with Retry and View source, load bound with Retry, empty React, image error
- `apps/mobile/__tests__/SafeArtifactPreviewRuntimeError.test.tsx`: Error tied to the version that failed; Retry clears it
- `apps/mobile/__tests__/StreamingArtifactViewerStaysOpen.test.tsx`: Viewer stays open when the fence closes mid-stream; no 'Generating artifact' card while a code block is being written
- `apps/extension/__tests__/side-panel-artifacts.test.ts`: Chrome preview failure message, source fallback, renderer never answers

**Test scenarios**

- **Live write**
  1. Ask for a long HTML page
  2. Watch the panel
  - Expected: 'Writing…' shows, code grows, view becomes the saved artifact when done
- **Stopped reply**
  1. Start a long artifact
  2. Press stop mid-code
  3. Open the artifact
  - Expected: Banner says it was saved from a partial response
- **Broken script**
  1. Ask for an HTML page with a deliberate script error
  2. Open it
  - Expected: Error panel with View source and Retry; Retry re-runs
- **Library load failure**
  1. Block the script host in the browser
  2. Open a React artifact
  - Expected: The React runtime could not be loaded message appears, not a blank frame
- **Mobile timeout**
  1. Open a preview on a very slow network
  - Expected: After 20 seconds 'This preview did not finish loading.' with Retry

**Where to look when it fails**

- Sandbox messages render-error and sandbox-ready (artifact-sandbox.ts:21-23)
- Constant ARTIFACT_RENDER_FAILURE_MESSAGE (SandboxedIframe.tsx:40)
- Toast text for unsaved partial output (use-streaming-artifact.ts:80-82)

**Hands-on test plans**

- Web: [70-qa/test-plans/web/026-artifact-container-and-panel.md](../../70-qa/test-plans/web/026-artifact-container-and-panel.md)
- Desktop: [70-qa/test-plans/desktop/026-artifact-container-and-panel.md](../../70-qa/test-plans/desktop/026-artifact-container-and-panel.md)
- Mobile: [70-qa/test-plans/mobile/026-artifact-container-and-panel.md](../../70-qa/test-plans/mobile/026-artifact-container-and-panel.md)
- Chrome: [70-qa/test-plans/chrome/026-artifact-container-and-panel.md](../../70-qa/test-plans/chrome/026-artifact-container-and-panel.md)

## 10. Gaps and dependencies

- **Mobile loading state is partial (indicator only when showsLoading is set); brief says missing** Affects: Mobile. Evidence: SafeArtifactPreview.tsx:83,191,304. Work needed: Confirm every viewer call passes showsLoading, or make it the default
- **CLI and VS Code have no lifecycle state** Affects: CLI, VS Code. Evidence: cloud/artifacts.rs:400-450 reads finished artifacts only. Work needed: Decide whether a notice is needed
- **Chrome shows no stopped-artifact banner in the code opened** Affects: Chrome. Evidence: artifactPanel.ts:298-306 only has a streaming flag. Work needed: Check a stopped reply in the side panel
- **Mobile 'Failed' depends on a message stream-error flag only** Affects: Mobile. Evidence: StreamingArtifactCard.tsx:65. Work needed: Verify failed versus stopped on a real provider error
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:local
- mode:cloud
- SYS-chat-turn-pipeline
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- file:infrastructure/sandbox/index.html
- F026-01
- F026-03

## Unknown

- Contents of streaming-artifact-store.ts (not opened)
- Whether Chrome shows a stopped notice
- Behaviour of web error panel when library hosts are blocked in the Electron Desktop window
- Whether the stopped banner survives a sync round trip on another device
