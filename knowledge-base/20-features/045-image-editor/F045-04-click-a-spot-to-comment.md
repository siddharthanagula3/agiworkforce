---
id: "F045-04"
type: "feature"
title: "Click a spot to comment"
aliases: ["Click-to-comment editing", "Comment pin", "Click a spot to comment", "S45.04"]
area: "45 Image editor"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S45.04"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "F045-01", "F045-03", "SYS-shared-ui-and-design", "SYS-api-and-contracts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F045-04 Click a spot to comment

A planned way to click a spot on an image, leave a comment there, and have the edit target that spot. It is not built on any app. No control, request field or test exists. The nearest tools are the painted area (F045-03) and the typed change (F045-01).

Area: [45. Image editor](README.md). Requirement items: [S45.04](../../10-requirements/capabilities/045-image-editor.md#s4504).

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

**What it does.** Nothing today. Intended: a click places a pin with a comment and the edit targets that spot (doc: knowledge-base/data/area-briefs/045-image-editor.md S45.04).

**Why it exists.** The brief lists it as an image-editing behaviour to match; status is missing on web, desktop, mobile and Chrome (doc: knowledge-base/data/area-briefs/045-image-editor.md S45.04).

**Who uses it.** Not used. Intended for people who want to point at one spot instead of painting.

**Problems it solves**

- Intended: pointing precisely without painting an area.

**Use cases**

- Intended: click a lamp and type 'turn this off'.

## 2. User experience

**Where to find it**

- No app has it. Web card and panel, mobile viewer, CLI and Chrome have no pin or comment control (grep of ImageGenerationCard.tsx and RegionSelector.tsx for comment, annotate and pin found none).

**Before you start**

- Not applicable.

**Screens and controls**

- None. The closest controls are 'Select area' (web) and 'Edit an area of this image' (mobile), described in F045-03.

**Journey**

1. Not applicable. Today a person paints an area (F045-03) or types the location in words (F045-01).

**What the person sees and gets**

- None.

**Settings**

- None.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing for this feature.

**Incomplete**

- None started.

**Present but disconnected or switched off**

- None found.

**Not available**

- Web, Desktop, Mobile, Chrome: no click-to-comment (doc: knowledge-base/data/area-briefs/045-image-editor.md S45.04).
- The request schema is strict and has no coordinate or pin field (packages/contracts/cloud-contracts/src/managed-media.ts:96-110).

## 4. Required behaviour

**Established requirements**

- The user clicks a spot on the image, leaves a comment there, and the edit targets that spot. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S45.04)

**Acceptance criteria**

1. Today: confirm no pin or comment control exists on web card, web panel, mobile viewer, CLI, Chrome.
2. Today: confirm a request with an unknown field such as a coordinate is rejected (strict schema).
3. Future, once built: a click places a visible pin and the pin comment reaches the edit as text and location.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Because the schema is strict, a pin would need a contract change before any app could send it [inferred from managed-media.ts:96-110].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Implement a pin as a small painted dot plus the comment text, reusing the mask path of F045-03 so no new server field is needed.
- [proposed] Keep it out of the product until a human check proves the edit lands on the spot.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | Nearest point: ImageGenerationCard panel | `apps/web/features/chat/components/ImageGenerationCard.tsx:603` | Where a pin control could attach; no pin exists |
| component | Nearest point: RegionSelector | `apps/web/features/chat/components/RegionSelector.tsx` | Canvas that already turns pointer positions into image coordinates (pointFor); no comment logic |
| schema | Nearest point: request schema | `packages/contracts/cloud-contracts/src/managed-media.ts:96` | Strict body with no coordinate field |
| component | Nearest point: mobile ImageAreaEditor | `apps/mobile/src/features/image/components/ImageAreaEditor.tsx` | Touch painting surface; no pin |
| component | Nearest point: mobile ImageFullScreen | `apps/mobile/src/features/chat/components/ImageFullScreen.tsx:641` | Header controls where a pin control could sit |
| service | Nearest point: managed image service | `apps/web/app/api/media/image/lib/managed-image-generation.ts` | Would need to accept and use a location |
| command | Nearest point: CLI image command | `apps/cli/src/lib.rs:1110` | Prompt-only command; no spot input |
| other | Brief item S45.04 | `knowledge-base/data/area-briefs/045-image-editor.md` | Only record of the requirement |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| None. No code path exists for a pin or comment on an image. | device | not found in apps/web/features/chat/components/ImageGenerationCard.tsx, RegionSelector.tsx, apps/mobile/src/features/image |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| No data is created. | none | none | none |

**Models and providers.** Not applicable. Any future pin edit would use the same managed route and the openai edit adapter as F045-01 [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code |
| Permissions | none found in the code |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | none found in the code |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| All states | Not handled in the code; the feature does not exist. | not handled in the code |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- none found

**Test scenarios**

- **Confirm absence on web**
  1. Open a generated image card and the 'Revise this image' panel.
  2. Click on the picture.
  - Expected: No pin or comment appears.
- **Confirm absence on mobile**
  1. Open a generated image full screen.
  2. Tap the picture.
  - Expected: No pin appears; the header offers Change, Edit an area, Report, Delete, Save, Share, Copy.
- **Strict request**
  1. POST a generate body with an extra field such as 'pin'.
  - Expected: 400 Invalid request because the schema is strict.

**Where to look when it fails**

- No log lines or tables exist for this feature.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Click-to-comment is not built.** Affects: Web, Desktop, Mobile, Chrome (CLI not applicable). Evidence: doc: knowledge-base/data/area-briefs/045-image-editor.md S45.04; no code found. Work needed: Product decision first; then design, contract change or mask-based approach, UI and tests.
- Not built on: Web, Desktop, Mobile, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- F045-01
- F045-03
- SYS-shared-ui-and-design
- SYS-api-and-contracts

## Unknown

- Whether the product wants this feature at all.
- How a pin would be sent to the provider.
- Whether the brief's 'missing' for Chrome means a plan or only a gap.
