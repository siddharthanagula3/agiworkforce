---
id: "F107-10"
type: "feature"
title: "Sponsored content labels and paid ranking rules"
aliases: ["Sponsored labels", "Paid ranking separation", "Organic versus paid ranking"]
area: "107 Discovery, social, and public-content products"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S107.18", "S107.19"]
depends_on: ["surface:web", "SYS-shared-ui-and-design", "F107-11"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F107-10 Sponsored content labels and paid ranking rules

Not applicable. The product has no sponsored content or paid placement on any app, so there are no labels or ranking rules to build. If paid placement is added later, sponsored items must be labelled and must not change organic order.

Area: [107. Discovery, social, and public-content products](README.md). Requirement items: [S107.18](../../10-requirements/capabilities/107-discovery-social-and-public-content-products.md#s10718), [S107.19](../../10-requirements/capabilities/107-discovery-social-and-public-content-products.md#s10719).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Nothing today. It records a rule for the future: label paid content and keep it out of organic order (brief S107.18, S107.19).

**Why it exists.** Brief marks both items 'not applicable anywhere'.

**Who uses it.** No one today.

**Problems it solves**

- Prevents a future paid placement from being hidden or from distorting organic results.

**Use cases**

- If a sponsored plugin slot were added to the directory, it would carry a Sponsored label.
- If a feed were added, paid items would be ranked separately.

## 2. User experience

**Where to find it**

- No app: a search of apps/web/app, apps/web/features and packages/ui for 'sponsored' and 'paid placement' found no files.

**Before you start**

- none

**Screens and controls**

- none found in the code

**Journey**

1. Not applicable.

**What the person sees and gets**

- none found in the code

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing to work: no paid placement exists. The partners page says there is no partner program, reseller pricing or partner directory (apps/web/app/partners/page.tsx:69-95, 101-123).

**Incomplete**

- none

**Present but disconnected or switched off**

- none

**Not available**

- Sponsored labels and paid ranking: not available on web, desktop, mobile, CLI, VS Code, Chrome (by design per brief).

## 4. Required behaviour

**Established requirements**

- Any sponsored or paid content is clearly labelled. (source: brief S107.18 (not applicable anywhere))
- Organic results are ranked separately from anything paid; paid placement never changes organic order. (source: brief S107.19 (not applicable anywhere))

**Acceptance criteria**

1. No screen shows a sponsored or paid item today.
2. Before any paid placement ships, a label and a separate ranking path must exist and be tested.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The plugin directory is the most likely place for paid placement to appear later [inferred].

**Proposed improvements** (suggestions, not requirements)

- Add a guard that fails a build if a 'sponsored' field is introduced without a label component [proposed].

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Partners page | `apps/web/app/partners/page.tsx` | States there is no partner or reseller program, which is why nothing is paid today. |
| screen | Plugin directory panel | `packages/ui/ui/src/directory/DirectoryPanel.tsx` | The ordering and filtering of listed plugins; no sponsored field was found there. |
| service | Directory filtering | `packages/ui/ui/src/directory/filtering.ts` | Filtering logic of the directory (not read in detail). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No flow exists. | device | no code found |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| none | none | none | none |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code |
| Permissions | none found in the code |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | not applicable |
| Provider restrictions | none found in the code |
| Local mode | Not applicable: no behaviour exists. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| All states | not handled in the code (no feature) | search found no files |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/__tests__/published-safety-claims.test.ts`: Published safety claims on pages; whether it covers paid-placement claims was not opened.

**Test scenarios**

- **No sponsored items**
  1. Browse the plugin directory and gallery on web.
  - Expected: No item is marked sponsored or paid.
- **Search for the term**
  1. Search the source tree for sponsored fields.
  - Expected: None found, as at the time of this page.

**Where to look when it fails**

- none

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No rule or guard exists for the future case.** Affects: Future directory or feed. Evidence: no code found. Work needed: Add when paid placement is decided.

**Depends on**

- surface:web
- SYS-shared-ui-and-design
- F107-11

## Unknown

- Whether any ranking algorithm in the directory could later take paid input (filtering.ts not read in detail).
- Product intent for paid placement.
