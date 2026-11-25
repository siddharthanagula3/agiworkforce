---
id: "F096-06"
type: "feature"
title: "Live preview in an isolated sandbox"
aliases: ["Artifact sandbox", "Live preview", "artifact preview renderer", "SandboxedIframe", "sandbox.agiworkforce.com", "Request edits element picker", "artifact:// scheme (Tauri)", "S96.12 to S96.16"]
area: "96 Artifact and generated-application components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S96.12", "S96.13", "S96.14", "S96.15", "S96.16"]
depends_on: ["SYS-security-and-privacy", "SYS-files-artifacts-and-storage", "SYS-shared-ui-and-design", "SYS-execution-boundaries", "surface:web", "surface:chrome", "file:infrastructure/sandbox/index.html"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F096-06 Live preview in an isolated sandbox

HTML, React and SVG artifacts show live in a frame served from a separate sandbox origin that cannot reach the app's cookies or storage. A strict policy blocks network calls. If the origin is unset, equal to the app, or silent, the preview falls back to a restricted same-page frame. An element picker lets the person select a part of the preview.

Area: [96. Artifact and generated-application components](README.md). Requirement items: [S96.12](../../10-requirements/capabilities/096-artifact-and-generated-application-components.md#s9612), [S96.13](../../10-requirements/capabilities/096-artifact-and-generated-application-components.md#s9613), [S96.14](../../10-requirements/capabilities/096-artifact-and-generated-application-components.md#s9614), [S96.15](../../10-requirements/capabilities/096-artifact-and-generated-application-components.md#s9615), [S96.16](../../10-requirements/capabilities/096-artifact-and-generated-application-components.md#s9616).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Posts artifact source to a static renderer page in a cross-origin frame; the renderer shows html, react, svg, mermaid, markdown, text or code and reports ready, done or error (infrastructure/sandbox/index.html:881-910; apps/web/features/chat/components/SandboxedIframe.tsx:146-433).

**Why it exists.** Model-written code is untrusted; running it on the app's origin would hand it the person's session (apps/web/lib/artifact-sandbox.ts:153-157 comment).

**Who uses it.** Anyone previewing an artifact on web; the Chrome extension side panel; the Tauri desktop build; published artifact pages.

**Problems it solves**

- Scripts reading app cookies or storage
- Exfiltration by network calls or injected images (infrastructure/sandbox/index.html header comment)
- Previews inert under the app's own policy on desktop (apps/desktop/src-tauri/src/ui/artifact_sandbox.rs:1-20)

**Use cases**

- See an HTML mock-up or React component run
- Preview an SVG
- Pick an element to request a change
- Preview a published page (same renderer)

## 2. User experience

**Where to find it**

- Web artifact panel Preview tab for html, react and svg (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1806,3259). Mermaid previews are drawn inside the app, not in the sandbox (ArtifactPreview.tsx:3272-3281).
- Element picker: 'Request edits' item (ArtifactPreview.tsx:527)
- Chrome extension side panel uses the sandbox origin (apps/extension/src/features/side-panel/artifactPanel.ts:15-17; apps/extension/manifest.json:34)
- Tauri desktop (internal): artifact:// scheme (apps/desktop/src-tauri/src/ui/artifact_sandbox.rs:132-174). Public Desktop shows the hosted web app (doc: AGENTS.md section 5)
- Mobile, CLI, VS Code: no preview renderer found

**Before you start**

- Artifact of type html, react or svg
- For isolation: NEXT_PUBLIC_SANDBOX_ORIGIN set to an https origin different from the app (apps/web/lib/artifact-sandbox.ts:158-175)
- Internet access for pinned CDN scripts (React, Babel, mermaid, DOMPurify) [inferred from infrastructure/sandbox/index.html:130,208-228]

**Screens and controls**

- Preview and source tabs
- Error card 'This artifact couldn't be rendered.' with 'View source' and 'Retry' (ArtifactPreview.tsx:3240-3250)
- Banner when scripts cannot run in fallback: 'This artifact's scripts cannot run here, so what you see below is its layout only...' (SandboxedIframe.tsx:413-420)
- Status text 'Loading preview…' before hydration (SandboxedIframe.tsx:388)

**Journey**

1. Open an artifact in the panel
2. The frame loads the sandbox page; it posts 'sandbox-ready'
3. The app posts the render payload; the renderer draws and replies 'render-complete'
4. If the picker is on, hover and click an element; its selector, text and snippet come back
5. If anything fails or is silent for too long, the fallback frame loads

**What the person sees and gets**

- Rendered preview
- Failure message constant: 'The preview could not start. Review the source or try again.' (SandboxedIframe.tsx:40)
- Renderer idle text 'Waiting for artifact…' (infrastructure/sandbox/index.html)

**Settings**

- Environment value NEXT_PUBLIC_SANDBOX_ORIGIN (name only)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Origin check: https only (localhost allowed), and the app's own origin is refused so a bad value degrades to the fallback (artifact-sandbox.ts:153-175)
- Messages accepted only from the iframe's own window and the sandbox origin (SandboxedIframe.tsx:244; artifact-sandbox.ts:182)
- Renderer accepts messages only from its parent window on an allow-listed parent origin (infrastructure/sandbox/index.html:149-196,946-950)
- Content security policy: default none, connect none, frame-src self, scripts from self plus four CDN hosts (infrastructure/sandbox/index.html:55-56; packages/contracts/types/src/artifact-csp.ts:15-54)
- CDN scripts pinned to exact versions with integrity hashes; test enforces (apps/web/__tests__/security/sandbox-runtime-sri.test.ts:29-66)
- React source is compiled by Babel inside the renderer; require resolves only react and react-dom (index.html:749-755)
- Timeouts: 15 s for the document, 3 s for handshake after load, then fallback (SandboxedIframe.tsx:37-38,224-233)
- Fallback frame has sandbox 'allow-scripts allow-modals' with no same-origin and the same policy (SandboxedIframe.tsx:427; artifact-render.ts:22-30)
- Element picker with bounded selection (artifact-sandbox.ts:50,65-82; index.html:510)
- Desktop serves the same file on its own scheme and echoes its policy as a header (artifact_sandbox.rs:71,132)
- Extension parent origin can be configured at deploy time (infrastructure/sandbox/configure.mjs:7-30)

**Incomplete**

- Dependency resolution: none; any import other than react and react-dom throws 'The preview cannot load ...' (index.html:749-755)
- Origin management is a tracked deploy target plus an environment value; whether the deployed host is live is not recorded (infrastructure/sandbox/deploy-target.json; apps/web/lib/validate-env.ts:439)

**Present but disconnected or switched off**

- Renderer kinds mermaid, markdown, text and code exist, but the web panel sends only html, react and svg to the frame for live preview; mermaid uses an in-app renderer (artifact-render.ts:12-16; ArtifactPreview.tsx:3272)
- Picker is unavailable in the fallback frame and the UI is told (SandboxedIframe.tsx:339-341)

**Not available**

- Server-side build service: none; compile happens in the browser (brief S96.13)
- Package installer: none (brief S96.14)
- Preview on mobile, CLI, VS Code: not found

## 4. Required behaviour

**Established requirements**

- A renderer turns artifact source into a live preview for each supported kind. (source: brief S96.12)
- No build service; generated code is not compiled server side. (source: brief S96.13; infrastructure/sandbox/index.html:722-760)
- Dependency resolver is missing. (source: brief S96.14)
- Previews run in an isolated sandbox that cannot reach the user's session or data. (source: brief S96.15; infrastructure/sandbox/index.html header)
- Preview frames are served from a dedicated managed origin separate from the app; status unverified. (source: brief S96.16)
- All sandbox surfaces share one content policy module. (source: packages/contracts/types/src/artifact-csp.ts:1-12)
- Artifact UI must have a preview renderer and an error-fix loop. (source: doc: docs/product/requirements.md section 9.5)

**Acceptance criteria**

1. With a sandbox origin set, the preview iframe src is that origin and sandbox attribute is 'allow-scripts allow-same-origin'
2. With the origin unset or equal to the app, the fallback frame is used with 'allow-scripts allow-modals'
3. An artifact that calls fetch() to any host is blocked
4. A script reading parent.document or the app's cookies fails
5. A silent sandbox leads to the fallback within 15 s plus 3 s
6. A React artifact importing another package shows 'The preview cannot load "x"'
7. The picker returns a selector and text bounded in size, and is refused from other windows
8. Policy header and meta never allow more than the shared module

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Offline, React, SVG and mermaid previews fail because their scripts load from CDNs [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an uptime probe for the sandbox host (optional-features.ts:147-152 has none; dependency-readiness.ts:175-176 says liveProbe null)
- [proposed] Decide whether to vendor React and Babel so previews work offline and Local
- [proposed] Add package mapping if imports are wanted

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | renderer page | `infrastructure/sandbox/index.html` | Static renderer: handshake, kinds, picker, React compile, policy meta |
| config | sandbox vercel.json | `infrastructure/sandbox/vercel.json` | Response headers: policy, frame-ancestors, isolation headers |
| config | deploy-target.json | `infrastructure/sandbox/deploy-target.json` | Names the host project the sandbox deploys to (ids not copied here) |
| config | configure.mjs | `infrastructure/sandbox/configure.mjs` | Adds the Chrome extension parent origin at deploy time |
| component | SandboxedIframe | `apps/web/features/chat/components/SandboxedIframe.tsx` | Frame, handshake, timeouts, fallback, picker bridge, runtime bridge |
| service | artifact-sandbox | `apps/web/lib/artifact-sandbox.ts` | Origin resolution, message parsing and posting |
| service | artifact-render | `apps/web/features/chat/components/artifacts/artifact-render.ts` | Builds render payload and fallback document per type |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Hosts the frame, error card, picker wiring (lines 1207,3259) |
| component | ArtifactEditRequestLayer | `apps/web/features/chat/components/artifacts/ArtifactEditRequestLayer.tsx` | Receives picker selection |
| schema | artifact-csp | `packages/contracts/types/src/artifact-csp.ts` | Single source of the content policy |
| config | proxy.ts CSP | `apps/web/proxy.ts` | Adds the sandbox origin to the app's frame-src (line 43) |
| config | optional-features | `apps/web/lib/config/optional-features.ts` | Declares sandbox_isolation_origin and its degraded behaviour (line 147) |
| config | validate-env | `apps/web/lib/validate-env.ts` | Warns when the origin value is missing (line 439) |
| config | dependency-readiness | `apps/web/lib/config/dependency-readiness.ts` | Lists the renderer origin as a degradable dependency (line 172) |
| service | Tauri artifact scheme | `apps/desktop/src-tauri/src/ui/artifact_sandbox.rs` | Serves the same renderer inside the Tauri build |
| service | extension artifactPanel | `apps/extension/src/features/side-panel/artifactPanel.ts` | Chrome side panel renders through the sandbox origin |
| config | extension manifest | `apps/extension/manifest.json` | frame-src allows the sandbox host (line 34) |
| service | unified-chat artifact-sandbox | `packages/ui/unified-chat/src` | Shared sandbox helpers used by the extension (imported as @agiworkforce/unified-chat/artifact-sandbox) |
| screen | published artifact view | `apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx` | Uses the same frame for shared pages |
| test | sandbox security tests | `apps/web/__tests__/security/sandbox-parent-origin.test.ts` | Parent origin and framing rules |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Panel builds a payload from artifact source (HTML cleaned, SVG sanitised) after mount | device | apps/web/features/chat/components/artifacts/artifact-render.ts:107-125 |
| Frame loads the static renderer from the sandbox origin | outside service | SandboxedIframe.tsx:397-399; sandbox host deployment: infrastructure/sandbox/deploy-target.json |
| Renderer announces ready, receives the payload, loads pinned CDN scripts and draws | device | infrastructure/sandbox/index.html:208-228,881-910,979 |
| CDN script hosts serve React, Babel, mermaid, DOMPurify | outside service | index.html:130,208-228 |
| Parent receives render-complete or render-error and shows the preview or error card | device | SandboxedIframe.tsx:253-271; ArtifactPreview.tsx:3228-3250 |
| No handshake in time: parent switches to a srcDoc fallback frame | device | SandboxedIframe.tsx:224-233,424-430 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Artifact source in transit to the frame | Memory only; nothing stored by the renderer | No | Gone when the frame closes |
| Picker selection (selector, text up to 500, snippet up to 2000, rectangle) | Memory; becomes part of a chat edit prompt | Only when sent as a message | As part of the message |

**Models and providers.** No model or provider takes part in rendering. A model wrote the code; any model works.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found for rendering; the sandbox page is static and public. Runtime AI and saved-data bridge is refused unless the artifact is published and opened by a signed-in viewer (SandboxedIframe.tsx:45-46). |
| Permissions | Parent origin allow-list in the renderer (index.html:149-196); frame-ancestors in the host headers (vercel.json:15) |
| Subscription | none found in the code |
| Limits and metering | Picker field limits (artifact-sandbox.ts:47-50); runtime request text up to 5,000,000 characters (artifact-sandbox.ts MAX_RUNTIME_TEXT_CHARS); no usage metering for previews found |
| Feature flags | NEXT_PUBLIC_SANDBOX_ORIGIN; optional feature id sandbox_isolation_origin, production expectation 'expected' (apps/web/lib/config/optional-features.ts:147-152) |
| Model compatibility | Independent of model. |
| Provider restrictions | none found in the code |
| Local mode | Preview uses no model, so it works in Local mode. Isolation needs the sandbox host (web) or the built-in scheme (Tauri). Without a host the web falls back to a null-origin frame whose inline scripts may be blocked by the app's policy (SandboxedIframe.tsx:99-108). Scripts and styles load from public CDNs, so offline React previews fail [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | 'Loading preview…' before hydration; PreviewFrameLoading before payload | SandboxedIframe.tsx:388; ArtifactPreview.tsx:3255 |
| Timeout | Fallback frame after 15 s no document or 3 s no handshake | SandboxedIframe.tsx:37-38,224-233 |
| Render error | Error card with View source and Retry | ArtifactPreview.tsx:3240-3250 |
| Fallback scripts blocked | Banner says only layout is shown | SandboxedIframe.tsx:410-420 |
| Bad origin config | Origin treated as unset; fallback; env warning | artifact-sandbox.ts:153-175; validate-env.ts:439 |
| Hostile message | Dropped when source or origin is wrong | SandboxedIframe.tsx:244-246; index.html:946-950 |
| Stale runtime reply | Not delivered to a replaced frame | SandboxedIframe.tsx:287-292 |
| Picker in fallback | UI told it is unavailable | SandboxedIframe.tsx:339-341 |
| Accessibility | Frame has a title; status role on loading text | SandboxedIframe.tsx:397,386 |
| Offline | CDN scripts fail; render-error path [inferred] | infrastructure/sandbox/index.html:130,208-228 (scripts loaded from CDN hosts); no offline handling found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/SandboxedIframe.test.tsx`: Frame, handshake and fallback behaviour
- `apps/web/features/chat/components/SandboxedIframe.origin.test.tsx`: Ignores messages from other windows or origins, source check, runtime bridge rules, handshake recovery
- `apps/web/lib/__tests__/artifact-sandbox.test.ts`: Origin resolution and message parsing
- `apps/web/__tests__/security/sandbox-parent-origin.test.ts`: Parent origin allow-list, framing, desktop origins
- `apps/web/__tests__/security/sandbox-runtime-sri.test.ts`: Pinned versions and integrity hashes on every CDN script
- `apps/web/__tests__/security/iframe-sandbox-regression.test.ts`: Only the dedicated renderer combines allow-scripts and allow-same-origin
- `packages/contracts/types/src/__tests__/artifact-csp.test.ts`: Meta equals shared policy, invariants, host header no laxer than renderer policy
- `apps/web/features/chat/components/__tests__/sandbox-element-picker.test.ts`: Element picker
- `apps/web/features/chat/components/__tests__/sandboxed-iframe-scripts.test.ts`: Fallback script handling
- `infrastructure/sandbox/configure.test.mjs`: Extension parent configuration
- `apps/web/e2e/lib/renderer-sandbox-server.test.mjs`: Local renderer server used by browser tests

**Test scenarios**

- **Isolated render**
  1. Set the sandbox origin to a separate https host
  2. Open an HTML artifact
  3. Inspect the frame
  - Expected: src is the sandbox origin; app cookies unreadable from the artifact
- **Network blocked**
  1. Artifact calls fetch to an external host
  - Expected: Blocked by connect-src none
- **Fallback**
  1. Unset the sandbox origin
  2. Open an HTML artifact
  - Expected: Fallback frame; picker reports unavailable; script banner appears if inline scripts would be blocked
- **Unsupported import**
  1. Open a React artifact importing a package other than react
  - Expected: Error card; message says only React and ReactDOM are available
- **Same-origin misconfiguration**
  1. Set the sandbox origin equal to the app origin
  - Expected: Treated as unset; fallback used
- **Picker**
  1. Choose Request edits
  2. Click an element in the preview
  - Expected: Request box shows with the element's text; selection is refused if sent from another window

**Where to look when it fails**

- Console '[artifact-preview] render failed' and '[artifact-preview] fallback render failed' (SandboxedIframe.tsx:260,358)
- Env warning text 'NEXT_PUBLIC_SANDBOX_ORIGIN is not set, ...' (validate-env.ts:439)
- Renderer shows 'Render error: ...' inline

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Host header policy is narrower than the page meta policy: script hosts cdnjs and esm.sh and all CDN styles are missing from the header, so on the deployed web host only the narrower rule applies [inferred]** Affects: Web preview of artifacts using those hosts; desktop differs because it uses the meta policy. Evidence: infrastructure/sandbox/vercel.json:15 vs infrastructure/sandbox/index.html:56; test in packages/contracts/types/src/__tests__/artifact-csp.test.ts allows 'no laxer'. Work needed: Test a real artifact using each host on the deployed sandbox and align or document
- **Production sandbox origin management is unverified: no probe, only an env warning** Affects: Web security posture. Evidence: apps/web/lib/config/dependency-readiness.ts:172-176 (liveProbe null); validate-env.ts:439. Work needed: Add a live check; confirm the production variable
- **No dependency resolver** Affects: React artifacts that import libraries. Evidence: infrastructure/sandbox/index.html:749-755. Work needed: Decide scope
- **Previews depend on public CDNs** Affects: Offline and Local use, privacy. Evidence: index.html:130,208-228. Work needed: Vendor assets or document the dependency
- **No preview on mobile, VS Code, CLI** Affects: Those apps. Evidence: No renderer found in them. Work needed: Decide parity
- **Renderer kinds mermaid, markdown, text, code not used by the web panel preview** Affects: Engineers. Evidence: artifact-render.ts:12-16. Work needed: Remove or wire

**Depends on**

- SYS-security-and-privacy
- SYS-files-artifacts-and-storage
- SYS-shared-ui-and-design
- SYS-execution-boundaries
- surface:web
- surface:chrome
- file:infrastructure/sandbox/index.html

## Unknown

- Whether the production sandbox host is live and which value the production variable holds (no run record)
- Whether mobile has any live artifact preview (no renderer found in mobile artifacts)
- Effect on the deployed host of the header versus meta policy was not run
- VS Code artifacts tree preview behaviour
- Whether published artifact pages and thumbnails share exactly these controls beyond the shared frame component
