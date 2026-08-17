# Domain audit: Models + reasoning

Scope: `packages/contracts/types/src/models.json` (the canonical model
catalog), `packages/contracts/types/src/model-catalog.ts` (the typed
accessors), `packages/ai/model-registry` (curation/policy source + generated
catalog), `packages/ai/routing` (auto-routing/pricing/failover logic), the web
managed-chat request pipeline (`apps/web/app/api/llm/v1/chat/completions/**`),
the web model/effort picker (`ComposerFooter.tsx`, `model-store.ts`), and the
equivalent surfaces on Mobile and Desktop (Tauri). Benchmarked against the
model/intelligence pickers and reasoning-effort controls documented in
`shots-chatgpt-web-macos.md`, `shots-codex-vscode-ios.md`,
`shots-claude-desktop.md`, `shots-claude-web.md`, and the narrative research
docs.

## Summary

The model **registry** is the strongest single piece of engineering in this
audit pass. `packages/contracts/types/src/models.json` (2,324 lines) carries a
dated, sourced `verificationLog` for every price/capability fact, a real
task-type-aware auto-routing policy (`routing-policies.json`), tier-gated slot
allowlists, and a per-model `reasoning` contract (`supportedEfforts`,
`defaultEffort`, `canDisableThinking`, provider-specific request paths) that
the picker UI derives affordances from rather than hardcoding. The Web
composer (`ComposerFooter.tsx`) is catalog-driven end-to-end: capability
badges, tier/environment locking, "coming soon" rows, and effort chips are all
computed from `models.json`, and in-code comments (`AUDIT-FIX CMP-24/25/30`)
show this surface has already been through prior hardening passes for exactly
the kind of bug this audit looks for (stale state, string-matching instead of
catalog lookups, dead controls). Provider failover (`managed-failover.ts`) is
availability-class-aware, billing-safe, and rotates before the first byte
reaches the client. The account-level usage-limits view unifies four buckets
(session/weekly/flagship-weekly/period) across Web, Mobile, Desktop, and the
Chrome panel under one shared vocabulary — a more transparent design than
either benchmark's known "no visible counter" (ChatGPT) or "stopped
publishing exact numbers" (Claude) complaints.

The gaps cluster around three things: (1) **Desktop (Tauri) has a
reasoning-effort _type_ and _runtime pass-through_ but no UI control that
ever sets a non-default value** — the single largest, cleanest finding in this
pass; (2) several rich reasoning-metadata fields the registry schema defines
(`ultraMode`, `proMode`, `reasoningDots`) and a workspace/org model-policy
contract (`ProviderPolicy.allowedModels/blockedModels`) have **zero
consumers** anywhere in the request pipeline, UI, or admin console — schema
built ahead of product; (3) transparency gaps where the backend already knows
something (a fallback happened, a model was retired, context is filling up)
but never tells the user. None of these are P0 — the core chat pipeline works
correctly on every surface.

## What's already strong (do not rebuild)

| Capability                                                 | Where                                                                                                                                 | Evidence                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sourced, dated model catalog                               | `packages/contracts/types/src/models.json`                                                                                            | `verificationLog` entries cite official provider docs by URL and date for every price/capability change; POLICY vs CORRECTION vs PASS entries distinguish founder decisions from re-verified facts                                                                      |
| Catalog-driven effort chips (no hardcoding)                | `apps/web/features/chat/components/Composer/ComposerFooter.tsx:82-129`                                                                | `effortChipsFor`/`showsThinkingSwitch`/`chipToStoreEffort` all read `model.reasoning.*`; comment explicitly documents this replaced a prior version that showed effort marks a model didn't accept                                                                      |
| Capability badges from real metadata                       | `ComposerFooter.tsx:226-235`                                                                                                          | `modelCapabilityBadges` reads `capabilities.vision/thinking/search/tools` from the catalog                                                                                                                                                                              |
| Honest tier/env/coming-soon locking                        | `ComposerFooter.tsx:164-207`                                                                                                          | Single `modelLock()` function used by every call site (search, partition, "More models", reset effect) so no gating path can diverge from another                                                                                                                       |
| Deprecation-aware model picker                             | `apps/web/shared/stores/model-store.ts:82-99`                                                                                         | `isCurrentModel()` excludes `deprecated:true`, `status:'deprecated'`, and past-dated `deprecation_date` — comment states this is "claude.ai parity: only the latest models"                                                                                             |
| Task-aware auto-routing                                    | `packages/ai/model-registry/catalog/routing-policies.json` (`autoProfileByTask`), consumed at `packages/ai/routing/src/auto.ts:685`   | `simple_chat→economy`, `coding/reasoning/agentic/computer-use→premium`, plus tier-gated slot allowlists and a `usOnly` provider-exclusion policy — more transparent/structured than either benchmark's documented "auto" router                                         |
| Availability-aware, billing-safe failover                  | `apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.ts:1-60`                                                               | Rotates only on a fixed set of availability-class errors, only before the first streamed byte, only for Auto-profile requests (explicit selections are rotation-free by construction), and settles billing once across all attempts                                     |
| Resolved-model relabeling (anti "decorative selector" bug) | `apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts:663-671,1074-1082`, `apps/web/lib/hooks/useChatStream.ts:2222-2234` | `X-AGI-Resolved-Model` header + client-side relabel was added specifically because Auto-routed/fallback turns showed "Unavailable model" under every reply — the exact "decorative model selector" complaint documented against ChatGPT in `chatgpt-web-desktop.md:343` |
| Unified 4-bucket usage transparency                        | `apps/web/features/settings/sections/UsageSection.tsx:222-259`                                                                        | Session, weekly, flagship-weekly, and period meters, shared label/reset vocabulary across Web/Mobile/Desktop/Chrome (`managedUsageBucketLabel`, `formatUsageResetIn` in `@agiworkforce/types`)                                                                          |
| On-device local inference (Mobile)                         | `apps/mobile/src/features/model-picker/localModelRuntime.ts` (per inventory)                                                          | Apple Foundation Models / Android AICore local runtime, not offered by either ChatGPT or Claude's official mobile apps — a genuine differentiator                                                                                                                       |

