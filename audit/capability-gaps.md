# Capability comparison backlog

Status: Active

This is the implementation intake from the 2026-07-30 platform capability
comparison. `audit/capability-gaps.csv` is the source of truth. It complements
the 654-item integration inventory and the UI/UX tracker; it does not replace
either one.

## Reconciliation result

The source audit checked 131 concepts:

- 59 implemented
- 57 partial
- 3 planned only
- 12 absent
- 34 marked built but not fully wired

The actionable intake was the 34 built-not-wired records plus the 15
absent/planned records. Reconciliation produced 44 backlog rows:

- `CMEK` and `EnterpriseKeyManagement` are one encryption-key program.
- `PluginPolicies`, `PluginPolicy`, and `PluginFilters` are one governance
  contract rather than three products.
- `ResidencyPolicy` and `EUInference` are one residency program.
- `ProgressTimeline` was excluded because the audit's own delta says there is
  no material missing behavior on the live path.
- Features graded implemented but incomplete on another supported surface
  remain tracked until that surface is wired or deliberately removed.

Current disposition:

| Status      | Count |
| ----------- | ----: |
| Open        |    26 |
| Deferred    |    15 |
| Not Planned |     3 |

`Wire or cut` is intentional. Existing unreachable implementations do not gain
priority merely because they exist; they must either receive a real production
path or be removed with the decision recorded in
`docs/adr/wire-or-cut.md`.

## Reference-image evidence

Use the three local reference libraries when a capability row becomes UI work:

- `/Users/siddhartha/Desktop/references-2/` — 50 images
- `/Users/siddhartha/Desktop/claude_reference/` — 86 images
- `/Users/siddhartha/Desktop/chatgpt_reference/` — 151 images plus the reference
  guide

Together they contain 287 images. The UI tracker directly cites 220 distinct
filenames; the remaining frames are mainly alternate states in flows already
tracked. Examples include the later Claude code-onboarding images mapping to
GAP-010, the scheduled-task empty state mapping to GAP-264, and the unnamed
Codex Remote captures mapping to the existing remote-control gap family.

An unreferenced screenshot is not automatically a new requirement. The
ChatGPT Health sequence remains comparison evidence only: AGI Workforce has no
health-assistant strategy and must not enter regulated health-data scope for
visual parity. Likewise CarPlay and first-party inference kernels are explicit
product divergences. Reference behavior can inform interaction design without
creating a new product vertical.

## Intake rules

1. Revalidate source-audit evidence against the current branch before work
   begins; the imported audit predates ongoing remediation.
2. Prefer Phase 1 `Wire or cut` rows while existing code is unreachable.
3. Treat Phase 2 rows as production-correctness work: durability, policy
   enforcement, scale, and safe routing.
4. Phase 3 rows require the enterprise identity and organization-tenancy
   program; configuration-only schema is not proof of a working capability.
5. `Product decision` and `Product divergence` rows do not authorize new
   feature implementation.
6. A row is done only when UI, runtime, persistence, policy boundary, and tests
   agree on the same capability claim.
