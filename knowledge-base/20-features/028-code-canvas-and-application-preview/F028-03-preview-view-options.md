---
id: "F028-03"
type: "feature"
title: "Preview view options"
aliases: ["Preview view options", "HTML preview", "React preview", "Source and preview split", "Responsive preview sizes", "Preview theme", "SandboxedIframe", "artifact sandbox renderer", "S28.09", "S28.10", "S28.11", "S28.12", "S28.13"]
area: "28 Code Canvas and application preview"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "n/a", vscode: "n/a", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S28.09", "S28.10", "S28.11", "S28.12", "S28.13"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:local", "mode:cloud", "file:infrastructure/sandbox/index.html", "file:packages/contracts/types/src/artifact-csp.ts", "file:apps/web/lib/artifact-sandbox.ts", "SYS-security-and-privacy", "SYS-shared-ui-and-design", "SYS-execution-boundaries", "SYS-files-artifacts-and-storage"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F028-03 Preview view options

Shows a generated HTML, React, SVG or Mermaid artifact as a live preview inside a locked-down frame, with a Preview and Source switch. Web and Tauri desktop need a separate sandbox web address to run scripts; mobile uses a restricted WebView and Chrome a hosted frame. Side-by-side view, device sizes and theme switch are not built.

Area: [28. Code Canvas and application preview](README.md). Requirement items: [S28.09](../../10-requirements/capabilities/028-code-canvas-and-application-preview.md#s2809), [S28.10](../../10-requirements/capabilities/028-code-canvas-and-application-preview.md#s2810), [S28.11](../../10-requirements/capabilities/028-code-canvas-and-application-preview.md#s2811), [S28.12](../../10-requirements/capabilities/028-code-canvas-and-application-preview.md#s2812), [S28.13](../../10-requirements/capabilities/028-code-canvas-and-application-preview.md#s2813).

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

**What it does.** Draws generated pages and components so the person sees the result, not only code. Runs the artifact's scripts in an isolated frame so a bad artifact cannot reach the person's account.

**Why it exists.** A model's page is judged by looking at it. The brief (S28.09 to S28.13) asks for live HTML and React preview, split view, device sizes and light or dark themes.

**Who uses it.** Anyone who asks the assistant to build a page, widget or component.

**Problems it solves**

- Seeing a generated page work without copying it out
- Running untrusted generated scripts safely
- Telling the person when scripts cannot run instead of showing a dead page

**Use cases**

- Ask for a calculator page and use it inside the chat panel.
- Ask for a React component and see it mount.
- On a phone, open the full-screen artifact and use the Preview/Source switch.

## 2. User experience

**Where to find it**

- Web and public Electron Desktop (hosted web): side panel toggle with aria-labels 'Preview' and 'Source' (ArtifactPreview.tsx:2600, 2617); inline card variant uses tabs 'Preview' and 'Code' (ArtifactPreview.tsx:3604-3620).
- Desktop Tauri (internal): shared panel buttons 'Preview mode' and 'Code mode' (ArtifactPanel.tsx:634, 650), HTML preview strip 'HTML preview' with 'Run preview' or 'Stop preview' (ArtifactPanel.tsx:925).
- Mobile: full-screen artifact segmented control 'Preview' / 'Source' (ArtifactFullScreen.tsx:1404-1405).
- Chrome side panel: toggle 'Preview' and 'Code' (apps/extension/_locales/en/messages.json spArtifactShowPreview, spArtifactShowSource); preview types html, react, mermaid; SVG shown as an image (artifactPanel.ts:272-276).

**Before you start**

- Artifact type html, react, svg or mermaid with non-empty content.
- Web and Tauri desktop: a configured sandbox address for scripts; otherwise a limited fallback (see current_implementation).
- Network access to public script hosts for React and Mermaid (index.html:208-226).

**Screens and controls**

- Preview/Source toggle; 'Refresh preview' and 'Open in new tab' in the More menu (ArtifactPreview.tsx:2354-2365).
- Web empty state 'Nothing to preview yet.' (ArtifactPreview.tsx:3228).
- Web fallback banner: 'This artifact's scripts cannot run here, so what you see below is its layout only - controls will not calculate or update. Open the Source tab to read what it does.' (SandboxedIframe.tsx:413-420).

**Journey**

1. A chat turn produces an artifact; the panel opens on Preview.
2. The page shows 'Loading preview…' then the live frame.
3. Interact with the page inside the frame.
4. Switch to Source to read the code.
5. If something fails, see F028-05.

**What the person sees and gets**

- Chrome status text 'Starting the preview…' and, after a timeout, 'The live preview is not available right now, so the panel shows the source.'
- Mobile loading spinner labelled 'Loading preview' (SafeArtifactPreview.tsx, showsLoading).

**Settings**

- Web build setting NEXT_PUBLIC_SANDBOX_ORIGIN (apps/web/lib/artifact-sandbox.ts getSandboxOrigin). Chrome build setting VITE_ARTIFACT_SANDBOX_ORIGIN (apps/extension/src/lib/webOrigin.ts:2). Device sizes and theme: no setting found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: with a valid separate https sandbox address, the panel frames that address with sandbox 'allow-scripts allow-same-origin', waits for a ready message, then posts the render payload (SandboxedIframe.tsx:263-300, 399). The renderer shows HTML as a real nested document, React through a pinned in-page compiler (needs a default export or App), SVG through a sanitiser, Mermaid with security level 'strict' (infrastructure/sandbox/index.html:636, 694-810, 812, 841-854).
- Web: Mermaid previews render client-side, not in the sandbox frame (ArtifactPreview.tsx:3282-3290 area; renderMermaidPreview).
- Mobile: HTML, SVG, Mermaid and React render in a WebView under the shared content policy; JavaScript only for HTML, React and Mermaid, no storage, incognito (SafeArtifactPreview.tsx:99, 280-282; sandboxedArtifactHtml.ts:193-215). The brief says React is missing on mobile; the code has it.
- Desktop Tauri: registers an 'artifact://' scheme for a dedicated renderer origin (apps/desktop/src-tauri/src/ui/artifact_sandbox.rs; lib.rs:220) and the shared panel routes previews there (packages/ui/unified-chat/src/lib/artifact-sandbox.ts:209-218).
- Chrome: frames the sandbox address (default https://sandbox.agiworkforce.com) for html, react, mermaid (artifactPanel.ts:272-276, 802-822; webOrigin.ts:2).

**Incomplete**

- Web without a sandbox address: falls back to a frame with sandbox 'allow-scripts allow-modals' and no same-origin; the page's inline scripts are blocked by the app's own policy, so only layout shows and a banner says so (SandboxedIframe.tsx:109-127, 413-427).
- Whether production sets the sandbox address is documented as not set (doc: audit/prior-audits/chat-security-audit-2026-10-26.md:62; audit/registers/known-flaws.md:57) and the brief lists a switch-on task; code cannot tell.
- Chrome: preview works only if the sandbox host allows the extension as a parent. The repo's allowed-parent list for extensions is empty and filled at deploy time (infrastructure/sandbox/index.html:175; infrastructure/sandbox/configure.mjs), so the state is unknown.

**Present but disconnected or switched off**

- Web sandbox path is off until NEXT_PUBLIC_SANDBOX_ORIGIN is set at build time (apps/web/lib/artifact-sandbox.ts getSandboxOrigin).

**Not available**

- Side-by-side source and preview (S28.09): only a toggle exists on every app.
- Device sizes phone, tablet, desktop (S28.12) and light or dark preview theme (S28.13): no control found on any app.
- VS Code and CLI have no preview.

## 4. Required behaviour

**Established requirements**

- Source and preview can be shown side by side (S28.09). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S28.09)
- HTML artifacts render as a live, interactive preview (S28.10). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S28.10)
- React or supported framework components render as a live preview (S28.11). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S28.11)
- The preview can switch between phone, tablet and desktop sizes (S28.12) and between light and dark themes (S28.13). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S28.12, S28.13)
- Switch-on for web and desktop: redeploy the sandbox project, set NEXT_PUBLIC_SANDBOX_ORIGIN, rebuild web, live-check an HTML and a React artifact. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S28.10, S28.11)
- packages/ui/unified-chat is shared by desktop, web, Chrome and VS Code, so it may not assume one surface's routing, billing or account model. (source: doc: AGENTS.md section 5)