## Verified gaps

| ID         | Sev | Surface                             | Gap                                                                                                                                 | Benchmark                                                                            |
| ---------- | --- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| MODELS-001 | P1  | desktop-tauri                       | Desktop chat composer has zero reasoning-effort/thinking UI control despite full type + runtime plumbing                            | Claude Desktop / ChatGPT macOS effort dropdowns                                      |
| MODELS-002 | P1  | cross-surface (backend + web admin) | No workspace/org-level model access policy or default reasoning level, though the contract types exist unconsumed                   | ChatGPT Business/Enterprise "starting chat model and reasoning level"                |
| MODELS-003 | P2  | web                                 | No context-window usage visibility anywhere in the Web chat surface                                                                 | Codex "Show context window usage"; Mobile's own `ContextWarningChip`                 |
| MODELS-004 | P2  | web                                 | Provider-outage / credit-driven model fallback reason is computed server-side but never shown to the user                           | General transparency bar set by both benchmarks' (imperfect) model-switch disclosure |
| MODELS-005 | P2  | shared (schema) + web               | Ultra/Pro parallel-agent reasoning modes and `reasoningDots` are fully specified in the registry schema with zero product consumers | ChatGPT "Enable Ultra effort" / Pro Standard-Extended; Codex Ultra tier              |
| MODELS-006 | P2  | web                                 | Opening a conversation whose persisted model has been retired silently substitutes the default model with no notice                 | Cross-cutting complaint theme: don't silently swap deprecated capabilities           |
| MODELS-007 | P3  | desktop-tauri                       | `local-llm` (embedded llama.cpp) Cargo feature compiles but has zero call sites and ships in no release build                       | N/A — dead-code hygiene, not a broken user promise                                   |

Full detail for each row is in `domain-models.json`.

## What NOT to copy from the benchmark

- **Do not adopt ChatGPT's "decorative model selector."** Multiple documented
  complaints (`chatgpt-web-desktop.md:343`) describe users seeing one model
  selected while a different one visibly answered. agiworkforce already
  solved this correctly (`X-AGI-Resolved-Model` + client relabel) — MODELS-004
  asks for _more_ of this pattern (surface _why_ it changed), not less.
- **Do not adopt Claude's "no message-count transparency" retreat.**
  `cross-cutting-and-complaints.md` documents Anthropic deliberately stopped
  publishing exact message counts in Help Center articles. agiworkforce's
  four-bucket `UsageSection.tsx` is already more transparent than either
  competitor's current public behavior; keep it that way rather than
  "simplifying" it into an opaque single bar.
- **Do not blindly copy the ChatGPT web "Enable Ultra effort" toggle's
  framing as a single on/off switch.** The registry's `ultraMode` contract
  already models this as a structured per-model capability
  (`param`/`concurrencyParam`/`beta`/`endpoint`) rather than a single global
  flag — when this ships (MODELS-005), keep it model-scoped and
  catalog-driven the way the rest of the effort UI already is, rather than
  adding a second, parallel boolean preference the way ChatGPT's web General
  settings does.
- **Do not clone Codex's three-widget inconsistency for one concept**
  (dropdown-list on macOS, toggle+separate-toggle on web General, raw
  unlabeled slider in the browser extension — flagged explicitly in
  `shots-chatgpt-web-macos.md` §4.4 as a real inconsistency). If Desktop gains
  an effort control (MODELS-001), reuse the exact chip/slider component
  `ComposerFooter.tsx` already built rather than inventing a fourth widget.

## Notes on prior-art overlap

The following already-tracked rows in `audit/ui-gaps.csv` cover adjacent
territory in this domain and were deliberately **not** re-filed:
GAP-142/154/172/179/184/300 (mobile effort/model-picker UX and copy),
GAP-196/206/212/217/225/228/244/245 (desktop macOS-shots-sourced picker
structure and copy — these describe _restructuring_ the existing Web effort
UI, not Desktop's _absence_ of one, which is MODELS-001),
GAP-276 (Web account-level auto-escalation/Ultra-effort _default_, distinct
from MODELS-002's _workspace/org-level_ policy),
GAP-281/285/291/292/295/298 (Chrome extension and VS Code extension composer
controls). `done-claim-verification.md` was checked and none of its 9
regressed rows touch this domain.
