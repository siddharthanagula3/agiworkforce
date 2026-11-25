---
id: "F028-05"
type: "feature"
title: "Preview errors and reload"
aliases: ["Preview errors and reload", "Runtime-error overlay", "Retry preview", "Refresh preview", "Restart runtime", "Console panel", "S28.15", "S28.16", "S28.18", "S28.19", "artifact-render-error"]
area: "28 Code Canvas and application preview"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "n/a", vscode: "n/a", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S28.15", "S28.16", "S28.18", "S28.19"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:local", "file:infrastructure/sandbox/index.html", "file:apps/mobile/src/features/chat/components/SafeArtifactPreview.tsx", "F028-03", "SYS-observability-and-operations", "SYS-shared-ui-and-design"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F028-05 Preview errors and reload

When a preview fails or throws, the person sees an error panel with 'View source' and 'Retry' (web, mobile) and can reload the preview from a menu or button. Reload rebuilds the frame; there is no separate restart and no console panel. Chrome falls back to source.

Area: [28. Code Canvas and application preview](README.md). Requirement items: [S28.15](../../10-requirements/capabilities/028-code-canvas-and-application-preview.md#s2815), [S28.16](../../10-requirements/capabilities/028-code-canvas-and-application-preview.md#s2816), [S28.18](../../10-requirements/capabilities/028-code-canvas-and-application-preview.md#s2818), [S28.19](../../10-requirements/capabilities/028-code-canvas-and-application-preview.md#s2819).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Catches script errors, unhandled rejections, failed loads and timeouts in a preview, replaces the blank frame with a clear message and gives a way to retry or read the source.

**Why it exists.** A silent blank frame looks like a broken product. The brief (S28.15, S28.16, S28.18, S28.19) asks for a console, an error overlay with recovery, reload and restart.

**Who uses it.** Anyone previewing a generated page, and developers debugging it.

**Problems it solves**

- Not knowing why a preview is blank
- Getting stuck on a failed frame
- Re-running after a fix

**Use cases**

- A React artifact throws on mount: error panel appears, person taps View source.
- A page hangs on a phone: after 20 seconds, 'This preview did not finish loading.' and Retry.
- After editing source, press Refresh preview to re-run the page.

## 2. User experience

**Where to find it**

- Web and Electron Desktop: More menu 'Refresh preview' (ArtifactPreview.tsx:2354); error panel with 'View source' and 'Retry' (ArtifactPreview.tsx:3235-3255).
- Desktop Tauri: reload button aria-label 'Retry preview', title 'Reload the preview' (ArtifactPanel.tsx:818).
- Mobile: More actions 'Refresh preview' (ArtifactFullScreen.tsx:1213); error panel buttons 'Retry' and 'View source' (SafeArtifactPreview.tsx:247, 260).
- Chrome: status text under the panel; fallback to source (artifactPanel.ts:843-860). No reload control found.
- VS Code and CLI: not applicable.

**Before you start**

- A previewable artifact (html, react, svg, mermaid).
- For errors from the artifact's own script on web: the sandbox frame in use, or the fallback error reporter (SandboxedIframe.tsx:53-85).

**Screens and controls**

- Web error panel: warning icon, 'This artifact couldn't be rendered.', a short reason, buttons 'View source' and 'Retry'.
- Mobile error panel (role alert): 'This preview stopped with an error.' or 'This preview did not finish loading.', reason text, 'Retry' (accessibility label 'Run the preview again'), 'View source' (label 'Show the artifact source').
- Inside the web renderer, an error block shows 'Render error: ...' in the frame itself (index.html:374-381, 926-934).

**Journey**

1. Preview starts.
2. A script throws or the load times out.
3. The error panel replaces the preview.
4. Person presses View source to read or edit, or Retry to rebuild the frame.
5. On success the preview returns; the error text is cleared.

**What the person sees and gets**

- Web shows the fixed message 'The preview could not start. Review the source or try again.' as the reason (SandboxedIframe.tsx:40); the technical text goes to the browser console only (SandboxedIframe.tsx:268-271).
- Mobile shows the script's own first line of error (parseArtifactPreviewError, sandboxedArtifactHtml.ts:178-190).

**Settings**

- None found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Renderer reports uncaught errors and rejected promises to the parent as render-error and shows an error block (infrastructure/sandbox/index.html:920-934, 374-381). React errors are caught by an error boundary (index.html:733-810).
- Fallback frame has its own reporter that posts a render-error from errors and failed script loads (SandboxedIframe.tsx:53-85, 285-305).
- Web error state replaces the frame and offers View source and Retry (ArtifactPreview.tsx:3232-3256). handleRefresh clears errors and increases the refresh counter so the frame is rebuilt (ArtifactPreview.tsx:1753-1758; SandboxedIframe.tsx frameOwner epoch).
- Mobile: script errors, a 20 s load limit, and up to 3 automatic recoveries when the system frees memory, then an error panel with Retry and View source (SafeArtifactPreview.tsx:33-35, 179-190, 247-260). Mobile also has 'Refresh preview' (ArtifactFullScreen.tsx:1213); the brief says reload missing on mobile, the code has it.
- Tauri panel: reload button re-mounts the preview (ArtifactPanel.tsx:568-575, 818).

**Incomplete**

- Web shows only the generic failure text to the person; the real error is in the console (SandboxedIframe.tsx:268-271).
- Chrome: failure or timeout shows a status line or a source fallback, with no retry control found (artifactPanel.ts:843-860).

**Present but disconnected or switched off**

- None found.

**Not available**

- Console panel with logs (S28.15): none on any app.
- Separate 'restart runtime from a clean state' (S28.19): reload is the same action; no runtime state beyond the frame exists to reset [inferred].

## 4. Required behaviour

**Established requirements**

- A console panel shows the preview's logs and errors (S28.15). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S28.15)
- Runtime errors appear as an overlay with a way to recover (S28.16). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S28.16)
- The user can reload the preview (S28.18) and restart the runtime from a clean state (S28.19). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S28.18, S28.19)
- No silent failures or dead controls in shipped product code. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. A React artifact that throws on mount shows the error panel with View source and Retry on web.
2. Retry clears the panel and re-creates the frame.
3. On mobile, a page that never finishes loading shows the timeout panel after 20 seconds.
4. On mobile, Retry restarts the load with its own 20 second limit.
5. Refresh preview appears in the More menu only for previewable artifacts.
6. An error in an old version is not shown on a newly selected version (mobile test).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A console panel needs the renderer to forward console output to the parent; the renderer has no such message type today [inferred from index.html message types].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the real error text on web, and add a console drawer fed by the renderer.
- [proposed] Add Retry to the Chrome panel.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ArtifactPreview error state | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | renderError state, error panel, handleRefresh (1753), Refresh menu item (2354) |
| component | SandboxedIframe | `apps/web/features/chat/components/SandboxedIframe.tsx` | Receives render-error, fallback reporter, frame rebuild on refreshKey |
| component | Sandbox renderer error handling | `infrastructure/sandbox/index.html` | showError (374), error and unhandledrejection listeners (920-934), React error boundary |
| component | SafeArtifactPreview | `apps/mobile/src/features/chat/components/SafeArtifactPreview.tsx` | Mobile error panel, load timeout, memory recovery, Retry |
| service | parseArtifactPreviewError | `apps/mobile/src/features/chat/components/sandboxedArtifactHtml.ts` | Reads the error report from the WebView page (line 178) |
| component | ArtifactFullScreen | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | Refresh preview action and View source switch (1213, 1718-1727) |
| component | ArtifactPanel (shared) | `packages/ui/unified-chat/src/components/ArtifactPanel.tsx` | Tauri reload button handleRetryPreview (568) |
| component | artifactPanel (Chrome) | `apps/extension/src/features/side-panel/artifactPanel.ts` | Failure status, deadline fallback to source |
| test | SafeArtifactPreviewStates.test | `apps/mobile/__tests__/SafeArtifactPreviewStates.test.tsx` | Error, timeout, Retry, View source |
| test | SafeArtifactPreviewRuntimeError.test | `apps/mobile/__tests__/SafeArtifactPreviewRuntimeError.test.tsx` | Error belongs to the version that failed |
| test | SandboxedIframe.test | `apps/web/features/chat/components/SandboxedIframe.test.tsx` | Ignores render-error from other origins |
| test | side-panel-artifacts.test | `apps/extension/__tests__/side-panel-artifacts.test.ts` | Chrome says when the preview failed and lets the reader switch to code |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The artifact's script throws inside the frame. | device | infrastructure/sandbox/index.html:920-934 |
| The renderer shows an error block and posts render-error to the parent. | device | index.html:374-381, 926-934 |
| The parent checks origin and frame, logs the detail and sets the panel error state with the fixed message. | device | SandboxedIframe.tsx:268-272; ArtifactPreview.tsx:3267 |
| Retry clears the error and bumps the refresh counter, which creates a new frame and re-posts the render payload. | device | ArtifactPreview.tsx:1753-1758; SandboxedIframe.tsx frameOwner epoch |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Error text and refresh counter | Component state in memory | No | Cleared on Retry, artifact change or version change (ArtifactPreview.tsx:906-915) |

