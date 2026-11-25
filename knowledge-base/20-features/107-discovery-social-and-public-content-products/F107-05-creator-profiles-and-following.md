---
id: "F107-05"
type: "feature"
title: "Creator profiles and following"
aliases: ["Creator profiles (S107.08)", "Follow creator (S107.09)", "Public profile", "Builder profile"]
area: "107 Discovery, social, and public-content products"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S107.08", "S107.09"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "SYS-authentication-and-identity", "SYS-security-and-privacy", "SYS-data-model-and-migrations", "F107-04", "F107-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F107-05 Creator profiles and following

Planned public profile pages that list what a creator published, and a way to follow a creator and see new public work. Both are missing on every app. The audit register closed the related public-profile and handle gaps as Not Planned because no public creator surface exists and shared pages show no author.

Area: [107. Discovery, social, and public-content products](README.md). Requirement items: [S107.08](../../10-requirements/capabilities/107-discovery-social-and-public-content-products.md#s10708), [S107.09](../../10-requirements/capabilities/107-discovery-social-and-public-content-products.md#s10709).

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

**What it does.** Would give each creator a public profile listing published work (S107.08) and let users follow creators and see their new work (S107.09). Nothing exists in code.

**Why it exists.** Listed in the brief. The audit register decided on 2026-08-21 not to build a profile ahead of any need for a public surface (doc: audit/registers/ui-gaps.md GAP-267).

**Who uses it.** Creators who publish and users who follow them (would-be).

**Problems it solves**

- Would let viewers find more work by the same maker [inferred].
- Would tell followers about new work [inferred].

**Use cases**

- Open a creator's page to see their public artifacts (would-be).
- Follow a creator and get new work in a feed (would-be).

## 2. User experience

**Where to find it**

- Web, Desktop, Mobile: not present (brief missing). Account settings have no username field (doc: audit/registers/ui-gaps.md GAP-266 evidence: apps/web/features/settings/sections/AccountSection.tsx).

**Before you start**

- Not applicable.

**Screens and controls**

- None exist.

**Journey**

1. Not applicable: unbuilt.

**What the person sees and gets**

- None.

**Settings**

- No public name or handle setting found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing.

**Incomplete**

- None found.

**Present but disconnected or switched off**

- None found.

**Not available**

- No profile route, no follow control, no handle on web, desktop or mobile (brief S107.08, S107.09; GAP-266, GAP-267).

## 4. Required behaviour

**Established requirements**

- Each creator has a public profile page listing what they published. (source: S107.08 (brief))
- A user can follow a creator and see their new public work. (source: S107.09 (brief))
- Closed as Not Planned: public handle and creator profile, until user-published public work exists. (source: audit/registers/ui-gaps.md GAP-266, GAP-267)

**Acceptance criteria**

1. A creator can opt in to a public name; nothing public appears without opt-in.
2. A profile lists only that creator's public items.
3. A user can follow and unfollow; the choice persists.
4. Followers see new items.
5. A creator can delete the profile and its public listing.
6. Following works on every app that shows public work.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Follow needs a feed or notification target (F107-01) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Build only after F107-04 exists, as the register advises.
- [proposed] Apply the same age and consent rules as other public identity before launch.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | Area brief | `knowledge-base/data/area-briefs/107-discovery-social-and-public-content-products.md` | S107.08 and S107.09 missing. |
| other | UI gap register | `audit/registers/ui-gaps.md` | GAP-266 and GAP-267 closed Not Planned. |
| screen | Account settings section | `apps/web/features/settings/sections/AccountSection.tsx` | Where a public name would be set; no username field (per GAP-266, file not opened). |
| screen | Shared artifact page | `apps/web/app/shared-artifact/[token]/page.tsx` | Public page that shows no author today. |
| service | published-artifact-service | `apps/web/lib/services/published-artifact-service.ts` | Rows a profile would list. |
| service | account-erasure | `apps/web/lib/server/account-erasure.ts` | Account erasure; any profile data would need to be covered (file not opened). |
| other | Web app route folder | `apps/web/app` | No profile or creator route exists. |
| other | Mobile routes | `apps/mobile/app/(app)` (not found) | Has a 'profile' folder, which by name is the user's own account, not a public creator page (not opened) [inferred]. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No flow. [proposed] Server reads a creator's public items and a follow table. | our servers | No code; [proposed]. |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Public name, follow edges (would-be) | None today | No | Not applicable. |

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
| Local mode | Not applicable; publishing is a server action. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| All states | not handled in the code: no feature | No profile code found. |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- none found

**Test scenarios**

- **Confirm absence**
  1. Open Settings > Account
  2. Look for username or public profile
  - Expected: None.
- **No author on shared page**
  1. Open a public shared artifact
  - Expected: No author name or link.
- **Future: follow**
  1. Follow a creator
  2. Reload
  - Expected: Still followed.

**Where to look when it fails**

- No logs or tables.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Profiles missing** Affects: All apps. Evidence: Brief S107.08. Work needed: Public identity design, profile page, privacy controls.
- **Follow missing** Affects: All apps. Evidence: Brief S107.09. Work needed: Follow table, controls, notification path.
- **No public gallery to profile** Affects: Planning. Evidence: F107-04 unbuilt. Work needed: Build F107-04 first.
- Not built on: Web, Desktop, Mobile (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- SYS-authentication-and-identity
- SYS-security-and-privacy
- SYS-data-model-and-migrations
- F107-04
- F107-01

## Unknown

- Whether the Not Planned decision still stands (dated 2026-08-21).
- Minimum age and privacy rules for public identity.
- Whether CLI, VS Code or Chrome need it.
