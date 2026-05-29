# Model Single-Source-of-Truth — Migration Plan

Status: proposed (2026-05-29) · Branch: `hardening/execution-2026-05-28`
Basis: `MODEL_CATALOG_RESEARCH.md` (deep-research) + repo inspection.

## Verdict

The SSoT architecture you want **already exists and matches industry best practice**
(models.dev / LiteLLM hybrid: hand-curated static catalog canonical for pricing/context/
capabilities, layered over live discovery):

- `packages/types/src/models.json` is the canonical catalog.
- Rust CLI **embeds it** (`model_catalog.rs:32` `include_str!`) in a 4-tier cascade:
  bundled JSON → 5-min disk cache → `models.dev/api.json` fetch → user config. This _is_ the
  industry pattern.
- TS registry/indirection layer exists (`model-catalog.ts`: `modelsById`, `normalizeModelId`,
  `modelIdAliases`, `SLOT_REGISTRY`, `requireProviderDefaultModel`, `tierAllowedModels`).
- Guardrails exist: ESLint `no-restricted-syntax` (TS) + `scripts/check-no-hardcoded-models.sh`
  (Rust, in `ci.yml:78`).

So the work is **duplication cleanup + widening enforcement + curation**, NOT building the bridge.

## The real gaps (research-confirmed)

1. **`legacy_bundled_models()` (`model_catalog.rs:399`) is a drifting second catalog** — hardcodes
   IDs + pricing/context independent of `models.json` (e.g. `claude-opus-4-7` 200K/$15/$75 vs the
   canonical 1M/$5/$25). Header is stale. **This is the single most important fix.**
2. **CI lint is deliberately narrow** — only catches the `claude-opus-4-6-mini` ghost +
   `FAST_*/DEFAULT_*_MODEL` const literals; the ~64-file backlog was explicitly deferred.
3. **~86 files contain model-ID literals** — but triage shows these are overwhelmingly **tests,
   doc-comments, the registry/alias layer, and constants**, not production logic. The high-impact
   subset is **tests asserting specific IDs** (e.g. `config.rs` asserts `default == claude-opus-4-7`),
   which break whenever the catalog changes.

## Plan (each step verified + committed separately; green at every commit)

- **Step 1 — Collapse the duplicate (GAP 1).** Replace `legacy_bundled_models()`'s hand-maintained
  list with either (a) a `build.rs` codegen that emits it FROM `models.json` (zero-drift), or
  (b) a degenerate 1–2-entry fallback clearly marked "fallback-only; `models.json` is canonical."
  Recommend (b) first (simpler; `include_str!` already guarantees the real catalog is always present,
  so the legacy list is effectively dead) and a follow-up to (a) if a real offline list is wanted.
  Verify `cargo check -p agiworkforce-cli` + the `legacy_bundled_models` empty-guard test.
- **Step 2 — Curate `models.json` (your directives).** Add `claude-opus-4.8` (1M, $5/$25, verified)
  - `gpt-image-2` ($8/$30/$2 cached, verified); remove `claude-opus-4.7/4.6`, `claude-sonnet-4.5`,
    `dall-e-3`, `gpt-image-1/1.5`, `sora-2`; update `providers.anthropic.canonicalization` aliases
    (old IDs → kept models), `taskRouting`, `tierAllowedModels`, `modelPresets`. Targeted edits
    (preserve `1.0`-style formatting; no full reformat). Verify `@agiworkforce/types test` +
    `check:llm-operability` + `check:pricing`.
- **Step 3 — Make tests catalog-driven.** Replace literal assertions (`== "claude-opus-4-7"`) with
  reads from the catalog accessors / current default, so future curation never breaks tests.
- **Step 4 — Widen guardrails.** Extend `check-no-hardcoded-models.sh` + the ESLint rule to all
  provider model-ID patterns, allowlisting `models.json`, the registry layer, and tests.
- **Step 5 — Sweep residual literal files** (workflow, two reviewers/file) through the existing
  accessors, prioritizing production paths.

## Open product decisions (need your call — can't infer without inventing)

1. **OpenAI text scope:** you named keep `{gpt-5.5, gpt-5.4-mini, gpt-5.4-nano}` and asked what else
   exists ({`o3`, `gpt-5.4`, `gpt-5.4-pro`, `gpt-5.4-codex` + low/medium/high/xhigh}). Remove ALL of
   those, or keep any (e.g. a codex model for coding)?
2. **`gpt-5.4-nano` is flagged DEPRECATED** in the catalog. Keep it present-but-deprecated, or clear
   the flag (treat it as an active offering)?
