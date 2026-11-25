---
id: "GAPS-AREA-032"
type: "gap-list"
title: "Gaps: Design workspace"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 32. Design workspace

56 open gaps that touch this area. Area page: [20-features/032-design-workspace](../../20-features/032-design-workspace/README.md).

## GAP-AREA032-LW05

**S32.31 cites ArtifactPreview.tsx:745 and 1452 as export code. Line 745 is DOCX preview conversion; 1452 is the Save-to-Library request.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-032
- Detail: Area 32. Design workspace
- Evidence: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:745; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1447

## GAP-AREA032-LW06

**S32.34 cites packages/ui/design-tokens/src/foundation.css:173 as version-comparison code. That line is a symbol shine path token, unrelated to versions. Restore code was not located.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-032
- Detail: Area 32. Design workspace
- Evidence: packages/ui/design-tokens/src/foundation.css:173

## GAP-AREA032-LW07

**S32.34 cites ArtifactPreview.tsx:648 and 2124 for version and restore. Line 648 is draft-session state and 2124 is the edit-request send, not a restore.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-032
- Detail: Area 32. Design workspace
- Evidence: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:648; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2124

## GAP-F032-01-01

**Area brief says S32.01 is missing, but web code exists**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-01](../../20-features/032-design-workspace/F032-01-start-a-design-from-a-brief.md)
- Detail: Affects: Brief accuracy for web. Work needed: Update the status in the area brief.
- Evidence: design-brief.ts; NewArtifactMenu.tsx:87

## GAP-F032-01-02

**No brief on mobile, Chrome, VS Code, CLI**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-01](../../20-features/032-design-workspace/F032-01-start-a-design-from-a-brief.md)
- Detail: Affects: Those apps. Work needed: Decide scope, then reuse the shared builder.
- Evidence: no matches in app source searches

## GAP-F032-01-03

**Brief persistence depends on model compliance**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-01](../../20-features/032-design-workspace/F032-01-start-a-design-from-a-brief.md)
- Detail: Affects: All web users. Work needed: Add the comment in the app.
- Evidence: design-brief.ts:84-95

## GAP-F032-01-NOTBUILT

**Start a design from a brief: not built on Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, Chrome
- Features: [F032-01](../../20-features/032-design-workspace/F032-01-start-a-design-from-a-brief.md)
- Requirement items: S32.01
- Detail: Mobile: S32.01; Chrome: S32.01

## GAP-F032-02-01

**No alternatives on any app**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-02](../../20-features/032-design-workspace/F032-02-generate-alternatives.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome. Work needed: Design the multi-turn flow, compare view and usage limits.
- Evidence: S32.03 missing; no code

## GAP-F032-02-NOTBUILT

**Generate alternatives: not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F032-02](../../20-features/032-design-workspace/F032-02-generate-alternatives.md)
- Requirement items: S32.03
- Detail: Web: S32.03; Desktop: S32.03; Mobile: S32.03; Chrome: S32.03

## GAP-F032-03-01

**No canvas, frame list, breakpoint or scheme preview**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-03](../../20-features/032-design-workspace/F032-03-canvas-and-page-or-frame-list.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome. Work needed: Define frame model, then build canvas and toggles in shared UI.
- Evidence: S32.02/04/19/20 missing; no code

## GAP-F032-03-NOTBUILT

**Canvas and page or frame list: not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F032-03](../../20-features/032-design-workspace/F032-03-canvas-and-page-or-frame-list.md)
- Requirement items: S32.02, S32.04, S32.19, S32.20
- Detail: Web: S32.02, S32.04, S32.19, S32.20; Desktop: S32.02, S32.04, S32.19, S32.20; Mobile: S32.02, S32.04, S32.19, S32.20; Chrome: S32.02, S32.04, S32.19, S32.20

## GAP-F032-04-01

**Direct text editing on the design is not found**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-04](../../20-features/032-design-workspace/F032-04-select-and-change-an-element.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome. Work needed: Add inline editing of picked text with a stored version.
- Evidence: S32.06 in brief; no code in design folder

## GAP-F032-04-02

**No picker on mobile, Chrome, VS Code**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-04](../../20-features/032-design-workspace/F032-04-select-and-change-an-element.md)
- Detail: Affects: Those apps. Work needed: Share logic through unified-chat.
- Evidence: no matches for picker or replaceImageInHtml

## GAP-F032-04-03

