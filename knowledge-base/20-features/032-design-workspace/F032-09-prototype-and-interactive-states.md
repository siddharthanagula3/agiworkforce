---
id: "F032-09"
type: "feature"
title: "Prototype and interactive states"
aliases: ["Prototype and interactive states", "Prototype navigation (S32.26)", "Interactive-state previews (S32.27)", "Click-through prototype"]
area: "32 Design workspace"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S32.26", "S32.27"]
depends_on: ["surface:web", "surface:mobile", "surface:chrome", "mode:cloud", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-shared-ui-and-design", "F032-07"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F032-09 Prototype and interactive states

Not built as a feature. HTML designs run live in a sandboxed frame on Web, Mobile and the Chrome side panel, so whatever links and scripts the model wrote work inside that one page. There is no screen list, link-to-screen model, or forced hover, pressed, disabled or empty state preview in any app.

Area: [32. Design workspace](README.md). Requirement items: [S32.26](../../10-requirements/capabilities/032-design-workspace.md#s3226), [S32.27](../../10-requirements/capabilities/032-design-workspace.md#s3227).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Intended: click through a design from screen to screen and preview hover, pressed, disabled and empty states. (area brief S32.26, S32.27) Today only the live rendering of the generated page exists.

**Why it exists.** The visual design workspace requirement names a prototype or preview mode for connected screens or deck-like flows. (docs/product/requirements.md:1487)

**Who uses it.** Designers and product people reviewing a generated design. No one can use a dedicated prototype mode yet.

**Problems it solves**

- Judging whether a flow works, not only how one screen looks.
- Seeing states that need the mouse or data to appear.

**Use cases**

- Click a button in a generated landing page that the model wired to scroll or show a panel.
- Preview a button's disabled look without editing the code.
- Walk from a login screen to a dashboard screen.

## 2. User experience

**Where to find it**

- Web: Preview tab of an HTML artifact in the side panel (ArtifactPreview.tsx:3240-3262).
- Mobile: full-screen artifact preview in a web view (SafeArtifactPreview.tsx:287).
- Chrome: side panel renders HTML artifacts in a sandboxed frame (apps/extension/src/features/side-panel/artifactPanel.ts:278-286).
- No prototype or state controls exist in any app.

**Before you start**

- An HTML or React artifact that has rendered.

**Screens and controls**

- Preview and code tabs, Refresh preview, Open in new tab (ArtifactPreview.tsx:2362-2372).
- No screen list, link editor, or state switcher found.

**Journey**

1. Open an HTML design.
2. Use the page by clicking inside the frame; the page's own scripts decide what happens.
3. Use Open in new tab for a larger view.

**What the person sees and gets**

- On Web an empty page shows 'Nothing to preview yet.' (ArtifactPreview.tsx:3238).
- On Mobile a slow page shows 'This preview did not finish loading.' (SafeArtifactPreview.tsx:37).

**Settings**

- none found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web renders HTML in a frame with sandbox allow-scripts allow-modals and no same-origin right (SandboxedIframe.tsx:427); the sanitiser keeps inline event attributes, so a page's own handlers can run [inferred] (html-sanitizer.ts:338-342).
- Mobile runs scripts for html and react in a web view with a navigation guard that stops leaving the preview (SafeArtifactPreview.tsx:90,287).
- Chrome side panel builds a sandboxed HTML payload (artifactPanel.ts:278-286).

**Incomplete**

- The brief marks Chrome partial; the code shows only the live render, not prototype features.

**Present but disconnected or switched off**

- none found.

**Not available**

- Prototype links between screens, screen or frame list, forced hover, pressed, disabled or empty previews on every app. A search for prototype and state-preview terms in web chat features and the extension found only unrelated hits.

## 4. Required behaviour

**Established requirements**

- A prototype can be clicked through: interactions navigate between screens (S32.26). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S32.26)
- The user can preview interactive states: hover, pressed, disabled, empty (S32.27). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S32.27)
- The design workspace has a prototype or preview mode for connected screens or deck-like flows; it is not Mobile v1 scope unless the founder narrows it. (source: docs/product/requirements.md:1474-1488)
- Executable previews cannot access the app session or silently expand network permissions. (source: docs/product/experience-contract.md:782 (W09))

**Acceptance criteria**

1. [proposed] A design with several screens lists them and a click on a linked element opens the target screen.
2. [proposed] A state switcher shows hover, pressed, disabled and empty looks of a picked element.
3. Any prototype stays inside the sandbox with no app session access (W09).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Multi-screen flows need a frame list first (S32.04), which is also not built. [inferred]

**Proposed improvements** (suggestions, not requirements)

