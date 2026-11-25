---
id: "F107-01"
type: "feature"
title: "Personal discovery feed, topics and feed tuning"
aliases: ["Personalized discovery feed (S107.01)", "Topic-following controls (S107.02)", "Feed-personalization controls (S107.17)", "For you feed"]
area: "107 Discovery, social, and public-content products"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S107.01", "S107.02", "S107.17"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "SYS-authentication-and-identity", "SYS-subscriptions-entitlements-and-usage", "SYS-data-model-and-migrations", "SYS-execution-boundaries", "F107-02"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F107-01 Personal discovery feed, topics and feed tuning

A planned feed of stories and research chosen for a signed-in person's interests, with topics to follow and controls such as more or less like this, not interested and reset. The brief marks all three items missing on web, desktop and mobile, and no feed, topic or tuning code was found. The feature is unbuilt.

Area: [107. Discovery, social, and public-content products](README.md). Requirement items: [S107.01](../../10-requirements/capabilities/107-discovery-social-and-public-content-products.md#s10701), [S107.02](../../10-requirements/capabilities/107-discovery-social-and-public-content-products.md#s10702), [S107.17](../../10-requirements/capabilities/107-discovery-social-and-public-content-products.md#s10717).

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

**What it does.** Would show each signed-in user a feed picked for their interests, let them follow or unfollow topics, and let them tune the feed (more or less like this, not interested, reset) (doc: knowledge-base/data/area-briefs/107-discovery-social-and-public-content-products.md, S107.01, S107.02, S107.17). None of this exists in code today.

**Why it exists.** The area brief lists it as a required discovery product. Whether the product team still wants it is unknown: the audit register closed a related public-profile gap as 'ahead of any need' (doc: audit/registers/ui-gaps.md GAP-267).

**Who uses it.** Signed-in users of Web, Desktop and Mobile (the apps the brief marks missing). CLI, VS Code and Chrome are not listed in the brief.

**Problems it solves**

- Would give a person something relevant to open the app for without writing a question first [inferred].
- Would let a person correct the feed when it is wrong [inferred].

**Use cases**

- Follow the topic 'AI policy' and see new stories about it in a feed (would-be, unbuilt).
- Press 'not interested' on a story to see fewer like it (would-be, unbuilt).
- Reset the feed to start again (would-be, unbuilt).

## 2. User experience

**Where to find it**

- Web: not present. No feed, topic or tuning route was found under apps/web/app (route list read with ls apps/web/app).
- Desktop: not present (brief: missing).
- Mobile: not present. The mobile app routes under apps/mobile/app/(app) contain no feed or topics screen (ls of that folder).
- CLI, VS Code, Chrome: not listed in the brief; no code found.

**Before you start**

- None can be stated: the feature does not exist. [proposed] A signed-in account, since the brief says 'a signed-in user' (S107.01).

**Screens and controls**

- No screen or control exists. Brief 'Should' lines describe: a feed, follow/unfollow topic controls, and more/less like this, not interested and reset controls (S107.01, S107.02, S107.17).

**Journey**

1. Not applicable: nothing to run. [proposed] Sign in, pick topics, open the feed, tune items, reset.

**What the person sees and gets**

- None. No empty, waiting or failure state exists to describe.

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing for this feature.

**Incomplete**

- None found: no partial code was found.

**Present but disconnected or switched off**

- None found.

**Not available**

- Feed, topic following and feed tuning are not available on Web, Desktop or Mobile (brief S107.01, S107.02, S107.17: missing).
- A repo-wide search for follow-topic, discovery-feed and feed-tuning names found only unrelated code, such as model favourites in apps/mobile/src/features/model-picker/useFavouritesSync.ts (the name suggests a different feature; file not opened) [inferred].

## 4. Required behaviour

**Established requirements**

- A signed-in user sees a feed of stories, research or content chosen for their interests. (source: S107.01 (brief))
- A user can follow or unfollow topics and the product uses them to pick what it shows. (source: S107.02 (brief))
- A user can tune what a feed recommends: more or less like this, not interested, reset. (source: S107.17 (brief))

**Acceptance criteria**

1. A signed-in user on Web, Desktop and Mobile can open a feed.
2. A user can follow and unfollow a topic and the choice survives reload and sign-in on another device.
3. Followed topics change what the feed shows.
4. More like this, less like this, not interested and reset each change the feed and can be undone.
5. A signed-out visitor never sees a personal feed.
6. Empty, loading and failure states are visible and have a retry.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Feed content needs a source of stories and a ranking step; the repo has no such service, so a source decision (own, licensed, or web search) is needed first [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide first whether the feature is wanted; record the decision in docs/decisions before building.
- [proposed] Keep topic choices private to the user and routed under the same Local/own-key/Cloud boundaries as chat.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | Area brief | `knowledge-base/data/area-briefs/107-discovery-social-and-public-content-products.md` | States S107.01, S107.02 and S107.17 and marks them missing on web, desktop and mobile. |
| other | Web app route folder | `apps/web/app` | Where a feed route would live; no feed, discover or topics folder exists there. |
| other | Mobile app routes | `apps/mobile/app/(app)` (not found) | Where a mobile feed screen would live; none exists. |
| other | UI gap register | `audit/registers/ui-gaps.md` | Records that no public creator or handle surface exists (GAP-266, GAP-267 closed Not Planned); no feed row was found. |
| other | Wire-or-cut decisions | `docs/decisions/wire-or-cut.md` | Owner of keep/cut calls on unreachable features; no feed entry was found. |
| config | Sitemap | `apps/web/app/sitemap.ts` | Lists public pages; contains no feed page. |
| other | Chat area | `apps/web/app/chat` | Existing signed-in area where a feed entry could be added; no feed entry exists. |
| other | Cloud contracts package | `packages/contracts/cloud-contracts/src` | Where a feed API contract would be defined; no feed contract found. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No flow exists. [proposed] The app would read the user's followed topics, ask a server for ranked items, and show them. | our servers | No code found; flow is [proposed] only. |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Followed topics and feedback signals (would-be) | Not stored anywhere today; no table found | No | Not applicable; [proposed] must be erased with the account (apps/web/lib/server/account-erasure.ts handles account erasure, not opened). |

**Models and providers.** None. No model or provider takes part today. [proposed] Ranking should be provider-agnostic and must not route Local data to Cloud without consent (doc: AGENTS.md section 6).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Brief says a signed-in user (S107.01). No code. |
| Permissions | none found in the code |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Not applicable today. [proposed] A Local-mode feed would need a source that does not send personal data to servers; undecided. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| All states (loading, empty, error, offline) | not handled in the code: the feature does not exist | No feed code found in apps/web/app or apps/mobile/app/(app). |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- none found

**Test scenarios**

- **Confirm the feature is absent on Web**
  1. Sign in on web
  2. Look through the left navigation and Library
  3. Try /discover and /feed
  - Expected: No feed or topics control; unknown paths show the not-found page. Update this page if that changes.
- **Confirm absence on Mobile**
  1. Sign in on the phone app
  2. Open the drawer and tabs
  - Expected: No feed or topics screen.
- **Future: follow a topic**
  1. Follow a topic
  2. Reload
  3. Open the feed
  - Expected: Topic stays followed and items match it.
- **Future: not interested**
  1. Mark an item not interested
  2. Refresh
  - Expected: Item and similar ones no longer appear; undo available.

**Where to look when it fails**

- No log lines or tables exist for this feature.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Whole feature missing** Affects: Web, Desktop, Mobile users. Evidence: Brief S107.01, S107.02, S107.17 status missing; no code found. Work needed: Product decision, content source, ranking service, topic store, UI on three apps, tests.
- **No content source defined** Affects: All apps. Evidence: No news or research source service found in packages or apps/web/lib [inferred from search]. Work needed: Choose source and licence (see F107-02).
- Not built on: Web, Desktop, Mobile (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- SYS-authentication-and-identity
- SYS-subscriptions-entitlements-and-usage
- SYS-data-model-and-migrations
- SYS-execution-boundaries
- F107-02

## Unknown

- Whether the owner still wants the feed built.
- Where stories would come from.
- Whether CLI, VS Code or Chrome should ever have it (brief does not list them).
- Whether an older design document exists for it; docs/product was searched by keyword only and showed none.
