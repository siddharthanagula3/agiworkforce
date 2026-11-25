---
id: "REQ-AREA-079"
type: "requirements"
title: "Requirement items: Routing and model-neutral orchestration"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 79. Routing and model-neutral orchestration

31 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S79.01

**Automatic model selection.** Auto picks a model per request from the registry for the task, plan and constraints.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F079-01 Auto picks the model](../../20-features/079-routing-and-model-neutral-orchestration/F079-01-auto-picks-the-model.md)
- Competitor trace: CAP-model-selection-04

## S79.02

**User-selected model.** The user can pick a specific model and the request runs on it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F079-04 Pick a model yourself, and locks](../../20-features/079-routing-and-model-neutral-orchestration/F079-04-pick-a-model-yourself-and-locks.md)
- Competitor trace: CAP-model-selection-01

## S79.03

**Project default model.** A project can set a default model that new chats in the project use.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done, Chrome missing
- Feature: [F079-05 Project default model](../../20-features/079-routing-and-model-neutral-orchestration/F079-05-project-default-model.md)
- Competitor trace: CAP-model-selection-18

## S79.04

**Task-specific model profile.** Auto applies a task-specific routing profile (e.g. premium for coding and reasoning).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F079-01 Auto picks the model](../../20-features/079-routing-and-model-neutral-orchestration/F079-01-auto-picks-the-model.md)
- Competitor trace: CAP-model-selection-04, CAP-model-selection-26

## S79.05

**Speed-first profile.** A speed-first routing profile can be applied that prefers the fastest eligible route.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, VS Code done
- Feature: [F079-02 Instant, Best and Economy choices](../../20-features/079-routing-and-model-neutral-orchestration/F079-02-instant-best-and-economy-choices.md)

## S79.06

**Quality-first profile.** A quality-first routing profile can be applied that prefers the most capable eligible route.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, VS Code done
- Feature: [F079-02 Instant, Best and Economy choices](../../20-features/079-routing-and-model-neutral-orchestration/F079-02-instant-best-and-economy-choices.md)

## S79.07

**Cost-first profile.** A cost-first routing profile can be applied that prefers the cheapest eligible route.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, VS Code done, Chrome done
- Feature: [F079-02 Instant, Best and Economy choices](../../20-features/079-routing-and-model-neutral-orchestration/F079-02-instant-best-and-economy-choices.md)

## S79.08

**Privacy-first profile.** A privacy-first profile keeps requests on local models or zero-retention routes.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F079-06 Privacy-first routing](../../20-features/079-routing-and-model-neutral-orchestration/F079-06-privacy-first-routing.md)
- Competitor trace: CAP-model-selection-29

## S79.09

**Classification of task intent.** Each request's task intent is classified and used for routing.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F079-03 Understanding the request](../../20-features/079-routing-and-model-neutral-orchestration/F079-03-understanding-the-request.md)
- Competitor trace: CAP-model-selection-04

## S79.10

**Classification of required tools.** Which tools a request needs (research, agentic work, code execution) changes the routing task.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F079-03 Understanding the request](../../20-features/079-routing-and-model-neutral-orchestration/F079-03-understanding-the-request.md)
- Competitor trace: CAP-research-15

## S79.11

**Classification of required modalities.** Attached images/video route the request to a multimodal-capable model.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F079-03 Understanding the request](../../20-features/079-routing-and-model-neutral-orchestration/F079-03-understanding-the-request.md)
- Competitor trace: CAP-model-selection-16

## S79.12

**Complexity/effort classification.** Requests are classified by complexity so routing can set a quality floor or effort.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F079-03 Understanding the request](../../20-features/079-routing-and-model-neutral-orchestration/F079-03-understanding-the-request.md)
- Competitor trace: CAP-model-selection-04

## S79.13

**Source-freshness classification.** Requests needing current information are detected and routed to search-capable handling.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F079-03 Understanding the request](../../20-features/079-routing-and-model-neutral-orchestration/F079-03-understanding-the-request.md)

## S79.14

**Model eligibility filtering.** Candidates are filtered by capability, lifecycle, plan, policy, region and credentials before ranking.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F079-01 Auto picks the model](../../20-features/079-routing-and-model-neutral-orchestration/F079-01-auto-picks-the-model.md)
- Competitor trace: CAP-model-selection-04, CAP-model-selection-08

## S79.15

**Provider-route selection.** Among eligible routes for a model, one provider route is chosen by ranking (health, cost, cache).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F079-01 Auto picks the model](../../20-features/079-routing-and-model-neutral-orchestration/F079-01-auto-picks-the-model.md)

## S79.16