**Models and providers.** No model or provider takes part. Errors are not sent to a model for repair by this feature.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code. |
| Permissions | none found in the code. |
| Subscription | none found in the code. |
| Limits and metering | Mobile: load limit 20 s, 3 recoveries; web: 3 s and 15 s frame timeouts before fallback; Chrome: 15 s render deadline. |
| Feature flags | none found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | Not applicable. |
| Local mode | Works fully on the device with no plan. Error reporting stays on the device; nothing is uploaded. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Error | Panel with message, View source, Retry (web); alert panel (mobile). | ArtifactPreview.tsx:3232-3256; SafeArtifactPreview.tsx:228-270 |
| Timeout | Mobile 'This preview did not finish loading.'; web falls back to a local frame. | SafeArtifactPreview.tsx:35-39; SandboxedIframe.tsx:296-310 |
| System frees memory (mobile) | Reloads up to 3 times, then shows 'the system stopped it to free memory'. | SafeArtifactPreview.tsx:33-34, 179-190 |
| Retry | Clears error, new frame; mobile gives the load its own limit. | ArtifactPreview.tsx:1753; SafeArtifactPreviewStates.test.tsx:174 |
| Invalid SVG | Mobile shows 'This image couldn't be rendered.' with View source and no Retry. | SafeArtifactPreview.tsx:228-262 |
| Cancel / offline / reconnect | not handled in the code beyond timeouts. | searched the preview components |
| Accessibility | Mobile error panel has role alert and labelled buttons; web panel has data-testid and icon marked aria-hidden; screen-reader announcement on web not found. | SafeArtifactPreview.tsx:228-262; ArtifactPreview.tsx:3235-3240 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/SafeArtifactPreviewStates.test.tsx`: Script error panel, load-bound stop, Retry reload, empty and image error
- `apps/mobile/__tests__/SafeArtifactPreviewRuntimeError.test.tsx`: Error tied to the failed version; new version clears it
- `apps/web/features/chat/components/SandboxedIframe.test.tsx`: render-error accepted only from the sandbox
- `apps/extension/__tests__/side-panel-artifacts.test.ts`: Chrome preview failure message and switch to code
- `apps/web/features/chat/components/__tests__/sandboxed-iframe-redos.test.ts`: Fallback script scan is not slow on hostile input

**Test scenarios**

- **Throwing React artifact (web)**
  1. Create a React artifact that throws on render
  2. Open it with the sandbox address set
  - Expected: Error panel with View source and Retry.
- **Retry after fix**
  1. Edit the source to fix the error
  2. Press Retry
  - Expected: Preview renders; error gone.
- **Mobile load timeout**
  1. Open a page that never settles
  2. Wait 20 seconds
  - Expected: 'This preview did not finish loading.' with Retry.
- **Mobile Refresh preview**
  1. Open More actions on an HTML preview
  2. Choose Refresh preview
  - Expected: Page reloads from the start.
- **No console**
  1. Call console.log inside an artifact
  2. Look for a console panel
  - Expected: None exists (gap).

**Where to look when it fails**

- Browser console '[artifact-preview] render failed' and '[artifact-preview] fallback render failed'.
- Element data-testid 'artifact-render-error' on web.
- Mobile testID 'artifact-preview-loading'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/028-code-canvas-and-application-preview.md](../../70-qa/test-plans/web/028-code-canvas-and-application-preview.md)
- Desktop: [70-qa/test-plans/desktop/028-code-canvas-and-application-preview.md](../../70-qa/test-plans/desktop/028-code-canvas-and-application-preview.md)
- Mobile: [70-qa/test-plans/mobile/028-code-canvas-and-application-preview.md](../../70-qa/test-plans/mobile/028-code-canvas-and-application-preview.md)
- Chrome: [70-qa/test-plans/chrome/028-code-canvas-and-application-preview.md](../../70-qa/test-plans/chrome/028-code-canvas-and-application-preview.md)

## 10. Gaps and dependencies

- **No console panel** Affects: All apps. Evidence: Renderer has no console message type (index.html message handler); brief S28.15. Work needed: Forward console output from the renderer and add a drawer.
- **Web hides the real error text from the person** Affects: Web, Electron Desktop. Evidence: SandboxedIframe.tsx:268-272. Work needed: Show a safe excerpt or add a details toggle.
- **No distinct restart; reload only** Affects: Web, Mobile, Desktop. Evidence: ArtifactPreview.tsx:1753; brief S28.19. Work needed: Decide if reload is enough and record it.
- **Chrome has no retry control** Affects: Chrome. Evidence: artifactPanel.ts:843-860. Work needed: Add a retry or reload.
- **Brief says mobile reload is missing; code has Refresh preview** Affects: Documentation. Evidence: ArtifactFullScreen.tsx:1213. Work needed: Correct the brief.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:local
- file:infrastructure/sandbox/index.html
- file:apps/mobile/src/features/chat/components/SafeArtifactPreview.tsx
- F028-03
- SYS-observability-and-operations
- SYS-shared-ui-and-design

## Unknown

- Whether the web error overlay reads correctly with a screen reader.
- Whether a Chrome user can retry other than reselecting the card.
- Whether the Tauri panel shows script errors from a failed HTML preview beyond its banner (not read).