- Ask the model to emit screens as named sections and add a screen switcher.
- Force pseudo-states by toggling a class set the model is told to use.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | SandboxedIframe | `apps/web/features/chat/components/SandboxedIframe.tsx` | Nearest existing code, does not implement this: frames artifact HTML with allow-scripts allow-modals (427). |
| other | artifact-render | `apps/web/features/chat/components/artifacts/artifact-render.ts` | Nearest existing code, does not implement this: builds the preview document per type. |
| other | html-sanitizer | `apps/web/shared/utils/html-sanitizer.ts` | Nearest existing code, does not implement this: sanitises preview HTML, keeps event attributes (338-342). |
| component | ArtifactEditRequestLayer | `apps/web/features/chat/components/artifacts/ArtifactEditRequestLayer.tsx` | Nearest existing code, does not implement this: element picker over the preview. |
| other | artifact-sandbox | `apps/web/lib/artifact-sandbox.ts` | Nearest existing code, does not implement this: picker messages and sandbox origin (158). |
| component | ArtifactPreview preview area | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Nearest existing code, does not implement this: preview, empty and error states (3230-3262). |
| component | SafeArtifactPreview | `apps/mobile/src/features/chat/components/SafeArtifactPreview.tsx` | Nearest existing code, does not implement this: Mobile web view with navigation guard. |
| test | SafeArtifactPreview navigation test | `apps/mobile/src/features/chat/components/__tests__/SafeArtifactPreview.navigation.test.ts` | Covers the navigation guard (test names not read). |
| component | Chrome artifact panel | `apps/extension/src/features/side-panel/artifactPanel.ts` | Nearest existing code, does not implement this: sandboxed HTML payload for the side panel. |
| component | Shared ArtifactRenderer HtmlArtifact | `packages/ui/unified-chat/src/components/ArtifactRenderer.tsx` | Nearest existing code, does not implement this: HTML preview in the shared chat UI (250-300). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Artifact HTML is sanitised and wrapped with a content security policy. | device | artifact-render.ts:28-35; html-sanitizer.ts:406-435 |
| The page is shown in a sandboxed frame; clicks and scripts run inside it. | device | SandboxedIframe.tsx:427 |
| No state or screen data is created or stored by a prototype feature. | device | none found |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| No prototype data exists | none | no | not applicable |

**Models and providers.** No model takes part in the preview. Producing multi-screen HTML would be a model request; none is wired for prototypes. [inferred]

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Preview of an existing artifact needs no extra account rule in the code read; prototype itself not built. |
| Permissions | Frame has no same-origin right (SandboxedIframe.tsx:427). |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | The cross-origin sandbox is used when configured, else a null-origin srcDoc fallback (artifact-render.ts:20-23 comment). |
| Model compatibility | not applicable. |
| Provider restrictions | none found in the code. |
| Local mode | Rendering a stored artifact happens on the device. Prototype features do not exist in Local mode on any app. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| empty | Web: 'Nothing to preview yet.' | ArtifactPreview.tsx:3238 |
| render error | Web shows an error branch with refresh; Mobile offers retry with timeout text. | ArtifactPreview.tsx:3242; SafeArtifactPreview.tsx:37-38 |
| link out of the page | Mobile guards navigation and offers external links a limited number of times. | SafeArtifactPreview.tsx:39-40,287 |
| hover on touch devices | not handled in the code. | searched, nothing found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/src/features/chat/components/__tests__/SafeArtifactPreview.navigation.test.ts`: Navigation guard of the Mobile preview (names not read).
- `apps/web/features/chat/components/artifacts/ArtifactPreview.test.tsx`: General panel preview behaviour (not read in detail).

**Test scenarios**

- **Live inside the page**
  1. Ask for a landing page with a button that toggles a menu.
  2. Open the preview and click the button.
  - Expected: The menu toggles inside the frame (model-written script).
- **No screen list**
  1. Ask for a three-screen app flow in one design.
  2. Look for a list of screens.
  - Expected: None exists; screens are only parts of one page.
- **No state switcher**
  1. Pick an element with Request edits.
  - Expected: Options are only describe the change, replace image, comment; no state controls.
- **Sandbox rule**
  1. Open a design whose script reads cookies.
  - Expected: No app session is readable (W09).

**Where to look when it fails**

- Web preview error text and Refresh preview.
- Mobile 'This preview did not finish loading.'

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No prototype mode or screen navigation.** Affects: All apps.. Evidence: brief S32.26; no code found. Work needed: Screen model, frame list, link wiring.
- **No forced interactive-state previews.** Affects: All apps.. Evidence: brief S32.27; no code found. Work needed: State toggling design and generation convention.
- **Brief marks Chrome partial/unverified without matching code.** Affects: Brief readers.. Evidence: artifactPanel.ts:278-286 shows plain render only. Work needed: Correct the brief.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:chrome
- mode:cloud
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-shared-ui-and-design
- F032-07

## Unknown

- What the brief means by Chrome partial for S32.26 and S32.27.
- Whether Desktop Tauri has its own preview with these features (shared ArtifactRenderer only partly read).
- Whether the sanitiser removes all scripts in some paths (only event-attribute hook read).