**Acceptance criteria**

1. With the sandbox address set, an HTML artifact with a button and script updates the page when clicked.
2. A React artifact exporting App mounts; one importing another package shows the message that only React and ReactDOM are available.
3. With no sandbox address on web, an artifact with an inline script shows the 'scripts cannot run here' banner.
4. On mobile, the Preview/Source switch changes between the WebView and highlighted source.
5. A frame never reaches the network: fetch calls from the artifact are blocked by the policy (connect-src none).
6. Source and preview side by side, size and theme controls appear when built (currently absent).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Local mode on mobile and Tauri desktop should preview offline; React and Mermaid load runtime scripts from public CDNs per the policy, so offline may fail [inferred from artifact-csp.ts hosts and index.html:208-226].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a size selector and theme toggle to the preview toolbar.
- [proposed] Bundle the React and Mermaid runtimes so Local preview works offline.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ArtifactPreview (preview branch) | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Tabs, preview area, empty state, error state, sandboxPayload (line 1207), SandboxedIframe use (3259, 3651) |
| component | SandboxedIframe | `apps/web/features/chat/components/SandboxedIframe.tsx` | Frames the sandbox address, handshakes, timeouts (3 s connect, 15 s document), fallback frame, scripts-blocked banner |
| service | artifact-sandbox helpers | `apps/web/lib/artifact-sandbox.ts` | getSandboxOrigin, message parsers, post helpers |
| other | artifact-render | `apps/web/features/chat/components/artifacts/artifact-render.ts` | buildArtifactRenderPayload and buildArtifactPreviewDocument (srcDoc fallback) |
| component | Sandbox renderer page | `infrastructure/sandbox/index.html` | Hosted renderer: HTML, React, SVG, Mermaid, error reporting, picker |
| config | Sandbox host headers | `infrastructure/sandbox/vercel.json` | CSP, frame-ancestors and isolation headers for the renderer host |
| config | Sandbox parent configuration | `infrastructure/sandbox/configure.mjs` | Adds extension parent origins at deploy time |
| config | Artifact CSP | `packages/contracts/types/src/artifact-csp.ts` | Single policy: script hosts allow-list, connect-src none |
| service | react-preview-document | `packages/ui/unified-chat/src/lib/react-preview-document.ts` | Builds the pinned React preview document used by web fallback and mobile |
| service | artifact-sandbox (shared) | `packages/ui/unified-chat/src/lib/artifact-sandbox.ts` | Resolves the renderer origin for desktop Tauri and Chrome (getArtifactSandboxOrigin, line 209) |
| component | ArtifactPanel (shared) | `packages/ui/unified-chat/src/components/ArtifactPanel.tsx` | Desktop Tauri preview and code modes, Run/Stop preview |
| service | artifact_sandbox protocol | `apps/desktop/src-tauri/src/ui/artifact_sandbox.rs` | Serves the renderer under the artifact:// scheme |
| component | SafeArtifactPreview | `apps/mobile/src/features/chat/components/SafeArtifactPreview.tsx` | Mobile WebView preview with load timeout and recovery |
| service | sandboxedArtifactHtml | `apps/mobile/src/features/chat/components/sandboxedArtifactHtml.ts` | Builds mobile preview documents under the shared policy |
| component | ArtifactFullScreen | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | Mobile Preview/Source switch and preview kind choice (livePreviewKind, line 218) |
| component | artifactPanel (Chrome) | `apps/extension/src/features/side-panel/artifactPanel.ts` | Chrome frame mount, handshake and fallback to source |
| test | SandboxedIframe tests | `apps/web/features/chat/components/SandboxedIframe.test.tsx` | Origin handshake, fallback, own-origin refusal |
| test | sandbox-runtime-sri test | `apps/web/__tests__/security/sandbox-runtime-sri.test.ts` | Pinned versions and integrity hashes for renderer scripts |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The panel builds a render payload from the artifact type and text. | device | apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1207; artifact-render.ts:107 |
| The browser loads the renderer page from the configured sandbox address. | our servers | SandboxedIframe.tsx:395-405; infrastructure/sandbox/vercel.json (project named in infrastructure/sandbox/deploy-target.json) |
| The renderer announces ready; the panel checks the message came from its own frame and origin, then posts the payload. | device | SandboxedIframe.tsx:225-262 |
| For React and Mermaid the renderer loads pinned scripts with integrity hashes from public script hosts. | outside service | infrastructure/sandbox/index.html:208-226; packages/contracts/types/src/artifact-csp.ts:17-22 |
| The artifact's own code runs in the frame; network calls are blocked by policy. | device | infrastructure/sandbox/index.html:54-57 (connect-src 'none') |
| If the sandbox frame is not ready in time, the panel switches to a local fallback frame. | device | SandboxedIframe.tsx:37-38, 296-310 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Artifact source text sent to the renderer | Memory of the frame only; the renderer keeps no state | No | Gone when the frame is removed |
| Mobile preview WebView state | None: storage off, incognito for non-Mermaid | No | Discarded with the WebView (SafeArtifactPreview.tsx:281-282) |

