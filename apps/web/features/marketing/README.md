# apps/web/features/marketing

Status: Current
Owner role: Web lead
Last updated: 2026-07-17
Purpose: Marketing-site presentation components (device mockups, landing/pricing
visuals) shared by the public marketing pages.

## Rules

- Presentation-only: no product state, provider calls, or auth logic here.
- Pricing copy must reflect the billing catalog in `@agiworkforce/types`
  (billing-catalog.ts); do not hardcode divergent tier names or prices.
- Product routes must not import from this feature; marketing pages only.