**Area brief marks web missing while code exists**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-04](../../20-features/032-design-workspace/F032-04-select-and-change-an-element.md)
- Detail: Affects: Brief accuracy. Work needed: Update brief status.
- Evidence: ArtifactPreview.tsx:2089-2156

## GAP-F032-04-NOTBUILT

**Select and change an element: not built on Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, Chrome
- Features: [F032-04](../../20-features/032-design-workspace/F032-04-select-and-change-an-element.md)
- Requirement items: S32.05, S32.06, S32.14, S32.18
- Detail: Mobile: S32.05, S32.14, S32.18; Chrome: S32.05, S32.06, S32.14, S32.18

## GAP-F032-04-PARTLY

**Select and change an element: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F032-04](../../20-features/032-design-workspace/F032-04-select-and-change-an-element.md)
- Requirement items: S32.06

## GAP-F032-05-01

**No visual property controls**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-05](../../20-features/032-design-workspace/F032-05-position-layout-and-style-controls.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome. Work needed: Build selection style readout, properties panel and source writer.
- Evidence: items S32.07-13, S32.15 missing; no code

## GAP-F032-05-02

**Selection data has no computed styles**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-05](../../20-features/032-design-workspace/F032-05-position-layout-and-style-controls.md)
- Detail: Affects: Any future panel. Work needed: Extend the sandbox selection message.
- Evidence: artifact-edit-request.ts:3-7

## GAP-F032-05-NOTBUILT

**Position, layout and style controls: not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F032-05](../../20-features/032-design-workspace/F032-05-position-layout-and-style-controls.md)
- Requirement items: S32.07, S32.08, S32.09, S32.10, S32.11, S32.12, S32.13, S32.15
- Detail: Web: S32.07, S32.08, S32.09, S32.10, S32.11, S32.12, S32.13, S32.15; Desktop: S32.07, S32.08, S32.09, S32.10, S32.11, S32.12, S32.13, S32.15; Mobile: S32.07, S32.08, S32.09, S32.10, S32.11, S32.12, S32.13, S32.15; Chrome: S32.07, S32.08, S32.09, S32.10, S32.11, S32.12, S32.13, S32.15

## GAP-F032-06-01

**No live sliders**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-06](../../20-features/032-design-workspace/F032-06-alternatives-and-live-sliders.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome. Work needed: Define slider metadata, a panel, and frame messages.
- Evidence: S32.16 missing; no code

## GAP-F032-06-NOTBUILT

**Alternatives and live sliders: not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F032-06](../../20-features/032-design-workspace/F032-06-alternatives-and-live-sliders.md)
- Requirement items: S32.16
- Detail: Web: S32.16; Desktop: S32.16; Mobile: S32.16; Chrome: S32.16

## GAP-F032-07-01

**Element and slide comments have no on-design pin or locate behaviour.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-07](../../20-features/032-design-workspace/F032-07-comments-on-the-design.md)
- Detail: Affects: Web and the Desktop window; the S32.17 'pin to a spot' requirement.. Work needed: Render pins from x/y and selector, scroll to element, and a slide marker.
- Evidence: use-comment-highlights.ts:120,137-152

## GAP-F032-07-02

**No Mobile, Chrome, VS Code, CLI or Tauri comments.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-07](../../20-features/032-design-workspace/F032-07-comments-on-the-design.md)
- Detail: Affects: Mobile, Chrome, Tauri desktop users.. Work needed: Decide scope per the parity plan, then build on the shared contract.
- Evidence: repo-wide search for artifact-comment contract names found only web and contracts

## GAP-F032-07-03

**Comments are not gated by chat boundary (temporary or Local) and send artifact quotes to our servers.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-07](../../20-features/032-design-workspace/F032-07-comments-on-the-design.md)
- Detail: Affects: Web and Desktop window users in temporary or locally answered chats [inferred].. Work needed: Hide or refuse comments for those chats or keep them on the device.
- Evidence: ArtifactPreview.tsx:2213 versus artifacts-store.ts:1059-1072

## GAP-F032-07-04

**No assistant-authored comments are produced although the schema supports them.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-07](../../20-features/032-design-workspace/F032-07-comments-on-the-design.md)
- Detail: Affects: All users.. Work needed: Either add a producer or remove the field.
- Evidence: artifact-comments-client.ts:166-170

## GAP-F032-07-05

**The brief lists every app as missing; it is out of date for web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-07](../../20-features/032-design-workspace/F032-07-comments-on-the-design.md)
- Detail: Affects: Brief readers.. Work needed: Update the brief rows.
- Evidence: comments/route.ts

## GAP-F032-07-NOTBUILT

