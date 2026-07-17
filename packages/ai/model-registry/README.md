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

Add or update model facts in `catalog/models.curation.json`. Use overrides only when official/provider evidence supersedes the synchronized snapshot. Change `catalog/harnesses.json` only when a provider route or verified implementation status changes. Change `catalog/routing-policies.json` only when Auto requirements or slot assignments change. A normal model release must touch no more than these three inputs. Run `generate`, inspect every generated diff, and run schema, catalog, availability, TypeScript, and Rust checks. Never hand-edit generated output.

## Security, Privacy, And Trust Boundaries

Registry availability does not authorize routing. Local, BYOK, and Managed Cloud eligibility belongs to route and policy data and must remain explicit. A documented provider feature must not be advertised as an application capability until the corresponding route and harness are implemented and verified.

## Tests Required For Changes

Registry changes require deterministic generation, schema/admission validation, generated-artifact drift checks, provider contract tests when request behavior changes, and Rust/TypeScript consumer checks.

## Release Notes

Catalog changes can alter picker visibility, routing, billing, and provider payloads across all applications. Treat them as platform releases and preserve generated compatibility until every consumer imports the registry directly.

## CODEOWNERS

Primary: Provider/platform owner. Secondary: security/privacy and billing owners for capability, retention, and pricing changes.
