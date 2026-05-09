# ADR: Both-equal customer focus (consumer + builder)

## Status

Accepted — 2026-05-09.

## Context

The platform serves two audiences with different needs:

1. **Consumers** — end users who chat with models, attach files, run skills, review mobile dispatches. They expect polished UX, plan-tier-aware feature gates, fast first-token, and gentle defaults.
2. **Builders** — developers who run CLI workers in CI, register custom MCP servers, write skills, integrate via the worker SDK. They expect predictable APIs, clear auth ladders, observable telemetry, and stable wire shapes.

Most platforms choose one as primary and treat the other as secondary. ChatGPT is consumer-first with an API as accommodation. OpenAI's API is builder-first with chat as the demo. The temptation to pick one was real — a single audience simplifies prioritisation, marketing, and design.

## Decision

We treat consumer and builder as equal first-party audiences. Consequences propagate through architecture decisions:

- §7 `@agiworkforce/skills` ships **progressive-disclosure UX** for consumers (`SkillsMenu` lazy-loads bodies on click) **and** a structured catalog API at `/api/skills` for builders. Both consume the same shared package; neither is a second-class accommodation.
- §6 worker protocol's **four-tier auth ladder** is built for builders running fleets of workers; consumers pay zero cost (their desktop signs in via Tier 1 OAuth and never sees Tiers 2–4).
- The CLI, marketed at builders, exposes the same provider catalog (`models.json`) as the consumer surfaces; switching from a builder workflow into a consumer chat is one command.
- BYOK + Local-first pricing serves both: consumers can bring their own keys for free; builders can run hermetic workers with no Supabase dependency.

## Consequences

**Positive**

- Differentiator-2 (BYOK + Local LLM) holds for both audiences without bifurcating the product.
- Cross-surface session continuity (differentiator-3) is possible because builders and consumers share the same chat substrate.
- Marketing can speak to both audiences from the same product surface — a consumer landing page links to CLI install instructions, the CLI prints a "open this in the desktop app" deep link.
- Architecture stays singular: there is no "builder edition" with a different state model.

**Negative**

- Every feature decision must pass two readability tests: "does the consumer flow stay simple?" and "does the builder flow stay predictable?" Some decisions cost more design time as a result.
- Consumer-only features (e.g. mobile-only widgets) are still shipped, but they are positioned as surface-specific rather than audience-specific.
- Builder docs must exist alongside consumer marketing. We accept the documentation cost; `docs/architecture/foundation-2026.md` and ADRs are part of that.
- Pricing tiers must accommodate both: Hobby for consumers exploring beyond BYOK; future Pro+/Max for builders running fleets. Resisting "build a separate enterprise SKU" was a deliberate choice.

## References

- `docs/architecture/foundation-2026.md` §10 row 4.
- `MEMORY.md` Pricing Model section.
- Team config description.
