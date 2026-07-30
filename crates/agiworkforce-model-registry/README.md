# AGI Workforce Model Registry — Rust

Status: Current
Owner role: AI platform
Kind: generated-contract consumer

## Purpose

This crate is the typed Rust boundary for the canonical registry owned by
`packages/ai/model-registry`. Rust applications use it for model identity,
provider routes, runtime harness admission, trust-mode eligibility, and Auto
routing policy. It must not become a second catalog.

## Source ownership

- Edit model facts in `packages/ai/model-registry/catalog/models.curation.json`.
- Edit provider-synchronized facts in `packages/ai/model-registry/catalog/models.synced.json`.
- Edit routing or harness policy in the corresponding catalog files there.
- Do not edit `src/generated/model_registry.rs` or
  `src/generated/model_registry.json` by hand.

Run `pnpm sync:models` after catalog changes. CI runs
`pnpm sync:models:check` to reject generated drift.

## Consumer contract

Call `resolve_auto_route` with an explicit `TrustMode` and the harness IDs the
calling runtime can execute. The default trust mode is Local and therefore
fails closed. Managed Cloud, BYOK, Local, and On-device execution remain
separate transport boundaries owned by each application adapter.

## Verification

```bash
cargo test -p agiworkforce-model-registry
pnpm sync:models:check
```
