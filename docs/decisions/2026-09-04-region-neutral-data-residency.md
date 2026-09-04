# Stay US-Only Today on a Region-Neutral Architecture

Status: Accepted

Date: 2026-09-04

Owners: Founder, platform/architecture, Enterprise

## Context

Launch decision D8 (`docs/decisions/README.md` records the framework this ADR
implements, per the founder's 2026-09-04 launch decision log): AGI goes to
market US first. Both reference leaders offer more than a single region today.
Verified live on 2026-09-04: OpenAI's feature matrix at chatgpt.com/pricing
lists data residency in the US, EU, UK, JP, CA, KR, SG, IN, AU, and UAE, ten
regions in total. Anthropic's claude.com/enterprise page states a US-only
inference option and names no other region. AGI has zero signed customers with
a residency requirement today, one Neon Postgres project, and no code path
that reads or writes a region for an organization.

Building multi-region infrastructure ahead of a customer who needs it would be
exactly the unused abstraction `AGENTS.md` §9 forbids: a schema column no
query reads, a routing branch no request takes, carried forward as maintenance
weight against a requirement that may never arrive in the shape guessed at
today.

## Decision

1. **US-only today.** Every AGI-managed Neon Postgres project and every
   managed-inference route runs in the United States. No public page may
   claim a residency option AGI does not offer;
   `apps/web/app/enterprise/__tests__/enterprise-claims.test.ts` already
   fails the build on the words "residency" or "custom regions" appearing on
   `/enterprise` and this ADR does not reopen that.
2. **One deployment region per Neon project.** A Neon project is not
   internally multi-region for application data. When a second region is
   provisioned, it is a second Neon project, not a region flag on the
   existing one.
3. **The organization's home region is recorded on the organization row
   only once a second region exists.** Do not add a `region` column, an
   enum, or any region-selection UI before there is a second region to
   select. The column lands in the same change that provisions the second
   Neon project, not speculatively ahead of it.
4. **No code path may assume a region.** Connection strings, migration
   tooling, cron scheduling, and any provider routing config must read the
   deployment's configured region rather than hardcoding one. This is a
   statement of the current state as verified for this ADR (no `region`
   literal exists in `apps/web/db/neon/*.sql` for organization or
   connection-scoped tables) as much as a forward constraint.
5. **Inference pinning, when a regional provider endpoint exists, rides the
   existing zero-data-retention provider override plumbing** in
   `apps/web/lib/services/zero-data-retention-provider-overrides.ts` rather
   than a new mechanism. That module already resolves, per provider, whether
   a stricter data-handling agreement is in effect from an env-gated flag; a
   regional inference requirement is the same shape of problem (route this
   provider's calls through a different, narrower endpoint) and gets the same
   kind of override rather than a parallel routing layer.
6. **A second region is added only for a signed customer**, never
   speculatively. The trigger is a signature, not a sales conversation or a
   roadmap slot.
7. **The EU Article 27 representative is a founder purchase**, not an
   engineering task and not automated. It is made when the first EU-domiciled
   customer with an Article 27 requirement is at or near signature. Until it
   is purchased, `apps/web/app/legal/eu-representative/page.tsx` continues to
   state plainly that no representative is appointed. The purchase step is
   recorded as a founder action in `docs/runbooks/enterprise-billing.md`.

## Consequences

- Public copy, contracts, and the order form template state US-only hosting
  today and never imply a residency option that does not exist.
- The second-region trigger is unambiguous: a signed customer, not
  anticipated demand. Engineering does not build region infrastructure
  against a forecast.
- When a second region is eventually provisioned, the organization schema
  change and the region-aware code paths land together, in the change that
  needs them, not before.
- Regional inference pinning has a designated extension point
  (`zero-data-retention-provider-overrides.ts`) so a future implementer does
  not have to choose between bolting a second routing layer onto the
  provider stack or reopening this decision.
- The EU representative purchase is tracked operationally, not left to be
  rediscovered when an EU deal is already at signature.
