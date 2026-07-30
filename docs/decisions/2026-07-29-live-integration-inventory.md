# Keep One Live Integration Inventory

Status: Accepted

Date: 2026-07-29

Owners: Platform and product integration

## Context

The 2026-06-28 repository cleanup removed the former `audit/` tree to stop
generated reports from becoming stale parallel documentation. The verified
July 2026 product audit, however, produced a fixed 654-item checklist whose
status changes are the acceptance metric for the integration roadmap. Keeping
that data only in a private artifact makes CI enforcement and regression
tracking impossible.

## Decision

`audit/inventory.json` is the sole exception to the retired `audit/`-directory
rule. It is a machine-readable operational ledger, not a prose report. Every
record has exactly four fields: `item`, `surface`, `status`, and `evidence`.

The inventory must:

- retain all 654 checklist identities and evidence;
- use only the seven defined statuses;
- pass `pnpm check:audit-inventory`;
- be updated in the same change that wires, cuts, breaks, or materially
  completes a listed capability.

Prose findings continue to belong in `docs/agent-context/known-flaws.md` or
`docs/security/`. No other generated report or ad hoc file may be added under
`audit/` without a superseding decision.

## Consequences

CI can measure the integration backlog and reject malformed or silently
truncated inventories. The inventory remains reviewable and diffable, while
the repository avoids recreating a general-purpose report archive.
