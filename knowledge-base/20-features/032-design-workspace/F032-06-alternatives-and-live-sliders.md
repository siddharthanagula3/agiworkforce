---
id: "F032-06"
type: "feature"
title: "Alternatives and live sliders"
aliases: ["Alternatives and live sliders", "Custom adjustment sliders", "S32.16"]
area: "32 Design workspace"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S32.16"]
depends_on: ["F032-03", "F032-04", "surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "SYS-shared-ui-and-design", "SYS-files-artifacts-and-storage"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F032-06 Alternatives and live sliders

Required: sliders such as density, radius and hue that change a design live. Not built in the code opened. No slider or live-parameter code was found for designs on any app.

Area: [32. Design workspace](README.md). Requirement items: [S32.16](../../10-requirements/capabilities/032-design-workspace.md#s3216).

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

**What it does.** Would let the design expose a few adjustable values and update at once as a slider moves.

**Why it exists.** Item S32.16 requires custom adjustment sliders (doc: knowledge-base/data/area-briefs/032-design-workspace.md).

**Who uses it.** Web, Desktop, Mobile and Chrome users, once built.

**Problems it solves**

- Trying small variations without a model turn each time.
- Exploring density or colour mood quickly.

**Use cases**

- Slide corner radius from sharp to round.
- Shift hue of a brand colour.
- Tighten or loosen spacing.

## 2. User experience

**Where to find it**

- Not available on any app.

**Before you start**

- Not applicable.

**Screens and controls**

- None found.

**Journey**

1. Not available.

**What the person sees and gets**

- none found.

**Settings**

- none found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing for sliders.

**Incomplete**

- none.

**Present but disconnected or switched off**

- none found.

**Not available**

- Sliders on web, desktop, mobile, chrome: no code found.

## 4. Required behaviour

**Established requirements**

- The design exposes custom adjustment sliders (for example density, radius, hue) that update it live. (source: S32.16)

**Acceptance criteria**

1. Each slider shows a name and current value.
2. Moving a slider updates the preview without a model turn.
3. The chosen values are saved with the design.
4. Reset restores defaults.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Sliders likely map to CSS variables the model defines in the HTML [inferred].

**Proposed improvements** (suggestions, not requirements)

- Ask the model to declare slider names and CSS variables in a comment, like the brief comment, and render sliders from it.
- Send slider messages into the sandbox frame by the existing message channel.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | design-brief | `apps/web/features/chat/components/artifacts/design/design-brief.ts` | Comment-in-source pattern that sliders metadata could copy. |
| component | SandboxedIframe | `apps/web/features/chat/components/SandboxedIframe.tsx` | Message channel to the frame. |
| other | artifact-sandbox | `apps/web/lib/artifact-sandbox.ts` | Message helpers for the frame. |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Preview host. |
| other | design tokens | `packages/ui/design-tokens/src/foundation.css` | Shared tokens; not user-adjustable. |
| other | area brief | `knowledge-base/data/area-briefs/032-design-workspace.md` | Item S32.16. |
| other | requirements | `docs/product/requirements.md` | Section 17.1 properties panel. |
| component | ArtifactFullScreen | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | Mobile preview host. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Not implemented. | device | no code found |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| none | not applicable | not applicable | not applicable |

**Models and providers.** Live sliders would not need a model once the design declares them; the model would declare them when generating [inferred].

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
| Local mode | No feature; slider updates would run on the device [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| any | not handled in the code; feature absent. | no code found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/design/DesignBrief.test.tsx`: Brief only; nothing for sliders.

**Test scenarios**

- **Confirm absence**
  1. Open a generated design on web
  2. Look for slider controls
  - Expected: None today.
- **Future: radius**
  1. Move radius slider
  - Expected: Corners change live.
- **Future: persistence**
  1. Move slider, reload
  - Expected: Value is kept.

**Where to look when it fails**

- Not applicable until built.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No live sliders** Affects: Web, Desktop, Mobile, Chrome. Evidence: S32.16 missing; no code. Work needed: Define slider metadata, a panel, and frame messages.
- Not built on: Web, Desktop, Mobile, Chrome (from the capability ledger).

**Depends on**

- F032-03
- F032-04
- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- SYS-shared-ui-and-design
- SYS-files-artifacts-and-storage

## Unknown

- Whether any slider format has been specified; none found in docs/product.
