# Jev launch evaluation

Status: Discovery; product pilot not executed
Owner: Website launch preparation
Last updated: 2026-09-21

Canonical existing proposal: [Jev Auto routing](../jev-auto-routing/spec.md).
It is proposed architecture, not implemented product behavior. The developer helper
scripts/jev-decide.mjs is callable and separate from conversation generation.
This task retains explicit Luna selection and does not authorize a production routing change.

Current evidence: helper returned typed choices from synthetic task metadata using jev-1.13.0,
587 input and 122 output tokens. No end-to-end product latency, quality or cost benefit measured.
Current official choice documentation retrieved from https://docs.typesafe.ai/primitives/choice.md.
Full endpoint, limits, pricing, legal terms and rollout eligibility still require current verification.

The current official documentation and public implementation/review survey are
recorded in
[Jev and TypeSafe AI: public evidence and AGI Workforce fit](../../research/jev-typesafe-public-evidence-2026-09-21.md).
The evidence reinforces the existing boundary: evaluate bounded semantic choices,
scores and booleans; keep authorization, arithmetic, policy and execution in code.
Public browser and voice-browser builds inform the later Desktop voice phase but
do not qualify a full-desktop integration or change the website-first sequence.

Candidate work must compare existing behavior, deterministic improvement and advisory Jev,
with held-out minimized cases. No private history sent. Permissions, billing and execution remain
in deterministic code. Availability failures must preserve the existing authorized product path.
A mandatory developer decision failure pauses its affected choice under AGENTS.md; this is distinct
from optional product recommendations. No new product integration selected yet.

## Official documentation checked on 2026-09-19

[Models](https://docs.typesafe.ai/models) currently lists the same version returned by the helper.
Published input price is $0.042 per million tokens, output free; advertised limits are 250,000 tokens/sec
and 1,200 requests/minute, explicitly subject to change. Request budget is 64k total and 32k for
state plus longest question; text only. These are vendor terms, not measured application throughput.

[API](https://docs.typesafe.ai/api): POST https://api.typesafe.ai/v1/systemone; bearer auth; state and
named typed questions; keys are response identifiers and are not used in inference. Choice, Score
and Noul have different output shapes. Handle validation/auth failures and bounded backoff for
429/529. [Confidence](https://docs.typesafe.ai/confidence) is distribution concentration for
Choice/Score; Noul has no separate confidence field. No universal acceptance threshold adopted.

[Legal index](https://docs.typesafe.ai/legal) points to separate DPA, MCA and privacy policy and
offers enterprise ZDR. The index does not establish this account's retention terms or ZDR eligibility.
Private-history processing therefore remains ineligible pending actual terms/account verification.
[Jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13) warns about adversarial state,
indirection, long irrelevant context and arithmetic. Keep exact checks and security policy in code.

Second developer call: 666 input / 113 output tokens; selected landing keyboard repair (0.99) and
existing-main target (1.00). Total developer input 1,253 tokens; estimated list-price input cost
$0.000052626, not an invoice or measured product cost. No end-to-end product benchmark performed.
Existing product architecture proposal remains unchanged; this repair requires no remote runtime decision.

## Current pilot eligibility

Jev selected deferral with1.00 confidence (request72c06ca1b827a6684e25b63492a5e0a1d140b9432a4bfd64ca96cd9e8d753da7). Keep the existing Auto-routing proposal as canonical architecture, not a parallel router. Explicit Luna must bypass it. The measured catalog bottleneck was serial IO and received a deterministic correction; no observed classification failure justifies an extra model call. Before a product pilot: representative minimized/held-out cases, existing-versus-deterministic-versus-Jev downstream baseline, funded authorized generation route, verified account processing terms, and the existing proposal's cost/deadline/cancellation/feature-off gates. Developer-helper access is not product-route qualification; no product benefit or rollout is claimed.
