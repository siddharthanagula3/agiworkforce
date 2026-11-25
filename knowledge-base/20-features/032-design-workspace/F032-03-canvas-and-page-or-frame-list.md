---
id: "F032-03"
type: "feature"
title: "Canvas and page or frame list"
aliases: ["Artboard canvas", "Page or frame list", "Breakpoint preview", "Light and dark preview", "S32.02", "S32.04", "S32.19", "S32.20"]
area: "32 Design workspace"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S32.02", "S32.04", "S32.19", "S32.20"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "SYS-files-artifacts-and-storage", "SYS-shared-ui-and-design", "file:apps/web/features/chat/components/SandboxedIframe.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F032-03 Canvas and page or frame list

Required: a pannable, zoomable canvas with a page or frame list, plus device-width and light or dark preview. Not built in the code opened. The artifact preview shows one document in a sandboxed frame, with no canvas, page list, width or colour-scheme switch found.

Area: [32. Design workspace](README.md). Requirement items: [S32.02](../../10-requirements/capabilities/032-design-workspace.md#s3202), [S32.04](../../10-requirements/capabilities/032-design-workspace.md#s3204), [S32.19](../../10-requirements/capabilities/032-design-workspace.md#s3219), [S32.20](../../10-requirements/capabilities/032-design-workspace.md#s3220).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would let a person see a design on a canvas with several frames, switch frames, and preview at desktop, tablet or mobile width in light or dark mode.

**Why it exists.** Items S32.02, S32.04, S32.19, S32.20 require these; the requirements doc asks for a large pan and zoom canvas with fixed-size artboards (docs/product/requirements.md:1480-1483).

**Who uses it.** Designers and builders using web, desktop, mobile or Chrome, once built.

**Problems it solves**

- Seeing how a design looks on a phone versus a desktop.
- Checking dark mode without rewriting the design.
- Working with multi-screen designs.

**Use cases**

- Check a landing page at phone width.
- Switch to dark mode to inspect contrast.
- Jump between screens of an app design.

## 2. User experience

**Where to find it**

- Not available on any app. Web artifact preview renders one HTML document in a sandboxed iframe (apps/web/features/chat/components/SandboxedIframe.tsx).

**Before you start**

- Web sandbox origin configured: preview features need NEXT_PUBLIC_SANDBOX_ORIGIN, else an opaque fallback is used (apps/web/lib/artifact-sandbox.ts:158-174).

**Screens and controls**

- None for canvas, page list, breakpoints or scheme. A search of ArtifactPreview.tsx for colour-scheme and breakpoint controls found only the document viewport meta tag (ArtifactPreview.tsx:874).

**Journey**

1. Not available.

**What the person sees and gets**

- none found.

**Settings**

- none found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Single-document preview in a sandboxed frame on web (SandboxedIframe.tsx).

**Incomplete**

- The page's own viewport meta is in the preview wrapper (ArtifactPreview.tsx:874), not a user control.

**Present but disconnected or switched off**

- none found.

**Not available**

- Canvas, artboards, pan and zoom, page list, breakpoint and scheme switch: not found on web, desktop, mobile or chrome.

## 4. Required behaviour

**Established requirements**

- A canvas shows one or more artboards that can be panned and zoomed. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S32.02)
- A panel lists pages or frames and switches between them. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S32.04)
- Preview switches desktop, tablet and mobile widths. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S32.19)
- Preview switches light and dark colour schemes. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S32.20)
- Prototype mode for connected screens; multi-artboard history. (source: docs/product/requirements.md:1485-1489)

**Acceptance criteria**

1. Mouse wheel or pinch zooms; drag pans.
2. A frame list shows every page and selecting one shows it.
3. Width choices change the frame width without reload.
4. Scheme toggle changes the design's preferred colour scheme.
5. Settings persist per design or per viewer.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A single HTML artifact has no frames, so a frame model is needed first [inferred].

**Proposed improvements** (suggestions, not requirements)

- Start with width and scheme toggles on web, since the iframe already exists.
- Define a multi-frame artifact format before building the page list.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | SandboxedIframe | `apps/web/features/chat/components/SandboxedIframe.tsx` | Renders artifact HTML in a frame; where a width and scheme control would act. |
| other | artifact-sandbox | `apps/web/lib/artifact-sandbox.ts` | Sandbox origin and picker message helpers. |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Preview host and toolbar. |
| component | ArtifactsPanel | `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` | Panel listing artifacts (one list, not frames). |
| component | ArtifactFullScreen | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | Mobile full-screen artifact view. |
| other | artifactPanel | `apps/extension/src/features/side-panel/artifactPanel.ts` | Chrome side-panel artifact panel. |
| other | requirements | `docs/product/requirements.md` | Section 17.1 requirements. |
| other | area brief | `knowledge-base/data/area-briefs/032-design-workspace.md` | Items S32.02, 04, 19, 20. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Today the HTML is placed in a sandboxed frame in the browser; no canvas. | device | SandboxedIframe.tsx; artifact-sandbox.ts:158 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| none for canvas state | not applicable | not applicable | not applicable |

**Models and providers.** No model involvement in viewing. Generating several frames would need a model [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code. |
| Permissions | none found in the code. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | Preview depends on the sandbox origin setting NEXT_PUBLIC_SANDBOX_ORIGIN (artifact-sandbox.ts:158-160). |
| Model compatibility | not applicable |
| Provider restrictions | none found in the code. |
| Local mode | Viewing runs on the device; no canvas exists, so nothing Local-specific. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| sandbox not configured | Falls back to an opaque srcDoc frame and request-edits is unavailable. | ArtifactPreview.tsx:2099; artifact-sandbox.ts:158-160 |
| canvas, zoom, frame list states | not handled in the code. | no code found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/ArtifactPreview.header.test.tsx`: Preview header controls; no canvas coverage.

**Test scenarios**

- **Confirm absence**
  1. Open any HTML artifact on web
  2. Look for zoom, page list, width or scheme control
  - Expected: None present today.
- **Future: width**
  1. Choose mobile width
  - Expected: Frame narrows to phone width.
- **Future: dark**
  1. Toggle dark
  - Expected: prefers-color-scheme in the design becomes dark.
- **Future: frames**
  1. Open a two-frame design
  2. Pick frame 2
  - Expected: Frame 2 shows.

**Where to look when it fails**

- Check NEXT_PUBLIC_SANDBOX_ORIGIN when preview falls back.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No canvas, frame list, breakpoint or scheme preview** Affects: Web, Desktop, Mobile, Chrome. Evidence: S32.02/04/19/20 missing; no code. Work needed: Define frame model, then build canvas and toggles in shared UI.
- Not built on: Web, Desktop, Mobile, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- SYS-files-artifacts-and-storage
- SYS-shared-ui-and-design
- file:apps/web/features/chat/components/SandboxedIframe.tsx

## Unknown

- Whether a hidden width or scheme control exists in toolbar code not read in full (ArtifactPreview.tsx is large).
- Whether the Chrome side panel has preview toggles.