**Comments on the design: not built on Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, Chrome
- Features: [F032-07](../../20-features/032-design-workspace/F032-07-comments-on-the-design.md)
- Requirement items: S32.17
- Detail: Mobile: S32.17; Chrome: S32.17

## GAP-F032-08-01

**No design-system import, component library, token mapping or conformance feedback.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-08](../../20-features/032-design-workspace/F032-08-design-system-and-brand-library.md)
- Detail: Affects: All apps; HTML design users.. Work needed: Define a design-system payload, import path, token view and a checker.
- Evidence: no code found; brief S32.21-S32.25

## GAP-F032-08-02

**Brand does not apply to HTML designs and carries no logos or imagery.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-08](../../20-features/032-design-workspace/F032-08-design-system-and-brand-library.md)
- Detail: Affects: Web users making designs.. Work needed: Extend payload and wire brand into design requests.
- Evidence: ArtifactPreview.tsx:2473; studio-library.ts:25-33

## GAP-F032-08-03

**Document brand apply ignores brand colours and fonts.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-08](../../20-features/032-design-workspace/F032-08-design-system-and-brand-library.md)
- Detail: Affects: Web users.. Work needed: Pass them in the request or style the document.
- Evidence: brand-request.ts:9-13

## GAP-F032-08-04

**Library is web-only and cloud-only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-08](../../20-features/032-design-workspace/F032-08-design-system-and-brand-library.md)
- Detail: Affects: Mobile, Chrome, VS Code, CLI, local use.. Work needed: Decide per-surface scope.
- Evidence: no other app references STUDIO_LIBRARY_PATH

## GAP-F032-08-NOTBUILT

**Design system and brand library: not built on Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, Chrome
- Features: [F032-08](../../20-features/032-design-workspace/F032-08-design-system-and-brand-library.md)
- Requirement items: S32.21, S32.22, S32.23, S32.24, S32.25
- Detail: Mobile: S32.21, S32.22, S32.23, S32.24, S32.25; Chrome: S32.21, S32.22, S32.23, S32.24, S32.25

## GAP-F032-09-01

**No prototype mode or screen navigation.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-09](../../20-features/032-design-workspace/F032-09-prototype-and-interactive-states.md)
- Detail: Affects: All apps.. Work needed: Screen model, frame list, link wiring.
- Evidence: brief S32.26; no code found

## GAP-F032-09-02

**No forced interactive-state previews.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-09](../../20-features/032-design-workspace/F032-09-prototype-and-interactive-states.md)
- Detail: Affects: All apps.. Work needed: State toggling design and generation convention.
- Evidence: brief S32.27; no code found

## GAP-F032-09-03

**Brief marks Chrome partial/unverified without matching code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-09](../../20-features/032-design-workspace/F032-09-prototype-and-interactive-states.md)
- Detail: Affects: Brief readers.. Work needed: Correct the brief.
- Evidence: artifactPanel.ts:278-286 shows plain render only

## GAP-F032-09-NOTBUILT

**Prototype and interactive states: not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F032-09](../../20-features/032-design-workspace/F032-09-prototype-and-interactive-states.md)
- Requirement items: S32.26, S32.27
- Detail: Chrome: S32.26, S32.27

## GAP-F032-09-PARTLY

**Prototype and interactive states: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F032-09](../../20-features/032-design-workspace/F032-09-prototype-and-interactive-states.md)
- Requirement items: S32.26, S32.27

## GAP-F032-10-01

**No Figma import or export for designs.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-10](../../20-features/032-design-workspace/F032-10-handoff-and-sync-with-code-and-figma.md)
- Detail: Affects: All apps.. Work needed: Define format, use connector tools, add UI.
- Evidence: no code beyond connector entry

## GAP-F032-10-02

**No code-to-design sync.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-10](../../20-features/032-design-workspace/F032-10-handoff-and-sync-with-code-and-figma.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome.. Work needed: Needs a design model that code edits can map back to.
- Evidence: brief S32.29; none found

## GAP-F032-10-03

**Handoff marked not applicable though source export exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-10](../../20-features/032-design-workspace/F032-10-handoff-and-sync-with-code-and-figma.md)
- Detail: Affects: Planning.. Work needed: Decide the status.
- Evidence: brief S32.28 versus ArtifactPreview.tsx:2388

## GAP-F032-10-NOTBUILT

