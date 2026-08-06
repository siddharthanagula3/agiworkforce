# @agiworkforce/model-registry

Status: Current
Owner role: Provider/platform owner
Last updated: 2026-07-14
Kind: data-and-codegen-package
Criticality: critical

## Purpose

Canonical owner of model identity, provider routes, intrinsic capabilities, harness capabilities, pricing, limits, lifecycle, availability, routing policy, evidence, and generated cross-language registry artifacts.

## Consumers

The compiler emits a schema-validated normalized registry for TypeScript and Rust plus `packages/contracts/types/src/models.json` for legacy consumers. New consumers should import `@agiworkforce/model-registry`; compatibility consumers must migrate incrementally and must never read catalog inputs directly.

## Public Interface

- `catalog/models.curation.json` — curated model/provider identity and evidence-backed overrides.
- `catalog/models.synced.json` — upstream-derived snapshot; update through `refresh`.
- `catalog/harnesses.json` — provider API-family, adapter, trust-mode, and harness-feature truth.
- `catalog/routing-policies.json` — Auto aliases, profiles, task requirements, and model slots.
- `schema/registry.schema.json` — canonical normalized registry contract.
- `generated/registry.ts` and `generated/registry.json` — TypeScript exports.
- `crates/agiworkforce-protocol/src/generated/model_registry.{rs,json}` — Rust exports.
- `scripts/compile.mjs` — validates sources and compiles normalized plus compatibility outputs.
- `packages/contracts/types/src/models.json` — generated compatibility output; never edit directly.

## What Belongs Here

- Model identity and lifecycle.
- Provider route identifiers and availability evidence.
- Pricing, cache pricing, token limits, benchmarks, and capability metadata.
- Provider/harness feature support separated from verified AGI implementation status.
- Auto-routing requirements and slot assignments that reference canonical model keys.
- Registry validation and TypeScript/Rust code generation.

## What Does Not Belong Here

- Billing entitlements, quota settlement, or product pricing decisions.
- Provider SDK clients and request translation.
- Application model-picker components.
- Local runtime discovery results.

## Commands

- `pnpm --filter @agiworkforce/model-registry generate`
- `pnpm --filter @agiworkforce/model-registry check`
- `pnpm --filter @agiworkforce/model-registry refresh`
- `pnpm --filter @agiworkforce/model-registry test`
- `pnpm --filter @agiworkforce/model-registry typecheck`
- Compatibility aliases: `pnpm sync:models`, `pnpm sync:models:check`, `pnpm sync:models:refresh`

## Change Contract

For a normal release on an existing provider, hand-edit only `catalog/models.curation.json`: add the model record and place its key in the intended tier. `catalog/models.synced.json` is refreshed by automation and is never hand-edited. Change `catalog/harnesses.json` only for a new provider API path or verified implementation status; change `catalog/routing-policies.json` only when Auto requirements or slot assignments change. Run `generate`, inspect every generated diff, and run schema, catalog, availability, TypeScript, and Rust checks. Never hand-edit generated output.

### Announced Price Changes

When a PRODUCT price is scheduled to start or end on a date, add a `pricingSchedule` array to the model's curation record instead of overwriting its cost fields. Each entry is a dated `costOverride` — `effectiveFrom` and/or `effectiveUntil` (ISO `YYYY-MM-DD`) plus any of `inputCost`, `outputCost`, `cached_input`, `cached_write`, `cached_write_1h`, and a `note` recording the source and verification date. `effectiveFrom` and `effectiveUntil` are UTC calendar days and both bounds are inclusive, so a changeover happens at UTC midnight (a window ending `2026-08-31` covers all of that UTC day and the next window starts `2026-09-01`). Windows must not overlap — the compiler rejects intersecting ranges, because the first covering window wins and an overlap would make the billed price depend on authoring order. Keep the top-level cost fields on the enduring/standard price so a consumer that is not date-aware still reads a published rate; consumers resolve a window through `resolveEffectiveModelPricing` (`@agiworkforce/types`) or `ModelEntry::effective_pricing` (Rust). The older `promo_expires_at`/`post_promo_prices` pair remains supported for two-phase promotions.

A provider's introductory or promotional window is a PROVIDER-COST fact, not a product price (founder Decision #22, reaffirmed 2026-08-05): record it in `verificationLog` and leave the model's billed rates alone. Only a founder-decided change to what AGI charges belongs in `pricingSchedule`.

### Cache-Write Prices And Openness Metadata

`cached_write` is a published price, not a derived one: declare it only when the provider charges for prompt-cache writes. Cost calculators bill a write at the declared price and otherwise at the plain input rate, so adding a speculative `cached_write` silently starts charging a surcharge that the provider does not levy. `openWeight`, `license`, and `commercialRestrictions` on a model record are optional and verification-gated — an absent field means "not verified", never "closed" or "unrestricted".

## Security, Privacy, And Trust Boundaries

Registry availability does not authorize routing. Local, BYOK, and Managed Cloud eligibility belongs to route and policy data and must remain explicit. A documented provider feature must not be advertised as an application capability until the corresponding route and harness are implemented and verified.

## Tests Required For Changes

Registry changes require deterministic generation, schema/admission validation, generated-artifact drift checks, provider contract tests when request behavior changes, and Rust/TypeScript consumer checks.

## Release Notes

Catalog changes can alter picker visibility, routing, billing, and provider payloads across all applications. Treat them as platform releases and preserve generated compatibility until every consumer imports the registry directly.

## CODEOWNERS

Primary: Provider/platform owner. Secondary: security/privacy and billing owners for capability, retention, and pricing changes.
