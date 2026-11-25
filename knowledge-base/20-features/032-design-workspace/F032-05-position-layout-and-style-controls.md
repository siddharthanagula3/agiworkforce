---
id: "F032-05"
type: "feature"
title: "Position, layout and style controls"
aliases: ["Position and size", "Align", "Layers", "Group", "Colour, typography and spacing controls", "Component swap", "S32.07-S32.13", "S32.15"]
area: "32 Design workspace"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S32.07", "S32.08", "S32.09", "S32.10", "S32.11", "S32.12", "S32.13", "S32.15"]
depends_on: ["F032-04", "F032-03", "surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "SYS-shared-ui-and-design", "SYS-files-artifacts-and-storage"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F032-05 Position, layout and style controls

Required: visual controls to move, size, align, layer, group, colour, restyle, space and swap components of a selected element. None exist in the code opened. Today a person changes style by typing a request, after picking an element (see F032-04).

Area: [32. Design workspace](README.md). Requirement items: [S32.07](../../10-requirements/capabilities/032-design-workspace.md#s3207), [S32.08](../../10-requirements/capabilities/032-design-workspace.md#s3208), [S32.09](../../10-requirements/capabilities/032-design-workspace.md#s3209), [S32.10](../../10-requirements/capabilities/032-design-workspace.md#s3210), [S32.11](../../10-requirements/capabilities/032-design-workspace.md#s3211), [S32.12](../../10-requirements/capabilities/032-design-workspace.md#s3212), [S32.13](../../10-requirements/capabilities/032-design-workspace.md#s3213), [S32.15](../../10-requirements/capabilities/032-design-workspace.md#s3215).

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

**What it does.** Would give a properties panel for a selected element with position, size, alignment, layers, grouping, colour, typography, spacing and component replacement.

**Why it exists.** Items S32.07 to S32.13 and S32.15 require them; the requirements doc asks for a properties panel for position, size, colour, typography and opacity, and a layers panel (docs/product/requirements.md:1484-1485).

**Who uses it.** People fine-tuning a design without waiting for the model; none yet.

**Problems it solves**

- Small visual tweaks costing a model turn.
- No precise control over layout.

**Use cases**

- Nudge a card 8 pixels.
- Change a heading colour with a picker.
- Reorder layers.

## 2. User experience

**Where to find it**

- Not available on any app.

**Before you start**

- Not applicable.

**Screens and controls**

- None. Nearest: the picked-element field 'Describe the change...' (ArtifactEditRequestLayer.tsx:14).

**Journey**

1. Not available. Workaround: pick an element and type the change to the model.

**What the person sees and gets**

- none found.

**Settings**

- none found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing for these controls. Selection by picker works on web (F032-04).

**Incomplete**

- Selection gives CSS path, text and markup only, not computed style (artifact-edit-request.ts:3-7).

**Present but disconnected or switched off**

- none found.

**Not available**

- x/y, w/h, align, layers, group, colour, font, spacing, component swap: no code on web, desktop, mobile, chrome. Searched the artifacts and design folders.

## 4. Required behaviour

**Established requirements**

- Position and size controls change the selected element. (source: S32.07)
- Align and distribute controls. (source: S32.08)
- A layers panel reorders and hides layers. (source: S32.09)
- Group and ungroup. (source: S32.10)
- Colour controls. (source: S32.11)
- Typography controls (font, size, weight, line height). (source: S32.12)
- Spacing controls (padding, margin, gap). (source: S32.13)
- Swap one component instance for another. (source: S32.15)
- Properties panel for position, size, colour, typography and opacity. (source: docs/product/requirements.md:1484-1485)

**Acceptance criteria**

1. Changing a value updates the preview at once.
2. The change is saved as a new version.
3. Undo restores the previous value.
4. Controls act only on the selected element.
5. Controls are reachable by keyboard.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Style edits can be written into the HTML source like replaceImageInHtml does for images [inferred from design-edits.ts].

**Proposed improvements** (suggestions, not requirements)

- Start with colour and spacing, which map to CSS properties.
- Reuse the image-edit approach of changing source directly, with no model call.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | design-edits | `apps/web/features/chat/components/artifacts/design/design-edits.ts` | Only direct source-edit helper (images); pattern to extend. |
| component | ArtifactEditRequestLayer | `apps/web/features/chat/components/artifacts/ArtifactEditRequestLayer.tsx` | Selection UI where a properties panel would attach. |
| other | artifact-sandbox | `apps/web/lib/artifact-sandbox.ts` | Selection data from the frame (selector, rect, text, html). |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Host and version store writes. |
| other | artifact-edit-request | `packages/ui/unified-chat/src/lib/artifact-edit-request.ts` | Model-based fallback for any change. |
| other | requirements | `docs/product/requirements.md` | Section 17.1. |
| other | area brief | `knowledge-base/data/area-briefs/032-design-workspace.md` | Items S32.07-13 and S32.15. |
| other | design tokens | `packages/ui/design-tokens/src/foundation.css` | Design token values referenced by the brief, not controls. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Not implemented. | device | no code found |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| none | not applicable | not applicable | not applicable |

**Models and providers.** A direct-edit panel would need no model [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code. |
| Permissions | none found in the code. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | not applicable |
| Provider restrictions | none found in the code. |
| Local mode | No feature; a direct-edit panel would work with no network [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| any | not handled in the code; feature absent. | no code found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/design/design-edits.test.ts`: Image replacement only; nothing for position, colour or layout.

**Test scenarios**

- **Confirm absence**
  1. Pick an element
  2. Look for colour, size, align controls
  - Expected: Only 'Describe the change...' is offered.
- **Future: colour**
  1. Pick heading
  2. Choose a colour
  - Expected: Heading colour changes and a version is added.
- **Future: undo**
  1. Press undo
  - Expected: Colour returns.

**Where to look when it fails**

- Not applicable until built.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No visual property controls** Affects: Web, Desktop, Mobile, Chrome. Evidence: items S32.07-13, S32.15 missing; no code. Work needed: Build selection style readout, properties panel and source writer.
- **Selection data has no computed styles** Affects: Any future panel. Evidence: artifact-edit-request.ts:3-7. Work needed: Extend the sandbox selection message.
- Not built on: Web, Desktop, Mobile, Chrome (from the capability ledger).

**Depends on**

- F032-04
- F032-03
- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- SYS-shared-ui-and-design
- SYS-files-artifacts-and-storage

## Unknown

- Whether any design-token mapping (S32.24) is planned to feed these controls.
