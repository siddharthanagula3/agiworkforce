---
id: "F107-08"
type: "feature"
title: "Comments, blocking and muting"
aliases: ["Public comments", "Block user", "Mute user", "Hide sharer (mobile, nearest existing control)"]
area: "107 Discovery, social, and public-content products"
available_on: ["mobile"]
implementation: {web: "missing", desktop: "missing", mobile: "partial", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S107.14", "S107.16"]
depends_on: ["surface:mobile", "surface:web", "surface:desktop", "store:mmkv", "F107-07", "F107-09", "SYS-authorization-and-workspaces"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F107-08 Comments, blocking and muting

Comments on shared content and blocking or muting other users are not built on web, desktop or mobile. The nearest control is a mobile-only 'Hide <name>' for people who share things with you inside a workspace, kept on the device only.

Area: [107. Discovery, social, and public-content products](README.md). Requirement items: [S107.14](../../10-requirements/capabilities/107-discovery-social-and-public-content-products.md#s10714), [S107.16](../../10-requirements/capabilities/107-discovery-social-and-public-content-products.md#s10716).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Would let viewers read and post comments on shared content, and let a user block or mute another user or creator so their content disappears (brief S107.14, S107.16). Nothing of the comment kind exists. A small device-only hide exists on mobile (apps/mobile/src/features/shared-with-you/hiddenSharers.ts:1-74).

**Why it exists.** Brief items S107.14 and S107.16 list these as expected social controls.

**Who uses it.** No one today for comments or true block. Mobile users with workspace shares use Hide.

**Problems it solves**

- Planned: unwanted content from other users can be removed from view.
- Today only: on mobile, a workspace sharer's items can be hidden from the Shared with you list.

**Use cases**

- Planned: a viewer leaves a comment on a shared chat.
- Planned: a user blocks a creator.
- Today: a mobile user hides a workspace member whose shares are unwanted, and can unhide later.

## 2. User experience

**Where to find it**

- Web, desktop: nothing found (searches for comment, block-user and mute-user terms in apps and packages returned no files).
- Mobile: Shared with you screen, row more-button, 'Hide <owner name>'; hidden people listed with 'Unhide' (SharedWithYouScreen.tsx:240-257, 369-400).

**Before you start**

- Mobile hide: signed in with an account id; the Hide pill needs accountId (SharedItemSafetyActions.tsx:84-95).

**Screens and controls**

- Alert with Report, 'Hide <name>' and Cancel (SharedWithYouScreen.tsx:240-257).
- Confirm dialog 'Hide <name>?' consequence 'Nothing they share will show. Unhide in Shared with you.' (SharedItemSafetyActions.tsx:14-22).

**Journey**

1. Open Shared with you.
2. Press the more button on an item.
3. Choose Hide <name> and confirm.
4. The sharer's projects, chats, artifacts and connectors disappear from the list.
5. Unhide from the Hidden list.

**What the person sees and gets**

- List refreshes without the hidden sharer (hiddenSharers.ts:50-61).
- Comments: no output exists.

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Mobile device-only hide and unhide of workspace sharers across shared projects, conversations, artifacts, connectors and agents (hiddenSharers.ts:38-74).

**Incomplete**

- The mobile hide covers only the Shared with you list, not public content, comments, or search (hiddenSharers.ts:50-61).

**Present but disconnected or switched off**

- Brief says block/mute is missing on mobile; a hide exists. The brief is out of date for the nearest control (brief S107.16).

**Not available**

- Comments on web, desktop, mobile: no code found.
- Block or mute stored on the server: no table or route found by search.
- CLI, VS Code and Chrome: not applicable per the brief.

## 4. Required behaviour

**Established requirements**

- Viewers can post and read public comments on shared content where comments are offered. (source: brief S107.14)
- A user can block or mute another user or creator so their content no longer appears. (source: brief S107.16)

**Acceptance criteria**

1. Not testable today: no comment control exists on web, desktop or mobile.
2. A mobile user who hides a sharer no longer sees that sharer's items in Shared with you.
3. Unhide restores them.
4. Hidden state survives app restart (stored in device storage).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Comments are only meaningful once public galleries or creator profiles exist (briefs S107.05, S107.08 are missing) [inferred].

**Proposed improvements** (suggestions, not requirements)

- Decide whether comments will exist at all before building block and mute [proposed].
- If built, store blocks on the server so they follow the account across apps [proposed].

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| store | hiddenSharers | `apps/mobile/src/features/shared-with-you/hiddenSharers.ts` | Device-only list of hidden sharers and list filters. |
| component | SharedItemSafetyActions | `apps/mobile/src/features/shared-with-you/SharedItemSafetyActions.tsx` | Report and Hide pills; confirm dialog. |
| screen | SharedWithYouScreen | `apps/mobile/src/features/projects/components/SharedWithYouScreen.tsx` | Lists shares, hide and unhide actions. |
| screen | SharedProjectScreen | `apps/mobile/src/features/projects/components/SharedProjectScreen.tsx` | Also references hide and report helpers. |
| screen | AgentsScreen | `apps/mobile/src/features/agents/AgentsScreen.tsx` | Also uses hidden-sharer helpers. |
| store | store:mmkv | `apps/mobile/lib/mmkv.ts` | Device key-value storage used by the hide list [path inferred from import '@/lib/mmkv']. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| User confirms Hide; the sharer id and name are written to device storage. | device | hiddenSharers.ts:38-41 |
| Shared list is filtered by owner id on the device. | device | hiddenSharers.ts:50-61 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Hidden sharer ids and names | device store store:mmkv key shared-with-you:hidden-sharers:v1:<account id> | No: not synced to the server or other devices | Until unhidden or app data is cleared |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Mobile hide needs an account id. |
| Permissions | none found in the code |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | not applicable |
| Provider restrictions | none found in the code |
| Local mode | The hide list is device-only, so it works in Local mode (hiddenSharers.ts). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Corrupt stored list | Returns an empty list instead of failing. | hiddenSharers.ts:20-23 |
| Older string-only entries | Read as {id, name: 'Someone'}. | hiddenSharers.ts:12-13 |
| Comments, server block, offline sync | not handled in the code | no files found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/src/features/projects/__tests__/ProjectSharedWithYou.test.tsx`: Shared with you screen (file exists; hide behaviour not confirmed by me).

**Test scenarios**

- **Hide a sharer**
  1. Open Shared with you with two sharers.
  2. Hide one and confirm.
  - Expected: That sharer's rows vanish and appear under Hidden.
- **Unhide**
  1. Press Unhide.
  - Expected: Rows return.
- **No comments**
  1. Open a /share page on web.
  - Expected: No comment box exists.

**Where to look when it fails**

- Check device key shared-with-you:hidden-sharers:v1:<account>.

**Hands-on test plans**

- Mobile: [70-qa/test-plans/mobile/107-discovery-social-and-public-content-products.md](../../70-qa/test-plans/mobile/107-discovery-social-and-public-content-products.md)

## 10. Gaps and dependencies

- **No comments anywhere.** Affects: Web, desktop, mobile. Evidence: search found nothing; brief S107.14. Work needed: Product decision, then build.
- **No server-side block or mute; mobile hide is device-only and covers only workspace shares.** Affects: All apps. Evidence: hiddenSharers.ts. Work needed: Server table and route plus UI on each app.
- Not built on: Web, Desktop (from the capability ledger).

**Depends on**

- surface:mobile
- surface:web
- surface:desktop
- store:mmkv
- F107-07
- F107-09
- SYS-authorization-and-workspaces

## Unknown

- Whether ProjectSharedWithYou.test.tsx tests hide and unhide (not opened).
- Whether any desktop code offers hide (searched terms only).
- Product intent on comments.
