---
id: "F081-05"
type: "feature"
title: "Shared or dedicated usage pools"
aliases: ["Shared or dedicated usage pools", "Per-seat usage", "Seat ledger", "Workspace spend limit", "Monthly spend limit", "Team usage per seat", "S81.16"]
area: "81 Free / Basic / Pro / Max 5x / Max 20x planning structure"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S81.16"]
depends_on: ["F081-01", "F081-02", "SYS-authorization-and-workspaces", "SYS-subscriptions-entitlements-and-usage", "SYS-data-model-and-migrations", "table:organizations", "table:organization_members", "table:subscriptions", "table:token_credits", "api:GET /api/settings/organization/spend-limit"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F081-05 Shared or dedicated usage pools

Team plans bill per seat and give each seat member their own credit ledger, created the first time the member uses Cloud. The pricing copy says 'for every seat'. A workspace admin can also set a monthly spend cap for the whole workspace. A shared pool of credits across seats was not found in the code.

Area: [81. Free / Basic / Pro / Max 5x / Max 20x planning structure](README.md). Requirement items: [S81.16](../../10-requirements/capabilities/081-free-basic-pro-max-5x-max-20x-planning-structure.md#s8116).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Treats Team, Team Premium and Enterprise as seat-bearing plans (apps/web/lib/services/entitlement-resolution.ts:35-38), resolves a member's plan from the workspace owner's subscription (lines 133-166), creates a monthly credit ledger for the member (lines 169-210), and offers an admin spend limit with off, notify and block modes (apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx:190; apps/web/app/api/settings/organization/spend-limit/route.ts:182-184).

**Why it exists.** So each team seat has a predictable allowance and an admin can bound the workspace's monthly spend.

**Who uses it.** Workspace owners and admins, and members who hold a seat.

**Problems it solves**

- One member using the whole team's allowance
- Admins having no ceiling on monthly managed spend
- A member with no subscription row of their own getting no plan

**Use cases**

- A new member signs in and gets the team plan's allowance on first use
- An admin sets a monthly cap with 'block' so turns stop at the cap
- A member on a Premium seat has 5x the usage of a Standard seat
- Admin changes the alert threshold from the default 80%

## 2. User experience

**Where to find it**

- Web: Pricing page Business tab: Standard and Premium seat rows, seat count box and the line '5x the usage of a Standard seat' (apps/web/app/pricing/page.tsx:1085-1190; apps/web/features/billing/lib/plan-card-copy.ts:274-300; packages/ui/i18n/locales/en/pricing.json:186)
- Web: workspace console card 'Monthly spend limit' (WorkspaceSpendLimit.tsx:190)
- Web: member's own Settings > Usage (apps/web/features/settings/sections/UsageSection.tsx:1217)
- Desktop (public Electron app): same web screens
- Mobile, CLI, VS Code, Chrome: no seat-specific screen found (brief marks n/a); a seat member sees their plan like any other [inferred]

**Before you start**

- A Team, Team Premium or Enterprise subscription owned by the workspace owner
- Admin permission to change the spend limit (canManageLimit from the route, spend-limit/route.ts:68)

**Screens and controls**

- Cap (credits) input, enforcement choice (off, notify, block), alert threshold percent, Save and clear controls (WorkspaceSpendLimit.tsx:60-230)
- Seat count and Premium seat count boxes on pricing (page.tsx:1100-1160)

**Journey**

1. Owner buys Team seats on /pricing (minimum 2 seats)
2. Members join the workspace
3. On the member's first request the server finds the owner's subscription, checks the member's seat rank against licensed seats and creates the member's credit ledger
4. Admin opens the spend limit card and sets a monthly cap and enforcement
5. When the cap is crossed the server notifies or refuses depending on enforcement

**What the person sees and gets**

- Enforcement help text: 'Recorded only. Nothing acts on the cap.', 'Crossing the cap is reported, but no turn is refused.', 'Managed turns stop at the cap, up to about a minute of spend late.' (WorkspaceSpendLimit.tsx:75-79)
- Refusal: HTTP 402 code organization_spend_cap_reached (managed-usage-request-service.ts:399)
- Progress text '<used> of <cap> used this month' with ' · over the limit' or alert marker (WorkspaceSpendLimit.tsx:205-225)

**Settings**

- Monthly cap in credits, enforcement mode, alert threshold percent (default 80) (WorkspaceSpendLimit.tsx:60-62)
- Seat type per member (Standard or Premium) in workspace settings (apps/web/lib/services/team-seat-type-service.ts)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Seat plans are marked per seat in the catalog; the usage comparison says 'for every seat' (billing-catalog.ts:153-155; managed-usage-limits.ts:197-215)
- Seat resolution: the member's own paid row wins; otherwise the earliest or active workspace's seat if the owner's subscription is entitled and the member's rank is within licensed seats (entitlement-resolution.ts:133-166,371-420)
- Ledger for a seat member is created on first resolution through CreditService.getOrCreateAccount with the plan's monthly budget (entitlement-resolution.ts:169-203)
- A failed ledger creation is logged as 'Seat member usage ledger could not be provisioned' and resolution continues (entitlement-resolution.ts:204-210)
- A sweep provisions ledgers for all current seat members (apps/web/lib/services/effective-subscription-service.ts:51-80)
- Workspace spend cap with off, notify and block modes, audit event on exceed and 402 refusal (spend-limit/route.ts:182-184; managed-usage-request-service.ts:376-399)

**Incomplete**

- The brief marks 'handler' unfinished on web and desktop; no matching unfinished code was identified (unknown)
- What a request does when the ledger is missing after a provisioning failure is not traced

**Present but disconnected or switched off**

- Team purchase uses the same waitlist and checkout gates as other paid plans (apps/web/lib/server/billing-waitlist-access.ts:28-40)

**Not available**

- A shared pool of credits across seats: not found in the code
- Seat-specific screens on mobile, CLI, VS Code and Chrome: none found

## 4. Required behaviour

**Established requirements**

- The plan structure states whether usage is pooled across members or dedicated per seat, and the ledger follows that choice. (source: S81.16 (brief))
- Team usage copy says 'for every seat'; Team seat usage equals Premium; Team Premium seat is 5x a Standard seat. (source: packages/contracts/types/src/__tests__/managed-usage-limits.test.ts:110-118)
- Business plans leave extra-usage control to admins; a member is told who manages it. (source: doc: docs/product/commercial.md lines 262-264)
- An action a user cannot undo asks first and names the consequence. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. A Team member with no subscription row of their own resolves to plan Team and gets a monthly ledger on first use
2. A member beyond the licensed seat count is not entitled
3. Pricing says Team gives 'Same usage as Premium for every seat'
4. Admin cap in 'block' mode returns 402 organization_spend_cap_reached when month-to-date spend reaches the cap
5. Admin cap in 'notify' mode never refuses a turn
6. A non-admin sees the card read-only

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Usage is dedicated per seat: each member has a ledger sized by the plan's monthly budget, and the workspace cap is a separate workspace-wide ceiling [inferred from entitlement-resolution.ts:169-203 and WorkspaceSpendLimit.tsx:190]
- A missing ledger would cause the first reservation to create or fail; not established [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] State on the pricing page that Team allowances are per seat and not pooled, using the existing 'for every seat' line
- [proposed] Add a test for a ledger provisioning failure showing what the member sees

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | entitlement-resolution | `apps/web/lib/services/entitlement-resolution.ts` | Seat-bearing check, seat resolution, ensureSeatMemberCreditAccount (lines 35-210, 384-420) |
| service | effective-subscription-service seat sweep | `apps/web/lib/services/effective-subscription-service.ts` | Provision ledgers for all seat members (lines 51-80) |
| service | team-seat-entitlement | `apps/web/lib/services/team-seat-entitlement.ts` | Seat holder plan tier and assignment columns |
| service | team-seat-type-service | `apps/web/lib/services/team-seat-type-service.ts` | Standard and Premium seat assignment |
| table | organizations and organization_members | `apps/web/lib/services/entitlement-resolution.ts` | Seat rank, licensed_seats and billing_plan_tier (SQL lines 62-90) |
| table | subscriptions | `apps/web/lib/services/entitlement-resolution.ts` | Owner's subscription read for the seat (SQL lines 76-89) |
| table | token_credits | `apps/web/db/neon/0300_plan_catalog_version.sql` | Member ledger with catalog version |
| endpoint | GET/PUT/DELETE /api/settings/organization/spend-limit | `apps/web/app/api/settings/organization/spend-limit/route.ts` | Read, set and clear the workspace cap (lines 182-184) |
| component | WorkspaceSpendLimit | `apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx` | Admin UI for the cap |
| service | managed-usage-request-service spend cap | `apps/web/lib/services/managed-usage-request-service.ts` | Refuses at the cap with 402 (lines 376-399) |
| config | spend-limit-bounds | `apps/web/lib/spend-limit-bounds.ts` | Valid cap and threshold ranges (imported at WorkspaceSpendLimit.tsx:12-19) |
| screen | PricingPage Team section | `apps/web/app/pricing/page.tsx` | Seat picker and per-seat usage copy (lines 1085-1190) |
| service | plan-card-copy teamSeatRows | `apps/web/features/billing/lib/plan-card-copy.ts` | Seat row copy (lines 266-330) |
| config | MANAGED_USAGE_BASELINES | `packages/contracts/types/src/managed-usage-limits.ts` | team vs pro and team_premium vs team (lines 158-166) |
| test | team-seat-entitlement test | `apps/web/lib/services/__tests__/team-seat-entitlement.test.ts` | Seat entitlement |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A member's request resolves entitlement: own paid row first, then seat candidates from the workspace owner's subscription. | our servers | apps/web/lib/services/entitlement-resolution.ts:384-420 |
| The seat is accepted if the owner's subscription is entitled and the member's join rank is within licensed seats. | our servers | apps/web/lib/services/entitlement-resolution.ts:96-110 |
| A monthly ledger is created for the member sized by the seat plan's budget. | our servers | apps/web/lib/services/entitlement-resolution.ts:169-203 |
| Each request reserves credits against the member's ledger and, when set, checks the workspace month-to-date cap. | our servers | apps/web/lib/services/managed-usage-request-service.ts:376-399 |
| On a crossing in block mode the server audits the event and returns 402. | our servers | apps/web/lib/services/managed-usage-request-service.ts:381-399 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Member credit ledger | table token_credits | Server | Per billing period |
| Workspace spend cap settings | workspace settings storage behind /api/settings/organization/spend-limit (table name not read) | Server | Until cleared with DELETE |
| Audit event spend_cap_exceeded | audit log | Server | unknown |

**Models and providers.** None. Seat plan decides model access as Team maps to the paid policy and Team Premium to the Max policy (packages/contracts/types/src/model-catalog.ts:1693-1714).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Member signs in with their own account; the plan comes from the workspace owner's subscription. |
| Permissions | Setting the cap needs the permission checked by resolveOrganizationPermissions (spend-limit/route.ts:68); other members read only. |
| Subscription | Team, Team Premium and Enterprise (contract) are seat-bearing (entitlement-resolution.ts:35-38). |
| Limits and metering | Per-seat monthly credits equal the plan's monthly allowance; cap in credits per calendar month with threshold percent (WorkspaceSpendLimit.tsx:60-62,203-206). Seats between 2 and 999,999 (billing-catalog.ts:157-158). |
| Feature flags | None found for seat ledgers. Purchase gates as in F081-06. |
| Model compatibility | Seat tier maps Team to the paid policy and Team Premium to the Max policy. |
| Provider restrictions | None found in the code. |
| Local mode | No seat or spend-cap rule applies to Local or own-key use; workspace spend applies to managed Cloud turns only (managed-usage-request-service.ts:376-399). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Seat rank beyond licensed seats | Seat not entitled | apps/web/lib/services/entitlement-resolution.ts:96-98 |
| Owner subscription lapsed | Seat not entitled; the member falls to their own row or Free | apps/web/lib/services/entitlement-resolution.ts:99-110,384-420 |
| Ledger provisioning fails | Error logged with user and organization; request continues | apps/web/lib/services/entitlement-resolution.ts:204-210 |
| Seat lookup fails for a workspace member | Throws when throwOnSeatLookupError is set, otherwise falls back to the member's own plan | apps/web/lib/services/entitlement-resolution.ts:402-412 |
| Spend cap load error | Card shows 'We could not load the monthly spend limit' with Try again | apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx:145-165 |
| Loading | 'Loading the monthly spend limit…' | apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx:139-143 |
| Clearing a cap | Uses a confirm dialog (useConfirmAction) | apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx:4,100-130 |
| Offline and timeout | not handled in the code beyond the error card with Try again | apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx:145-165 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/team-seat-entitlement.test.ts`: Seat entitlement; contents not read
- `apps/web/lib/services/__tests__/team-seat-type-service.test.ts`: Seat type service; contents not read
- `packages/contracts/types/src/__tests__/team-seat-types.test.ts`: Seat type helpers; contents not read
- `apps/web/lib/services/__tests__/entitlement-resolution.characterization.test.ts`: Entitlement resolution behaviour; contents not read
- `apps/web/app/api/settings/organization/spend-limit/route.test.ts`: Spend limit route; contents not read
- `apps/web/app/api/settings/team/[memberId]/seat/route.authority.test.ts`: Seat change authority; contents not read
- `packages/contracts/types/src/__tests__/managed-usage-limits.test.ts`: Team same as Premium per seat, seat baselines (lines 110-118)

**Test scenarios**

- **First-use ledger**
  1. Owner buys 2 Team seats on a test deployment
  2. Invite a second account and let it send one Cloud turn
  3. Read token_credits for that member
  - Expected: A monthly ledger row exists sized to the Team plan's monthly credits
- **Seat beyond licence**
  1. Add a third member to a 2-seat workspace
  2. Send a Cloud turn as the third member
  - Expected: Member is not entitled via the seat; plan resolves as Free
- **Block mode cap**
  1. Admin sets a small cap with enforcement block
  2. Use turns until month-to-date spend reaches it
  - Expected: Next turn returns 402 organization_spend_cap_reached and an audit event is recorded
- **Notify mode**
  1. Set enforcement notify and exceed the cap
  - Expected: Turns still succeed and the card shows over the limit
- **Ledger failure**
  1. Force ledger creation to fail in a test
  - Expected: Log line 'Seat member usage ledger could not be provisioned'; observe what the member sees

**Where to look when it fails**

- Log 'Seat member usage ledger could not be provisioned' (entitlement-resolution.ts:206)
- Log 'Seat entitlement lookup failed; falling back to no seat' (entitlement-resolution.ts:404)
- Error code organization_spend_cap_reached (managed-usage-request-service.ts:399)
- Tables organization_members, organizations, token_credits

**Hands-on test plans**

- Web: [70-qa/test-plans/web/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../70-qa/test-plans/web/081-free-basic-pro-max-5x-max-20x-planning-structure.md)
- Desktop: [70-qa/test-plans/desktop/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../70-qa/test-plans/desktop/081-free-basic-pro-max-5x-max-20x-planning-structure.md)

## 10. Gaps and dependencies

- **No pooled-usage option exists; the plan structure is dedicated per seat plus a workspace cap, and no page states 'not pooled' in plain words** Affects: Team buyers and admins on web and Electron desktop. Evidence: apps/web/lib/services/entitlement-resolution.ts:169-203; apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx:190. Work needed: State the model on pricing and Team settings or build a pool if required
- **Unknown meaning of the brief's 'handler unfinished' on web and desktop** Affects: Team admins. Evidence: brief S81.16 'Unfinished: handler'; no matching code found. Work needed: Ask the brief author which handler; add it to open work
- **Outcome after a failed ledger creation is not traced** Affects: Team members whose ledger failed. Evidence: apps/web/lib/services/entitlement-resolution.ts:204-210. Work needed: Trace the reservation path and add a test
- **No seat view on mobile, CLI, VS Code or Chrome** Affects: Team members on those apps. Evidence: brief marks n/a. Work needed: Confirm members still see their plan through the account endpoint

**Depends on**

- F081-01
- F081-02
- SYS-authorization-and-workspaces
- SYS-subscriptions-entitlements-and-usage
- SYS-data-model-and-migrations
- table:organizations
- table:organization_members
- table:subscriptions
- table:token_credits
- api:GET /api/settings/organization/spend-limit

## Unknown

- Which 'handler' the brief calls unfinished
- Table that stores the workspace spend cap
- What a member sees when ledger creation fails
- Whether mobile, CLI, VS Code and Chrome show a seat plan correctly (no seat-specific code found)
- Retention of audit events
