---
id: "F107-06"
type: "feature"
title: "Favorites and saved items"
aliases: ["Favorite/save (S107.10)", "Saved items", "Favourites"]
area: "107 Discovery, social, and public-content products"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S107.10"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "SYS-sync-and-continuity", "SYS-data-model-and-migrations", "F107-03", "F107-04", "SYS-authentication-and-identity"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F107-06 Favorites and saved items

A planned control to favorite or save a public item, such as a gallery example, shared chat or artifact, and find it again. It is missing on every app. The only favourites code found is for models on mobile, which is a different feature. The user's Library holds their own artifacts, not saved public items.

Area: [107. Discovery, social, and public-content products](README.md). Requirement items: [S107.10](../../10-requirements/capabilities/107-discovery-social-and-public-content-products.md#s10710).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would let a user favorite or save a public item and return to it (S107.10) (doc: knowledge-base/data/area-briefs/107-discovery-social-and-public-content-products.md). Nothing exists.

**Why it exists.** Listed in the brief. No decision document was found.

**Who uses it.** Signed-in users who view public items (would-be).

**Problems it solves**

- Would stop people losing a good example [inferred].

**Use cases**

- Save a gallery example for later (would-be).
- Save a shared chat link (would-be).
- Find saved items in one list (would-be).

## 2. User experience

**Where to find it**

- Web, Desktop, Mobile: not present. Gallery cards and the example page have no save control (apps/web/app/gallery/GalleryClient.tsx, apps/web/app/gallery/[templateId]/page.tsx).

**Before you start**

- Not applicable.

**Screens and controls**

- None.

**Journey**

1. Not applicable: unbuilt. Today a visitor can only reopen an example by its URL.

**What the person sees and gets**

- None.

**Settings**

- None.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing for public items.

**Incomplete**

- None.

**Present but disconnected or switched off**

- None.

**Not available**

- Save and favorite for public items on Web, Desktop, Mobile (brief S107.10).
- Mobile has model favourites sync (apps/mobile/src/features/model-picker/useFavouritesSync.ts); by name it is about models, not public items [inferred; file not opened].

## 4. Required behaviour

**Established requirements**

- A user can favorite or save a public item (gallery example, shared chat, artifact) to come back to it. (source: S107.10 (brief))

**Acceptance criteria**

1. A signed-in user can save an example, a shared chat and a shared artifact.
2. The saved list shows each with its title and opens it.
3. Unsaving removes it.
4. Saved items sync across the user's devices.
5. If the original is revoked, the saved entry says it is unavailable instead of failing.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Examples are code-defined, so a saved example would be stored by id [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Put saved items in Library as a filter, matching how artifacts are a Library surface filter (apps/web/app/chat/artifacts/page.tsx).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | Area brief | `knowledge-base/data/area-briefs/107-discovery-social-and-public-content-products.md` | S107.10 missing. |
| component | GalleryClient | `apps/web/app/gallery/GalleryClient.tsx` | Cards where a save control would go; none present. |
| screen | Gallery example page | `apps/web/app/gallery/[templateId]/page.tsx` | Page where a save button would go; none present. |
| screen | Shared artifact page | `apps/web/app/shared-artifact/[token]/page.tsx` | Public item a user may want to save. |
| screen | Shared chat page | `apps/web/app/share/[token]/page.tsx` | Public shared chat (brief S107.13 code); save control not present. |
| screen | Library artifact filter redirect | `apps/web/app/chat/artifacts/page.tsx` | Existing home for the user's own artifacts. |
| hook | Mobile model favourites sync | `apps/mobile/src/features/model-picker/useFavouritesSync.ts` | Unrelated: favourites for models. |
| other | Web app route folder | `apps/web/app` | No saved-items route exists. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No flow. [proposed] Tap save writes an entry for the user on the server and syncs it. | our servers | No code; [proposed]. |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Saved item references (would-be) | None today | No | Not applicable. |

**Models and providers.** None.

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
| Local mode | Not applicable. [proposed] Saved public items could be kept on device for signed-out visitors; undecided. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| All states | not handled in the code: no feature | No save control in gallery files. |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- none found

**Test scenarios**

- **Confirm absence**
  1. Open a gallery example and a shared artifact
  - Expected: No save or favorite control.
- **Future: save**
  1. Save an example
  2. Open saved list on a second device
  - Expected: Item present.
- **Future: revoked**
  1. Save a shared artifact
  2. Owner revokes
  3. Open saved list
  - Expected: Marked unavailable.

**Where to look when it fails**

- No logs or tables.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Feature missing** Affects: Web, Desktop, Mobile. Evidence: Brief S107.10. Work needed: Saved-items store, controls, list, sync.
- **No decision on where saved items live** Affects: Design. Evidence: No document found. Work needed: Decide Library filter versus separate page.
- Not built on: Web, Desktop, Mobile (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- SYS-sync-and-continuity
- SYS-data-model-and-migrations
- F107-03
- F107-04
- SYS-authentication-and-identity

## Unknown

- Whether saved items should be signed-in only.
- Where in Library they would sit.
- Whether shared chats (/share/<token>) can be saved by a signed-out visitor.
