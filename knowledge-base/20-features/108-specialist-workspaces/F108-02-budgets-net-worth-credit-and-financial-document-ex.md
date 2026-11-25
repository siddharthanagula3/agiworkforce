---
id: "F108-02"
type: "feature"
title: "Budgets, net worth, credit and financial document explanation (not built)"
aliases: ["Budget planning (S108.04)", "Net-worth view (S108.05)", "Financial-document explanation (S108.06)", "Credit-report view (S108.07)", "Credit-score history (S108.08)"]
area: "108 Specialist workspaces"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S108.04", "S108.05", "S108.06", "S108.07", "S108.08"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "F108-01", "SYS-subscriptions-entitlements-and-usage", "SYS-chat-turn-pipeline", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-data-model-and-migrations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F108-02 Budgets, net worth, credit and financial document explanation (not built)

Planned money tools that do not exist: category budgets, net worth, a document explanation flow, and credit report and score views. No screen, route, table or contract was found in the web, desktop, mobile, extension or package code. Only the bank dashboard (F108-01) sits next to them.

Area: [108. Specialist workspaces](README.md). Requirement items: [S108.04](../../10-requirements/capabilities/108-specialist-workspaces.md#s10804), [S108.05](../../10-requirements/capabilities/108-specialist-workspaces.md#s10805), [S108.06](../../10-requirements/capabilities/108-specialist-workspaces.md#s10806), [S108.07](../../10-requirements/capabilities/108-specialist-workspaces.md#s10807), [S108.08](../../10-requirements/capabilities/108-specialist-workspaces.md#s10808).

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

**What it does.** Nothing today. As planned in the brief: set budgets by category and track them, show assets minus liabilities, explain a statement, bill or tax form in plain words, show a credit report and a score history.

**Why it exists.** The brief lists them as part of the specialist money workspace (S108.04-S108.08). No decision document in docs/decisions covers credit data; D-2026-09-28-08 covers only read-only bank accounts (doc: docs/decisions/2026-09-27-founder-decisions.md:198-215).

**Who uses it.** Planned for people managing personal money. No one can use it today.

**Problems it solves**

- Planned: see whether spending stays inside a set amount
- Planned: see one net-worth figure
- Planned: understand a financial document
- Planned: see credit standing over time

**Use cases**

- Planned: set a monthly Dining budget and see progress
- Planned: upload a statement and get fields and plain-language terms
- Planned: view the credit report accounts and inquiries
- Planned: see the score history chart

## 2. User experience

**Where to find it**

- Web, Desktop, Mobile, Chrome: not present (brief status missing for S108.04-S108.08).
- CLI, VS Code: not applicable.

**Before you start**

- Not built. If built on top of F108-01, a linked bank and the paid plan rules in F108-01 would apply [inferred].

**Screens and controls**

- None. The nearest real screen is the Finances page (F108-01), which shows spending by category and account balances but has no budget, net-worth or credit control (apps/web/features/finance/components/FinanceDashboard.tsx:326-408).

**Journey**

1. No journey exists. A person can ask chat in general terms; chat has no finance-specific document flow, and none was found.

**What the person sees and gets**

- None. Empty, waiting and failure states are not defined in code.

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing for these five items. Search evidence: git grep -i -E for net worth, credit score or report, category budget, wearable and related terms across apps and packages (excluding json, markdown and the connector directory) found no feature code.

**Incomplete**

- Adjacent only: account balances carry current, available and limit fields (packages/contracts/cloud-contracts/src/finance.ts:12-22) and the overview sums spending by category and month (apps/web/lib/services/finance-overview-service.ts:64-117); neither adds assets minus liabilities or budgets.

**Present but disconnected or switched off**

- F108-01 data is itself disabled by the release state (see F108-01).

**Not available**

- Web, Desktop, Mobile, Chrome: all five items are missing (brief).

## 4. Required behaviour

**Established requirements**

- Budgets by category are set by the user and tracked against actual spending. (source: S108.04 (brief))
- Net worth is assets minus liabilities across linked accounts. (source: S108.05 (brief))
- A dedicated flow explains a financial document with extracted fields and plain-language terms. (source: S108.06 (brief))
- The user can view a credit report with accounts, inquiries and derogatory marks. (source: S108.07 (brief))
- The product shows the credit score over time. (source: S108.08 (brief))

**Acceptance criteria**

1. A user can create a budget for a category and see spent versus set amount for the period.
2. Net worth equals the sum of asset accounts minus liabilities across linked accounts and states which accounts were counted.
3. Uploading a statement returns extracted fields and a plain explanation of terms, with a visible not-financial-advice boundary if the product adopts one.
4. The credit view lists accounts, inquiries and marks from a named source.
5. The score view plots values by date.
6. Each view has defined empty, waiting and error states.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Budgets and net worth would depend on F108-01 linking and its release gate, and net worth needs investment and loan account types the Plaid products requested today do not include (only 'transactions' is requested: bank-accounts.ts:41; connector-scopes.ts:234) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Build budgets first as a table keyed by user and Plaid category using the overview service.
- [proposed] Choose a credit data vendor and record the decision in docs/decisions before any code.
- [proposed] Route document explanation through the existing chat attachment path rather than a new service.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | finance-overview-service (adjacent) | `apps/web/lib/services/finance-overview-service.ts` | Adjacent: category and month sums a budget view could reuse |
| schema | finance contract (adjacent) | `packages/contracts/cloud-contracts/src/finance.ts` | Adjacent: account balance and limit fields, no budget or net-worth shape |
| component | FinanceDashboard (adjacent) | `apps/web/features/finance/components/FinanceDashboard.tsx` | Adjacent: the only finance screen |
| config | Plaid products list (adjacent) | `packages/contracts/cloud-contracts/src/connector-scopes.ts` | Adjacent: bank-accounts scope ceiling is only 'transactions' (line 234) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No execution path exists for budgets, net worth, credit or document explanation. | our servers | git grep absence search over apps and packages; no route, table or contract found |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| No data is created by these items | none | not applicable | not applicable |

**Models and providers.** None today. Any future explanation flow would use the shared chat pipeline [proposed]; a credit feature would need a data vendor not present in the repository.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code |
| Permissions | none found in the code |
| Subscription | none found in the code for these items |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Not available; nothing built. Whether a document explanation could run on-device is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| All states | not handled in the code; the feature does not exist | absence search over apps and packages |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/finance-overview-service.ts (no test file found by name)`: No test covers budgets, net worth or credit; the adjacent overview route has a test at apps/web/app/api/finance/overview/__tests__/route.test.ts

**Test scenarios**

- **Confirm absence**
  1. Open /chat/finance after linking a bank in a test build
  2. Look for budget, net worth, credit or document controls
  - Expected: Only accounts, spending, months and recent transactions are shown
- **Search check**
  1. Run git grep -i -E 'net.?worth|credit.?score|credit.?report|category budget' across apps and packages, excluding json and markdown
  - Expected: No feature code is returned

**Where to look when it fails**

- No log lines or tables exist for these items; check the brief rows S108.04-S108.08 and audit/partial/108-specialist-workspaces.md (the file lists open work)

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Budgets are not built** Affects: Web, Desktop, Mobile, Chrome. Evidence: brief S108.04. Work needed: Design, table, endpoints, screen, tests
- **Net worth is not built and the linked products cannot supply loans or investments** Affects: All apps. Evidence: brief S108.05; bank-accounts.ts:41. Work needed: Extend Plaid products or accept transactions-only accounts; legal review
- **Financial document explanation is not built** Affects: All apps. Evidence: brief S108.06. Work needed: Flow design and extraction method
- **Credit report and score are not built and no vendor exists** Affects: All apps. Evidence: briefs S108.07, S108.08; no decision doc. Work needed: Vendor decision, legal review, build
- Not built on: Web, Desktop, Mobile, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- F108-01
- SYS-subscriptions-entitlements-and-usage
- SYS-chat-turn-pipeline
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-data-model-and-migrations

## Unknown

- Whether any credit data vendor is intended.
- Whether document explanation will reuse chat attachments.
- Any private branch or spec for these items: none found under docs/specs by this search (not exhaustively listed).