**Models and providers.** No model or provider takes part in drawing the preview. The text was produced earlier by whichever model the chat used.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for previewing a stored artifact. Publishing and sharing are separate features. |
| Permissions | The artifact frame has no access to the person's session: web refuses a sandbox address equal to the app's own origin (artifact-sandbox.ts getSandboxOrigin); fallback has no same-origin. |
| Subscription | none found in the code. |
| Limits and metering | Timeouts: web 3 s connect and 15 s document (SandboxedIframe.tsx:37-38); mobile 20 s load and up to 3 recoveries (SafeArtifactPreview.tsx:33-35); Chrome 15 s render (artifactPanel.ts:270). |
| Feature flags | Build settings NEXT_PUBLIC_SANDBOX_ORIGIN (web) and VITE_ARTIFACT_SANDBOX_ORIGIN (Chrome). |
| Model compatibility | Not applicable. |
| Provider restrictions | Not applicable. |
| Local mode | Previewing needs no paid plan. Plain HTML previews on mobile run on the device. React and Mermaid load runtime scripts from public script hosts, so a fully offline device may not draw them [inferred]. Web and Chrome frames load the renderer from our hosted sandbox address. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web shows 'Loading preview…' before hydration and a spinner for the payload; mobile shows a progress indicator. | SandboxedIframe.tsx:373-378; ArtifactPreview.tsx:365-375 |
| Empty content | 'Nothing to preview yet.' on web and mobile. | ArtifactPreview.tsx:3228; SafeArtifactPreview.tsx:220 |
| Sandbox not configured or not reachable | Falls back to a no-same-origin frame; banner if scripts cannot run. | SandboxedIframe.tsx:336, 413-427 |
| Timeout | Web switches to fallback; Chrome shows source with a note; mobile shows the 'did not finish loading' panel. | SandboxedIframe.tsx:296-310; artifactPanel.ts:790; SafeArtifactPreview.tsx:35 |
| Offline | not handled in the code beyond the timeouts above. | searched the preview components |
| Phone width | Web full-screen sheet on phones (ArtifactsPanel.mobileSheet test); mobile uses full screen. | ArtifactsPanel.mobileSheet.test.tsx |
| Accessibility | Frame has a title; mobile WebView has label '<KIND> artifact preview'. | SandboxedIframe.tsx:395-405; SafeArtifactPreview.tsx:289 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/SandboxedIframe.test.tsx`: Origin handshake, fallback on opaque origin, refusal of own origin, forwarding only trusted picker messages
- `apps/web/features/chat/components/SandboxedIframe.origin.test.tsx`: Sandbox origin behaviour of the frame
- `apps/web/lib/__tests__/artifact-sandbox.test.ts`: Sandbox helpers and parsers
- `apps/web/__tests__/security/sandbox-runtime-sri.test.ts`: Pinned CDN scripts carry integrity hashes
- `apps/web/__tests__/security/sandbox-parent-origin.test.ts`: Renderer only trusts allowed parents
- `infrastructure/sandbox/configure.test.mjs`: Adding the extension origin to the renderer
- `packages/ui/unified-chat/src/components/__tests__/ArtifactSandboxOriginPreview.test.tsx`: Shared panel with a sandbox origin
- `apps/mobile/__tests__/SafeArtifactPreviewStates.test.tsx`: Mobile draw, React, error, timeout, Retry
- `apps/extension/__tests__/side-panel-artifacts.test.ts`: Chrome panel: frame of the shared origin, handshake, preview failure, HTML as source when no sandbox
- `apps/desktop/wdio/specs/artifact-sandbox-origin.spec.ts`: Packaged Tauri app: artifact origin, script runs, network blocked (a spec file; no result recorded here)

**Test scenarios**

- **HTML runs in the sandbox (web)**
  1. Build web with NEXT_PUBLIC_SANDBOX_ORIGIN set
  2. Ask for a counter page
  3. Click its button
  - Expected: Count changes; a fetch inside the page is blocked.
- **No sandbox address**
  1. Build web without the setting
  2. Open an artifact with inline script
  - Expected: Layout shows with the scripts-blocked banner.
- **React export rule**
  1. Open a React artifact importing a third package
  - Expected: Error says only React and ReactDOM are available.
- **Mobile Preview/Source**
  1. Open an HTML artifact full screen
  2. Toggle Source then Preview
  - Expected: Source highlighted, then the WebView again.
- **Absent controls**
  1. Open any preview on web and mobile
  2. Look for size or theme controls
  - Expected: None exist, confirming the gap.

**Where to look when it fails**

- Browser console line '[artifact-preview] render failed' (SandboxedIframe.tsx:268-271).
- Network panel: request to the sandbox address and to unpkg or jsdelivr.
- Chrome status text spArtifactPreviewFailed.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/028-code-canvas-and-application-preview.md](../../70-qa/test-plans/web/028-code-canvas-and-application-preview.md)
- Desktop: [70-qa/test-plans/desktop/028-code-canvas-and-application-preview.md](../../70-qa/test-plans/desktop/028-code-canvas-and-application-preview.md)
- Mobile: [70-qa/test-plans/mobile/028-code-canvas-and-application-preview.md](../../70-qa/test-plans/mobile/028-code-canvas-and-application-preview.md)
- Chrome: [70-qa/test-plans/chrome/028-code-canvas-and-application-preview.md](../../70-qa/test-plans/chrome/028-code-canvas-and-application-preview.md)

## 10. Gaps and dependencies

- **Web and Desktop run scripts only when the sandbox address is set; production state is documented as unset** Affects: Web, Electron Desktop. Evidence: audit/prior-audits/chat-security-audit-2026-10-26.md:62; brief S28.10 Unfinished. Work needed: Redeploy renderer, set the build setting, rebuild, live-check.
- **A high-severity navigation exfiltration risk is recorded as latent until the sandbox address is set** Affects: Web, Chrome. Evidence: audit/registers/known-flaws.md:57 (WEB-ARTIFACT-NAVIGATION-EXFIL-01). Work needed: Close before switching on, as the register says.
- **Split view, device sizes, theme switch not built** Affects: All apps with preview. Evidence: No control found; briefs S28.09, S28.12, S28.13. Work needed: Design and build toolbar controls.
- **Brief says React preview missing on mobile; code has it** Affects: Documentation. Evidence: sandboxedArtifactHtml.ts:194; ArtifactFullScreen.tsx:218. Work needed: Correct the brief.
- **Runtime scripts come from public hosts, so offline Local preview of React or Mermaid is doubtful** Affects: Mobile, Desktop Tauri in Local mode. Evidence: artifact-csp.ts:17-22; index.html:208-226. Work needed: Verify offline behaviour and consider bundling.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:local
- mode:cloud
- file:infrastructure/sandbox/index.html
- file:packages/contracts/types/src/artifact-csp.ts
- file:apps/web/lib/artifact-sandbox.ts
- SYS-security-and-privacy
- SYS-shared-ui-and-design
- SYS-execution-boundaries
- SYS-files-artifacts-and-storage

## Unknown

- Whether NEXT_PUBLIC_SANDBOX_ORIGIN is set in the current production build (code cannot show; docs say unset as of 2026-10-26).
- Whether the deployed sandbox host currently allows the Chrome extension as a parent (configured at deploy time).
- Whether Tauri desktop previews work offline.
- How mobile loads the Mermaid runtime (mermaidRuntime.ts not opened).
- Whether the Electron Desktop sets its own sandbox address: it shows the hosted web app, so it follows web's build setting [inferred].