**Handoff and sync with code and Figma: not built on Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop, Mobile, Chrome
- Features: [F032-10](../../20-features/032-design-workspace/F032-10-handoff-and-sync-with-code-and-figma.md)
- Requirement items: S32.29, S32.30
- Detail: Desktop: S32.29; Mobile: S32.29; Chrome: S32.29, S32.30

## GAP-F032-11-01

**No PNG or other image export of a rendered design on any app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-11](../../20-features/032-design-workspace/F032-11-export-the-design.md)
- Detail: Affects: All apps.. Work needed: Render the sandboxed page to an image.
- Evidence: ArtifactPreview.tsx:2371 (image only for image artifacts)

## GAP-F032-11-02

**No PDF of an HTML design.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-11](../../20-features/032-design-workspace/F032-11-export-the-design.md)
- Detail: Affects: All apps.. Work needed: Product decision, then print path.
- Evidence: ArtifactPreview.tsx:2397-2411

## GAP-F032-11-03

**Mobile has no archive export.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-11](../../20-features/032-design-workspace/F032-11-export-the-design.md)
- Detail: Affects: Mobile.. Work needed: Add zip.
- Evidence: artifactExport.ts:19

## GAP-F032-11-04

**Zip HTML differs from single-file HTML.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-11](../../20-features/032-design-workspace/F032-11-export-the-design.md)
- Detail: Affects: Web.. Work needed: Use one builder.
- Evidence: downloadArtifacts.ts:117 versus ArtifactPreview.tsx:1393

## GAP-F032-11-05

**Brief's code citations for CLI are wrong and statuses (PDF not applicable) are stale.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-11](../../20-features/032-design-workspace/F032-11-export-the-design.md)
- Detail: Affects: Brief readers.. Work needed: Correct the brief.
- Evidence: lib.rs:1034 and 1942 are other commands

## GAP-F032-11-06

**Chrome download and VS Code save status not tested in the brief; code exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-11](../../20-features/032-design-workspace/F032-11-export-the-design.md)
- Detail: Affects: Brief readers.. Work needed: Update statuses.
- Evidence: artifactPanel.ts:381; artifactActions.ts:163

## GAP-F032-11-NOTBUILT

**Export the design: not built on Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F032-11](../../20-features/032-design-workspace/F032-11-export-the-design.md)
- Requirement items: S32.33
- Detail: Mobile: S32.33

## GAP-F032-11-PARTLY

**Export the design: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F032-11](../../20-features/032-design-workspace/F032-11-export-the-design.md)
- Requirement items: S32.31, S32.33

## GAP-F032-12-01

**Only the previous version can be compared; no arbitrary pair.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-12](../../20-features/032-design-workspace/F032-12-version-comparison-and-restore.md)
- Detail: Affects: Web and Mobile.. Work needed: Pick-two UI and engine call with chosen versions.
- Evidence: ArtifactPreview.tsx:991-993; ArtifactFullScreen.tsx:608-610

## GAP-F032-12-02

**Mobile restore has no confirmation.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-12](../../20-features/032-design-workspace/F032-12-version-comparison-and-restore.md)
- Detail: Affects: Mobile users.. Work needed: Add the confirmation or document the reason.
- Evidence: ArtifactFullScreen.tsx:811-817

## GAP-F032-12-03

**Compare is textual, not visual, for rendered designs.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-12](../../20-features/032-design-workspace/F032-12-version-comparison-and-restore.md)
- Detail: Affects: Design users on Web and Mobile.. Work needed: Rendered side-by-side [proposed].
- Evidence: ArtifactChangesView.tsx:97-130

## GAP-F032-12-04

**Chrome has no version history; brief says unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-12](../../20-features/032-design-workspace/F032-12-version-comparison-and-restore.md)
- Detail: Affects: Chrome users.. Work needed: Decide scope.
- Evidence: search of artifactPanel.ts for version found nothing

## GAP-F032-12-05

**Brief citations foundation.css:173 and theme-contrast.test.ts:314 do not relate to this feature.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F032-12](../../20-features/032-design-workspace/F032-12-version-comparison-and-restore.md)
- Detail: Affects: Brief readers.. Work needed: Replace citations.
- Evidence: files read show logo tokens and brand mark tokens

## GAP-F032-12-NOTBUILT

**Version comparison and restore: not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F032-12](../../20-features/032-design-workspace/F032-12-version-comparison-and-restore.md)
- Requirement items: S32.34
- Detail: Chrome: S32.34

## GAP-F032-12-PARTLY

**Version comparison and restore: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F032-12](../../20-features/032-design-workspace/F032-12-version-comparison-and-restore.md)
- Requirement items: S32.34
