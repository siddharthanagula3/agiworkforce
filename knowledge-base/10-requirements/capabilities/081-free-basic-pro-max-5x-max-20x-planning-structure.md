---
id: "REQ-AREA-081"
type: "requirements"
title: "Requirement items: Free / Basic / Pro / Max 5x / Max 20x planning structure"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 81. Free / Basic / Pro / Max 5x / Max 20x planning structure

28 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S81.01

**Versioned plan catalog.** One plan catalog with a version number drives pricing and checkout, and each subscription records the catalog version it was sold under.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F081-01 Plan catalog and plan lineup](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-01-plan-catalog-and-plan-lineup.md)
- Competitor trace: CAP-subscriptions-and-plans-30

## S81.02

**Free-plan feature bundle.** The Free plan has a defined bundle (capabilities and limits) that is shown to users and enforced server-side.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F081-01 Plan catalog and plan lineup](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-01-plan-catalog-and-plan-lineup.md)
- Competitor trace: CAP-subscriptions-and-plans-01, CAP-subscriptions-and-plans-29

## S81.03

**Basic-plan feature bundle.** The Basic plan has a defined, priced bundle (capabilities and limits) shown on pricing and in-app and enforced from the catalog.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F081-01 Plan catalog and plan lineup](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-01-plan-catalog-and-plan-lineup.md)
- Competitor trace: CAP-subscriptions-and-plans-02

## S81.04

**Pro-plan feature bundle.** The Pro plan has a defined, priced bundle (capabilities and limits) shown on pricing and in-app and enforced from the catalog.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F081-01 Plan catalog and plan lineup](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-01-plan-catalog-and-plan-lineup.md)
- Competitor trace: CAP-subscriptions-and-plans-02

## S81.05

**Max 5x feature bundle.** The Max 5x plan has a defined, priced bundle (capabilities and limits) shown on pricing and in-app and enforced from the catalog.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F081-01 Plan catalog and plan lineup](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-01-plan-catalog-and-plan-lineup.md)
- Competitor trace: CAP-subscriptions-and-plans-02

## S81.06

**Max 15x feature bundle.** The Max 15x plan has a defined, priced bundle (capabilities and limits) shown on pricing and in-app and enforced from the catalog.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F081-01 Plan catalog and plan lineup](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-01-plan-catalog-and-plan-lineup.md)
- Competitor trace: CAP-subscriptions-and-plans-02

## S81.07

**Explicit definition of the baseline behind “5x” and “15x.”** Pricing states what "1x" means: the baseline plan behind 5x/15x and its concrete allowance.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, VS Code done, Chrome unverified
- Feature: [F081-02 Usage allowance and the multiplier baseline (5x, 15x)](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-02-usage-allowance-and-the-multiplier-baseline-5x-15x.md)
- Competitor trace: CAP-subscriptions-and-plans-02

## S81.08

**Explicit identification of the allowance being multiplied.** Plan copy names exactly which allowance a multiplier scales (e.g. managed-usage credits per 5-hour, weekly and monthly window).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, VS Code done, Chrome unverified
- Feature: [F081-02 Usage allowance and the multiplier baseline (5x, 15x)](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-02-usage-allowance-and-the-multiplier-baseline-5x-15x.md)

## S81.09

**Separate feature-access differences.** Plans differ in feature access (not just usage), the differences are listed, and each gate is enforced server-side.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F081-04 Feature access by plan](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-04-feature-access-by-plan.md)
- Competitor trace: CAP-subscriptions-and-plans-04, CAP-subscriptions-and-plans-28

## S81.10

**Separate upload-size limits.** Each plan has its own upload-size limit, stated to users and enforced on upload.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing
- Feature: [F081-03 Per-plan limits](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-03-per-plan-limits.md)

## S81.11

**Separate storage limits.** Each plan has its own storage limit, stated to users and enforced when files are added.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F081-03 Per-plan limits](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-03-per-plan-limits.md)

## S81.12

**Separate context limits.** Each plan has its own context-size limit, stated to users and enforced per request.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F081-03 Per-plan limits](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-03-per-plan-limits.md)

## S81.13

**Separate concurrency limits.** Each plan has its own limit on simultaneous responses, stated to users and enforced per turn.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F081-03 Per-plan limits](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-03-per-plan-limits.md)

## S81.14

**Separate generation settings.** Plans differ in generation settings (e.g. reasoning effort, manual model choice), the UI shows the gated options, and the server clamps requests to the plan.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F081-03 Per-plan limits](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-03-per-plan-limits.md)
- Competitor trace: CAP-subscriptions-and-plans-28

## S81.15

