---
id: "F107-02"
type: "feature"
title: "News and research collections, licensed content"
aliases: ["News/research collections (S107.03)", "Licensed-content access (S107.21)", "Publisher content in answers"]
area: "107 Discovery, social, and public-content products"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S107.03", "S107.21"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "SYS-chat-turn-pipeline", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-inference-providers", "F107-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F107-02 News and research collections, licensed content

Planned curated news or research collections a user could browse or subscribe to, and licensed publisher content usable inside answers with the licence respected. The brief marks both missing on web, desktop and mobile, and no collection or licensed-source code was found. The feature is unbuilt.

Area: [107. Discovery, social, and public-content products](README.md). Requirement items: [S107.03](../../10-requirements/capabilities/107-discovery-social-and-public-content-products.md#s10703), [S107.21](../../10-requirements/capabilities/107-discovery-social-and-public-content-products.md#s10721).

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

**What it does.** Would let users browse or subscribe to curated news or research collections (S107.03) and use licensed publisher content inside answers with licence terms respected (S107.21) (doc: knowledge-base/data/area-briefs/107-discovery-social-and-public-content-products.md). Nothing exists in code.

**Why it exists.** The brief lists it as part of the discovery area. The competitor-comparison rule in AGENTS.md section 10 makes the leaders' behaviour a reference; no document was found that records a decision to build it.

**Who uses it.** Signed-in users on Web, Desktop and Mobile (brief). Publishers would be the other party for licensed content [inferred].

**Problems it solves**

- Would give answers access to premium sources the open web hides [inferred].
- Would keep the product inside publisher licences [inferred].

**Use cases**

- Subscribe to a weekly research collection (would-be).
- Ask a question and see a licensed article cited with its publisher named (would-be).
- Browse a curated news collection (would-be).

## 2. User experience

**Where to find it**

- Web, Desktop, Mobile: not present (brief: missing).
- No collection or licensed-source screen was found in apps/web/app or apps/mobile/app/(app).

**Before you start**

- Not applicable. [proposed] Signed-in account; licensed content may need a plan.

**Screens and controls**

- None exist. Brief: browse or subscribe to collections; licensed content shown inside answers.

**Journey**

1. Not applicable: unbuilt.

**What the person sees and gets**

- None.

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing for this feature.

**Incomplete**

- None found.

**Present but disconnected or switched off**

- None found.

**Not available**

- Collections and licensed content on Web, Desktop and Mobile (brief S107.03, S107.21: missing).
- The product's web search is a separate path (apps/web/app/api/web-search exists in the api folder list); it was not opened and is not a licensed-content feature [inferred].

## 4. Required behaviour

**Established requirements**

- The product offers curated news or research collections a user can browse or subscribe to. (source: S107.03 (brief))
- Users can access licensed publisher content inside answers with the licence respected. (source: S107.21 (brief))

**Acceptance criteria**

1. A user can open a collection list and open one collection.
2. A user can subscribe to and unsubscribe from a collection.
3. An answer that uses licensed content names the publisher and links the source.
4. Licence limits (quote length, region, plan) are enforced and shown when they block a result.
5. Without a licence the content is not used and the answer says so.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Licensed content needs contracts with publishers; code alone cannot satisfy S107.21 [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Treat each collection as a named publisher source, matching the publisher naming rule in S107.20.
- [proposed] Meter licensed reads in the subscription system.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | Area brief | `knowledge-base/data/area-briefs/107-discovery-social-and-public-content-products.md` | States S107.03 and S107.21, both missing. |
| other | Web API folder | `apps/web/app/api` | Where collection and licensed-content endpoints would live; none found in the folder list. |
| other | Web search API folder | `apps/web/app/api/web-search` | Existing, separate web search path; not a collection or licensed source (not opened) [inferred]. |
| other | Web research API folder | `apps/web/app/api/research` | Existing research path; not opened; no collection feature seen in the name. |
| screen | Plugins page | `apps/web/app/plugins/page.tsx` | Existing directory of third-party plugins (brief S107.20 code); the only publisher-facing surface, not a collection. |
| screen | Partners page | `apps/web/app/partners/page.tsx` | Existing partner page (brief S107.20); not a licensing programme. |
| other | Mobile app routes | `apps/mobile/app/(app)` (not found) | No collection screen. |
| other | Competitive guidance | `docs/product/competitive-guidance.md` | The comparison rule for product choices; no collection entry was found by keyword search. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No flow exists. [proposed] A server fetches licensed text under contract and hands it to the answer step with its licence terms. | our servers | No code found; [proposed]. |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Subscriptions to collections; licence records (would-be) | None today | No | Not applicable. |

**Models and providers.** None today. [proposed] Licensed text must be passed only to providers the licence allows; this is a provider restriction to record per source.

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
| Local mode | Not applicable today. [proposed] Local mode has no way to reach licensed servers offline; it would be unavailable or limited, undecided. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| All states | not handled in the code: feature does not exist | No collection or licensed-content code found. |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- none found

**Test scenarios**

- **Confirm absence**
  1. Search the web and mobile app for 'collections'
  2. Ask a question needing a paywalled news source
  - Expected: No collection screen; answers do not cite licensed publishers.
- **Future: subscribe**
  1. Open a collection
  2. Subscribe
  3. Reopen
  - Expected: Subscription persists across devices.
- **Future: licence respected**
  1. Ask for a long quote from licensed content
  - Expected: Output stays within licence limits and names the publisher.

**Where to look when it fails**

- No logs or tables exist for this feature.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Collections missing** Affects: Web, Desktop, Mobile. Evidence: Brief S107.03 missing. Work needed: Content source, collection model, browse and subscribe UI.
- **Licensed content missing** Affects: Web, Desktop, Mobile. Evidence: Brief S107.21 missing. Work needed: Publisher contracts, licence enforcement, citations, metering.
- Not built on: Web, Desktop, Mobile (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- SYS-chat-turn-pipeline
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-inference-providers
- F107-01

## Unknown

- Whether any publisher agreement exists.
- Which providers a licence would allow.
- Whether collections are curated by staff or generated.
- Whether the web search path already marks paywalled sources (not opened).