**Exact-model lock.** An explicitly chosen model is never silently swapped for another model.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F079-04 Pick a model yourself, and locks](../../20-features/079-routing-and-model-neutral-orchestration/F079-04-pick-a-model-yourself-and-locks.md)
- Competitor trace: CAP-model-selection-04, CAP-model-selection-15

## S79.17

**Provider lock.** The user can lock requests to one provider for the chosen model.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F079-04 Pick a model yourself, and locks](../../20-features/079-routing-and-model-neutral-orchestration/F079-04-pick-a-model-yourself-and-locks.md)
- Competitor trace: CAP-model-selection-28

## S79.18

**Route lock.** The user can lock requests to one specific provider route.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile missing, VS Code missing, Chrome missing
- Feature: [F079-04 Pick a model yourself, and locks](../../20-features/079-routing-and-model-neutral-orchestration/F079-04-pick-a-model-yourself-and-locks.md)
- Competitor trace: CAP-model-selection-28

## S79.19

**Quota-aware selection.** Routing takes the user's remaining budget into account when choosing a route.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F079-01 Auto picks the model](../../20-features/079-routing-and-model-neutral-orchestration/F079-01-auto-picks-the-model.md)

## S79.20

**Health-aware fallback.** Unhealthy routes are demoted and failed calls fall back to healthy alternatives.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F079-07 Health, fallback and switch offers](../../20-features/079-routing-and-model-neutral-orchestration/F079-07-health-fallback-and-switch-offers.md)
- Competitor trace: CAP-model-selection-15

## S79.21

**Explicit model-switch offer.** When another model would work better, the user is offered an explicit one-click switch.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F079-07 Health, fallback and switch offers](../../20-features/079-routing-and-model-neutral-orchestration/F079-07-health-fallback-and-switch-offers.md)
- Competitor trace: CAP-model-selection-16

## S79.22

**Advisor escalation.** A worker model can escalate to (consult) a stronger advisor model when needed.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F079-11 Not built](../../20-features/079-routing-and-model-neutral-orchestration/F079-11-not-built.md)
- Competitor trace: CAP-model-selection-25

## S79.23

**Specialist worker selection.** Work is delegated to specialist workers that can use their own models.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile missing, CLI done, Chrome missing
- Feature: [F079-10 Specialist workers with their own model](../../20-features/079-routing-and-model-neutral-orchestration/F079-10-specialist-workers-with-their-own-model.md)
- Competitor trace: CAP-model-selection-12, CAP-model-selection-27

## S79.24

**Multi-model comparison.** One prompt can be sent to several models and the answers compared.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F079-09 Compare models side by side](../../20-features/079-routing-and-model-neutral-orchestration/F079-09-compare-models-side-by-side.md)
- Competitor trace: CAP-model-selection-32

## S79.25

**Confidence-based abstention.** When routing or the answer is low-confidence, the system abstains or asks rather than guessing.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F079-11 Not built](../../20-features/079-routing-and-model-neutral-orchestration/F079-11-not-built.md)

## S79.26

**User-visible routing explanation.** The user can see why Auto chose (or moved to) a model.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome done
- Feature: [F079-08 Which model answered, and why](../../20-features/079-routing-and-model-neutral-orchestration/F079-08-which-model-answered-and-why.md)
- Competitor trace: CAP-model-selection-05

## S79.27

**Actual-model attribution.** Each answer shows which model actually produced it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome done
- Feature: [F079-08 Which model answered, and why](../../20-features/079-routing-and-model-neutral-orchestration/F079-08-which-model-answered-and-why.md)
- Competitor trace: CAP-model-selection-05

## S79.28

**Routing-policy versioning.** Routing policies are versioned and each decision can be traced to the policy version that made it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done
- Feature: [F079-08 Which model answered, and why](../../20-features/079-routing-and-model-neutral-orchestration/F079-08-which-model-answered-and-why.md)
- Competitor trace: CAP-model-selection-05

## S79.29

**Classification adapter, including Jev if chosen.** A pluggable classification adapter (e.g. Jev) can replace or augment the heuristic classifier.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F079-11 Not built](../../20-features/079-routing-and-model-neutral-orchestration/F079-11-not-built.md)

## S79.30

**Classification failure fallback.** When classification fails or is ambiguous, routing falls back to a safe default.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F079-03 Understanding the request](../../20-features/079-routing-and-model-neutral-orchestration/F079-03-understanding-the-request.md)
- Competitor trace: CAP-model-selection-04

## S79.31

**Routing evaluation dashboard.** Operators can see a dashboard evaluating routing decisions and outcomes.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F079-11 Not built](../../20-features/079-routing-and-model-neutral-orchestration/F079-11-not-built.md)
