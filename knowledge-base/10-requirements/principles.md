---
id: 'REQ-principles'
type: 'requirements'
title: 'Product principles'
basis: 'established: stated by the owner on 2026-11-24'
last_reviewed: '2026-11-24'
---

# Product principles

Five established requirements that apply to every feature. They were stated by the owner on 2026-11-24. Each feature page says how they affect that feature (section 7, Access and usage rules, and section 6, Execution and data flow). The pages that describe how the code meets each principle today are linked; read those for evidence.

AGI Workforce competes directly with Claude by Anthropic and ChatGPT by OpenAI across the whole assistant experience on all supported apps.

## PR-1 Model agnostic

**Requirement.** Users can use different supported models through one consistent product experience.

- A feature must not depend on one named model. Where a model lacks an ability, the product says so and offers the next step.
- Model identifiers live only in the generated model catalog; feature code refers to catalog entries.

How the code does it today: [SYS-model-catalog-and-routing](../40-systems/model-catalog-and-routing.md).

## PR-2 Provider agnostic

**Requirement.** The architecture supports several inference providers without needless coupling of the product to one of them.

- Provider-specific behaviour stays behind the provider layer.
- Losing one provider must degrade the product, not stop it.

How the code does it today: [SYS-inference-providers](../40-systems/inference-providers.md).

## PR-3 One AGI Subscription

**Requirement.** Subscription-based capabilities on every app connect to one AGI Subscription system: entitlements, access rules, usage accounting, quotas and limits.

- An app asks the same system whether a user may use a capability; no app keeps its own plan rules.
- Usage is counted once, in one place, whichever app caused it.

How the code does it today: [SYS-subscriptions-entitlements-and-usage](../40-systems/subscriptions-entitlements-and-usage.md).

## PR-4 Free local inference

**Requirement.** Users can run supported local inference on mobile and desktop without a paid AGI Subscription.

- Payment and sign-in are separate questions. Whether an account or sign-in is needed for Local mode is documented from the code, apart from the fact that no payment is needed.

How the code does it today: [SYS-local-inference](../40-systems/local-inference.md).

**Open conflict.** The public Desktop app has no Local chat today: it refuses every local-model command, by the owner's earlier decision of 2026-09-15. Local models reach Desktop only through AGI Code. Whether this principle changes that decision, or means AGI Code only, is not decided. See [open product choices](open-product-choices.md).

## PR-5 Clear execution boundaries

**Requirement.** For every capability it is explicit what runs entirely on the device, what needs our servers or outside services, and how subscription rules apply to each of those operations.

- A capability used alongside a local model is not assumed to be free. If it calls our servers or an outside service, the subscription rule for that operation applies and is documented.
- Nothing moves a Local chat or file to a provider without the user's explicit choice and a visible label.

How the code does it today: [SYS-execution-boundaries](../40-systems/execution-boundaries.md).

## How the principles are used on other pages

| Where                   | What it records                                                                                           |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| Feature page, section 6 | For each step, whether it runs on the device, our servers or an outside service                           |
| Feature page, section 7 | Account, subscription, limits, model compatibility, provider restrictions, and what happens in Local mode |
| Competitor trace        | How each requirement must work with different models and providers and under the one subscription         |
| Gap register            | Places where the code breaks a principle                                                                  |

## Related

- Every other established requirement and owner decision, with its source: [established-requirements.md](established-requirements.md).
- Requirement items by product area: [capability-index.md](capability-index.md).
- The owner's rules for testing and for what is never done without him: [../70-qa/start-here/rules.md](../70-qa/start-here/rules.md).