**Separate per-model caps.** Plans carry caps specific to a model class (flagship models get their own weekly cap), shown to users and enforced on admission.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F081-02 Usage allowance and the multiplier baseline (5x, 15x)](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-02-usage-allowance-and-the-multiplier-baseline-5x-15x.md)

## S81.16

**Shared versus dedicated usage pools.** The plan structure states whether usage is pooled across members or dedicated per seat, and the ledger follows that choice.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F081-05 Shared or dedicated usage pools](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-05-shared-or-dedicated-usage-pools.md)
- Competitor trace: CAP-subscriptions-and-plans-20, CAP-subscriptions-and-plans-22
- An owner decision is open on this item.

## S81.17

**Monthly and annual billing choices.** Users can choose monthly or annual billing where a plan offers both, with the annual saving shown and checkout charging the chosen cadence.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F081-06 Pricing, billing cadence, upgrades and downgrades](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-06-pricing-billing-cadence-upgrades-and-downgrades.md)
- Competitor trace: CAP-subscriptions-and-plans-03

## S81.18

**Trial entitlements.** A plan can be granted as a time-limited trial that is shown as a trial and ends (reverts or bills) when its period is over.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Chrome done
- Feature: [F081-07 Trials, promotions, credits and overage](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-07-trials-promotions-credits-and-overage.md)
- Competitor trace: CAP-subscriptions-and-plans-18

## S81.19

**Promotional entitlements.** Promotional entitlements (promo codes, bonus credits, invite grants) exist, are applied to the account and are visible to the user.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F081-07 Trials, promotions, credits and overage](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-07-trials-promotions-credits-and-overage.md)
- Competitor trace: CAP-subscriptions-and-plans-18

## S81.20

**Purchased credit balances.** Users can buy credit top-ups that form a separate purchased balance, which carries over and is shown apart from the plan allowance.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F081-07 Trials, promotions, credits and overage](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-07-trials-promotions-credits-and-overage.md)
- Competitor trace: CAP-subscriptions-and-plans-15

## S81.21

**Optional overage.** Users can opt in to spending purchased credits past a plan limit (overage), off by default, and overage use is accounted separately from the plan windows.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F081-07 Trials, promotions, credits and overage](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-07-trials-promotions-credits-and-overage.md)
- Competitor trace: CAP-subscriptions-and-plans-15

## S81.22

**Grandfathered plan versions.** Subscribers on a retired plan or price keep what they bought (price, plan and allowances) while new buyers are sent to the successor.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F081-01 Plan catalog and plan lineup](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-01-plan-catalog-and-plan-lineup.md)
- Competitor trace: CAP-subscriptions-and-plans-30

## S81.23

**Upgrade effective time.** An upgrade takes effect at a stated time (immediately), with the charge and the new renewal date shown before confirming.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile partial
- Feature: [F081-06 Pricing, billing cadence, upgrades and downgrades](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-06-pricing-billing-cadence-upgrades-and-downgrades.md)
- Competitor trace: CAP-subscriptions-and-plans-06

## S81.24

**Downgrade effective time.** A downgrade takes effect at a stated time (e.g. end of period), shown to the user before they confirm, with access kept until then.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F081-06 Pricing, billing cadence, upgrades and downgrades](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-06-pricing-billing-cadence-upgrades-and-downgrades.md)
- Competitor trace: CAP-subscriptions-and-plans-07

## S81.25

**Grace-period behavior.** When a renewal payment fails, the plan follows a defined grace rule and the user is told what access remains and how to fix it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F081-06 Pricing, billing cadence, upgrades and downgrades](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-06-pricing-billing-cadence-upgrades-and-downgrades.md)
- Competitor trace: CAP-subscriptions-and-plans-14

## S81.26

**API/programmatic use treated explicitly.** Programmatic/API use is an explicit plan capability: which plans include it, what it consumes, and API calls are gated by it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F081-04 Feature access by plan](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-04-feature-access-by-plan.md)
- Competitor trace: CAP-subscriptions-and-plans-26

## S81.27

**Cross-platform entitlement sharing.** One account plan applies on every signed-in surface: each surface reads the same server-side entitlement and the server enforces it per surface.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F081-04 Feature access by plan](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-04-feature-access-by-plan.md)
- Competitor trace: CAP-subscriptions-and-plans-01, CAP-subscriptions-and-plans-09, CAP-subscriptions-and-plans-17, CAP-subscriptions-and-plans-28

## S81.28

**Plan-specific feature explanations.** Each plan explains its own features (what it adds over the current plan, and why a blocked feature needs a given plan).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F081-01 Plan catalog and plan lineup](../../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/F081-01-plan-catalog-and-plan-lineup.md)
- Competitor trace: CAP-subscriptions-and-plans-04
