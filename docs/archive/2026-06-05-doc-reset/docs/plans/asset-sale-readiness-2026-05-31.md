# Asset Sale Readiness Plan

Status: Active plan
Owner: Founder
Last updated: 2026-05-31

## Goal

Prepare AGI Workforce for strategic asset-sale outreach without adding new product scope.

## Recommendation

Run a 30-day sale-readiness sprint:

1. Stabilize the repo and demo path.
2. Prepare a clean buyer data room.
3. Run a small paid demand-validation sprint if desired.
4. Start targeted strategic outreach.

## Non-Negotiables

- No new features before sale outreach.
- Do not send source code before NDA and buyer qualification.
- Do not represent paid waitlist signups as active users or revenue.
- Do not include competitive reference archives as owned product IP.
- Use legal counsel for NDA, LOI, asset purchase agreement, IP assignment, and disclosure schedules.

## Current Verification Snapshot

As of 2026-05-31:

- `pnpm check:llm-operability` passed.
- `pnpm typecheck:all` passed.
- `cargo check --workspace` passed.
- `pnpm test` failed in Mobile with 4 failed suites / 33 failed tests.

## 30-Day Timeline

### Days 1-7: Stabilize

- Fix Mobile test failures or intentionally de-scope failing behavior.
- Re-run `pnpm test`.
- Re-run `pnpm check:llm-operability`, `pnpm typecheck:all`, and `cargo check --workspace`.
- Record a clean verification log.
- Freeze scope.

### Days 8-14: Package

- Prepare demo videos.
- Refresh third-party license disclosure.
- Separate owned source/docs from competitive reference/archive material.
- Build the data room structure.
- Prepare teaser, buyer deck, technical memo, and known-risk schedule.
- Have counsel review NDA and LOI terms.

### Days 15-24: Validate Demand

Optional but recommended if cash allows:

- Create three landing pages: free local AI, developer/local LLM, sensitive work.
- Run a small ChatGPT Ads / paid validation sprint.
- Track qualified signups, not raw emails.
- Follow up manually with high-intent signups.
- Convert results into a buyer-ready demand memo.

### Days 25-30: Outreach

- Build a list of 80-150 targets.
- Start with warm intros.
- Send short non-confidential teaser and demo.
- Track replies and follow-ups in a CRM spreadsheet.
- Move serious buyers to NDA and staged diligence.

## Paperwork Location

Prepared sale package:

- `reports/asset-sale-prep/README.md`
- `reports/asset-sale-prep/00-data-room-index.md`
- `reports/asset-sale-prep/01-one-page-teaser.md`
- `reports/asset-sale-prep/02-buyer-deck-outline.md`
- `reports/asset-sale-prep/03-technical-diligence-memo.md`
- `reports/asset-sale-prep/04-ip-provenance-and-license-disclosure.md`
- `reports/asset-sale-prep/05-known-risks-and-exceptions-schedule.md`
- `reports/asset-sale-prep/06-buyer-target-list.md`
- `reports/asset-sale-prep/07-outreach-email-templates.md`
- `reports/asset-sale-prep/08-nda-term-sheet-for-counsel.md`
- `reports/asset-sale-prep/09-loi-term-sheet-for-counsel.md`
- `reports/asset-sale-prep/10-transition-services-outline.md`
- `reports/asset-sale-prep/11-paid-demand-validation-plan.md`

## Exit Pricing Posture

Do not anchor outreach on a single number. Segment by buyer:

- Strategic AI labs: open high if they engage seriously.
- Developer-tool/local/privacy/open-model companies: mid-range strategic asset sale.
- Marketplaces/indie buyers: lower price, faster close.

Keep internal walk-away based on cash urgency and transition burden. Do not let sunk cost define price.

## Success Criteria

- Clean verification log.
- Buyer-safe data room.
- At least 3 demo videos.
- At least 80 targeted outreach attempts.
- At least 5 buyer calls.
- At least 2 serious diligence conversations.
- At least 1 written indication of interest or LOI.
