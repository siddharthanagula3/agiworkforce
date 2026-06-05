# Data Room Index

Status: Current
Owner: Founder
Created: 2026-05-31

## Goal

Prepare a staged data room that lets serious buyers diligence AGI Workforce without exposing source code too early.

## Access Stages

| Stage | Buyer state | Materials allowed |
| --- | --- | --- |
| Stage 0 | Cold / no NDA | One-page teaser, public demo video, public GitHub profile screenshots, high-level metrics only. |
| Stage 1 | Warm / buyer qualified | Buyer deck, non-confidential architecture summary, product demo videos, commercial thesis. |
| Stage 2 | NDA signed | Technical diligence memo, repo stats, verification evidence, IP provenance, license disclosure, known risks, limited architecture walkthrough. |
| Stage 3 | LOI or serious diligence | Read-only repo access, commit history, build runbook, selected code walkthroughs, asset schedule, legal schedules. |
| Stage 4 | Purchase agreement | Full repo transfer plan, domain/account assignment plan, transition-services plan, closing deliverables. |

## Folder Structure

```text
data-room/
  00-intro/
    teaser.pdf
    buyer-deck.pdf
    founder-note.pdf
  01-product/
    product-overview.pdf
    demo-links.md
    screenshots/
  02-technical/
    technical-diligence-memo.pdf
    architecture-map.pdf
    verification-log.md
    build-runbook.md
  03-ip-and-legal/
    ownership-summary.pdf
    ip-provenance-disclosure.pdf
    third-party-license-disclosure.pdf
    ai-assisted-development-disclosure.pdf
    known-risks-schedule.pdf
  04-commercial/
    demand-validation-results.pdf
    waitlist-export-redacted.csv
    ad-experiment-summary.pdf
    buyer-target-rationale.pdf
  05-assets/
    asset-schedule.pdf
    domain-and-account-schedule.pdf
    package-and-marketplace-schedule.pdf
  06-transaction/
    nda-executed/
    loi-drafts/
    transition-services-outline.pdf
```

## Asset Schedule To Prepare

| Asset | Current evidence | Action before diligence |
| --- | --- | --- |
| Source repo | Private GitHub repo, 4,594+ commits shown in screenshot, local checks pass except mobile tests | Create buyer-safe branch/tag after test cleanup. |
| Documentation | `docs/current`, `docs/plans`, `audit`, `reports` | Separate owned docs from competitor-reference archives in the data room. |
| Website/domain | `agiworkforce.com` appears in repo metadata and GitHub About | Prepare domain ownership screenshot and transfer steps. |
| GitHub repo | `siddharthanagula3/agiworkforce` | Decide whether buyer receives repo transfer or source export. |
| App bundle IDs | `com.agiworkforce.app` in store-submission docs | Prepare Apple/Google account transfer feasibility notes. |
| Packages/releases | GitHub releases, package docs, CLI release workflow | Prepare release inventory and signing status. |
| Trademark/brand | Public brand `AGI`, formal name `AGI Workforce` | Ask counsel about clearance and assignment risk. |
| Company entity | AGI Automation LLC referenced in docs | Prepare entity docs, ownership proof, and assignment authority. |

## Required Evidence Before Sending Source

- Passing `pnpm check:llm-operability`.
- Passing `pnpm typecheck:all`.
- Passing `cargo check --workspace`.
- Current `pnpm test` status, including any remaining exceptions.
- Clean `git status`.
- Third-party license disclosure updated.
- AI-assisted development disclosure prepared.
- Known copied/adapted code list prepared.
- Reference/archive materials separated from owned sale assets.
- No secrets in repo or data room.

## Missing Items To Create

- Short demo videos: mobile local chat, desktop/web artifact flow, CLI/IDE/extension developer flow.
- Redacted waitlist/ad experiment export if paid validation is run.
- Attorney-reviewed NDA.
- Attorney-reviewed LOI.
- Attorney-reviewed asset purchase agreement.
- Founder IP assignment to selling entity, if not already complete.
