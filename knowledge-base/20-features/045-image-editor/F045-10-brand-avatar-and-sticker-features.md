---
id: "F045-10"
type: "feature"
title: "Brand, avatar and sticker features"
aliases: ["Brand reference", "Avatar reference", "Character reference", "Sticker pack", "Sticker export", "S45.34", "S45.35", "S45.36", "S45.37"]
area: "45 Image editor"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S45.34", "S45.35", "S45.36", "S45.37"]
depends_on: ["surface:web", "surface:mobile", "surface:desktop", "mode:cloud", "SYS-files-artifacts-and-storage", "SYS-memory-projects-and-context", "SYS-sync-and-continuity", "SYS-subscriptions-entitlements-and-usage", "F045-07", "F045-09"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F045-10 Brand, avatar and sticker features

Saving a brand, logo, character or avatar reference to reuse across images, creating a sticker pack, and exporting stickers for messaging apps are not built on any app. No saved-reference library, pack flow or export format was found in the code. A person can only attach pictures one request at a time.

Area: [45. Image editor](README.md). Requirement items: [S45.34](../../10-requirements/capabilities/045-image-editor.md#s4534), [S45.35](../../10-requirements/capabilities/045-image-editor.md#s4535), [S45.36](../../10-requirements/capabilities/045-image-editor.md#s4536), [S45.37](../../10-requirements/capabilities/045-image-editor.md#s4537).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would keep brand or character pictures for reuse and produce sticker sets in messaging-app formats. Nothing of this exists today.

**Why it exists.** The brief lists brand-reference reuse (S45.34), avatar-reference reuse (S45.35), sticker-pack creation (S45.36) and messaging-app sticker export (S45.37).

**Who uses it.** People who need the same look or character in many images, and people who make sticker sets [inferred].

**Problems it solves**

- Re-attaching the same logo or character every time.
- Producing a consistent set of images and packaging them.

**Use cases**

- Save a company logo and palette and use it in every banner.
- Keep a mascot character across several generations.
- Make eight stickers from one prompt and export them for a chat app.

## 2. User experience

**Where to find it**

- Not present on Web, Desktop, Mobile, CLI or Chrome. VS Code not applicable.

**Before you start**

- Not applicable.

**Screens and controls**

- None. The nearest working thing is attaching guide pictures per request (F045-07).

**Journey**

1. Not built. Today a person re-attaches the pictures in each image request.

**What the person sees and gets**

- none

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Per-request guide pictures (up to three) can carry a logo or character look for a single edit (managed-media.ts:86; ChatComposerNew.tsx:3777).
- Memory and projects exist elsewhere in the product but no code ties them to image references [inferred; not searched in depth].

**Incomplete**

- nothing found

**Present but disconnected or switched off**

- nothing found

**Not available**

- Saved brand and avatar reference library, sticker-pack creation flow, messaging-app sticker export, on every app (brief; no code found).

## 4. Required behaviour

**Established requirements**

- User saves brand references (logo, palette, style) and reuses them across generations. Missing. (source: S45.34 (brief))
- User saves an avatar or character reference and reuses it. Missing. (source: S45.35 (brief))
- User creates a set of stickers from a prompt or image in one flow. Missing. (source: S45.36 (brief))
- User exports stickers in a messaging-app format. Missing. (source: S45.37 (brief))

**Acceptance criteria**

1. Search the Web, Mobile and CLI image features for a saved-reference store: none exists.
2. Image mode offers no sticker pack option.
3. No export option for messaging-app sticker formats appears on any card.
4. Attach guides each time works as in F045-07.
5. A request for a sticker set is handled as an ordinary prompt.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Reuse would need a stored asset and an entitlement rule; the job plan already accepts stored asset ids for references (managed-image-generation.ts:769-785) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Store references as Library items and let image mode pick them.
- [proposed] Treat sticker packs as a batch of images with transparent background plus an export step.
- [proposed] Check each messaging app's current sticker format before building export.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Where per-request guides are attached; no library picker. |
| schema | ManagedMediaImageRefSchema | `packages/contracts/cloud-contracts/src/managed-media.ts` | Reference can be an asset_id or inline bytes; asset path is a possible base for reuse. |
| service | resolveImageRefBytes | `apps/web/app/api/media/image/lib/image-generation-provider.ts` | Reads a stored asset by id for an edit (lines 430-455). |
| service | managed-image-generation | `apps/web/app/api/media/image/lib/managed-image-generation.ts` | Stores referenceAssetIds in the job plan. |
| component | LibraryView | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Shared Library that lists saved media; opens an image into chat (brief S45.02, line 1619). |
| service | library-chat-handoff | `apps/web/features/library/lib/library-chat-handoff.ts` | Hands a Library image to the composer. |
| hook | useImageReferences | `apps/mobile/src/features/image/useImageReferences.ts` | Mobile per-request photo strip, not persisted. |
| screen | ImagesScreen | `apps/mobile/src/features/image/ImagesScreen.tsx` | Mobile image creation; no saved references. |
| command | CLI image command | `apps/cli/src/cloud/image.rs` | Text-to-image only; no reference or pack option found. |
| component | Images feature page | `apps/web/app/features/images/page.tsx` | Public copy of what image mode does; does not claim saved references. |
| table | image_generation_jobs | `apps/web/lib/server/image-generation-jobs.ts` | Job storage; no reference library table. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Not built. No flow exists to describe. | device | No code found; brief S45.34-S45.37 missing on every app |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Saved brand or avatar references | Nowhere; not built | No | Not applicable |

**Models and providers.** Not applicable until built. Any future version would use an edit-capable model route (managed-media.ts:62).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code. |
| Permissions | none found in the code. |
| Subscription | none found in the code for this feature. Image generation itself needs the image_generation capability (billing-catalog.ts:356). |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | Not applicable. |
| Local mode | Not applicable; not built. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| All states | not handled in the code; the feature does not exist | searched apps/web, apps/mobile, apps/cli image code for brand, avatar, sticker, saved reference |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- none found

**Test scenarios**

- **Absence check Web**
  1. Open image mode on Web and look through every menu.
  - Expected: No saved reference, brand, avatar or sticker option.
- **Absence check Mobile**
  1. Open Add to chat in image mode and the Images screen.
  - Expected: Only the per-request 'Attach photos' paperclip.
- **Sticker prompt**
  1. Ask for a pack of stickers in a normal prompt.
  - Expected: One image result, no pack or export.
- **Guides workaround**
  1. Attach the same logo as a guide in two requests.
  - Expected: Works each time, nothing is remembered.

**Where to look when it fails**

- None; there is no code to log. Use code search for sticker, brand reference, avatar reference.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No saved brand or avatar reference library.** Affects: All apps. Evidence: S45.34, S45.35. Work needed: Storage, picker, entitlement and cross-app sync.
- **No sticker-pack flow.** Affects: All apps. Evidence: S45.36. Work needed: Batch generation, transparent output, pack UI.
- **No messaging-app export.** Affects: All apps. Evidence: S45.37. Work needed: Current format research per app, then export.
- **Requires a decision on where saved references live (Library, Projects or memory).** Affects: Product. Evidence: No existing owner found. Work needed: Ownership decision per doc: AGENTS.md section 3.
- Not built on: Web, Desktop, Mobile, CLI, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:desktop
- mode:cloud
- SYS-files-artifacts-and-storage
- SYS-memory-projects-and-context
- SYS-sync-and-continuity
- SYS-subscriptions-entitlements-and-usage
- F045-07
- F045-09

## Unknown

- Whether Projects or Library already hold a reusable asset concept that could carry references.
- Which messaging-app sticker formats apply today (not researched; needs current sources).
- Whether any plan or roadmap document names this feature.
