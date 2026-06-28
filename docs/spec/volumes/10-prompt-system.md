# Volume 10 — Prompt System

Status: Canonical (expands `docs/spec/AGI_CODE_MASTER_SPEC.md` Vol 10)
Authority: this manual, `docs/strategy/15-structure-and-granularity-conventions.md` (co-location), `docs/strategy/09-reference-codebases.md` §1.1 (prompt-cache discipline), Vol 18 (tools), Vol 38 (contracts/constants).

## Philosophy & Cloud/Local stance

Prompts are code, not strings. A system prompt, a tool's instruction block, an agent's persona, a project's custom instructions, and a user template are all _versioned, testable assets_ that assemble deterministically into the message the model sees. The two non-negotiable properties are **determinism** (same inputs → byte-identical assembled prompt) and **cache stability** (the API-bound prompt object is never mutated after assembly, because providers bill on prompt-cache hits and a mutated prefix silently breaks caching — this is literally money, per `docs/strategy/09` §1.1).

Cloud/Local changes _which prompt fragments are allowed in, and which model the prompt is shaped for_, never the assembly discipline. A Local thread assembles only Local-permitted context (Vol 11) and shapes the prompt for the local model's capabilities (no thinking blocks if unsupported). BYOK/Managed prompts may include cross-boundary context only after an explicit fork. Provider-specific prompt shaping (Anthropic system blocks + beta headers vs. OpenAI system role) is encoded per provider, never branched ad hoc in feature code.

## Binding rules

1. **Tool/agent prompts are co-located.** Every tool or agent owns a `prompt.ts` / `prompt.rs` next to its implementation (folder-per-feature, Vol 2 / `docs/strategy/15`). No prompt lives in a shared "prompts bucket" detached from its owner.
2. **Never mutate the API-bound prompt object.** Assemble once; if an observer/logger/classifier needs a variant, mutate a _clone_ (backfill-on-clone). The original stays byte-stable for prompt caching.
3. **Assembly is deterministic.** Given the same system + project + user + tool + context inputs, the assembled prompt is byte-identical. No nondeterministic ordering, timestamps, or map iteration in the prefix.
4. **Version every prompt asset.** System/agent/template prompts carry a version; changes are reviewable and rollback-able. A prompt change is a code change, gated by the same checks.
5. **No inline magic strings.** Reusable prompt text lives in the asset, not scattered string literals in handlers (Vol 38/constants).
6. **Model ids come from the catalog.** Prompts that name or shape for a model read its id/capabilities from `packages/types/src/models.json`; never hardcode.
7. **Variables are typed and validated.** Template variables have a declared schema; substitution validates inputs (Zod/serde) before assembly — no unvalidated interpolation (Vol 38).
8. **Trust-scoped fragments only.** The assembler injects only fragments the active trust boundary permits; a Local project's instructions never enter a BYOK/Managed prompt without a reviewed fork.
9. **Stable prefix, volatile suffix.** Order fragments so the cacheable, rarely-changing prefix (system + tool specs) precedes volatile content (retrieved context, latest user turn) to maximize cache reuse.
10. **Provider shape is encoded centrally.** System-block placement, beta headers, and role mapping live in the provider abstraction (Vol 7), not duplicated per feature.

## Repository map

- Co-located agent prompt (Rust reference): `apps/cli/src/agent/prompt.rs`.
- Tool prompts: co-located in each tool folder under `apps/cli/src/features/exec/tools/*` (CLI) and desktop tool executors (`apps/desktop/src/features/*`).
- Shared contracts + constants for prompt schemas/variables: `packages/types/src/` (Vol 38).
- Model catalog for prompt model-shaping: `packages/types/src/models.json`, `packages/types/src/model-catalog.ts`.
- Provider prompt shaping: `packages/providers/` (auth shapes, system-block placement; see `docs/strategy/10-oss-corpus-port-plan.md` §2 RLLM/Portkey patterns).
- Chat assembly entry: `packages/unified-chat/src/lib/` + `apps/web/features/chat/lib/`, `apps/web/features/chat/services/`.
- Trust labels referenced by prompt-side UX: `packages/types/src/suite-contracts.ts`.

## Competitor notes

Per `docs/strategy/01` / `02`: incumbents do not expose their prompt internals, but `claude-code` (study-only) shows the discipline AGI must match — a stable, cache-safe prompt prefix with backfill-on-clone for observers, and per-tool prompt ownership rather than a monolith. Claude/ChatGPT projects ship project-level custom instructions; AGI matches that capability (Vol 13) but keeps each instruction set trust-scoped. The differentiator is not a flashier prompt UI — it is that AGI's prompt assembly is deterministic, versioned, and trust-aware across 15 providers, so the same project/agent behaves consistently whether it runs Local, BYOK, or Managed. Adapt the _intent_ from references; never copy proprietary prompt text.

## Checklists

### Build — assembly & caching

- [ ] Assemble system + project + user + tool + context fragments through one deterministic builder.
- [ ] Order fragments stable-prefix-first (system/tool specs) → volatile-suffix-last (retrieved context, latest turn).
- [ ] Build the API-bound prompt object once; pass clones to loggers/classifiers/observers (backfill-on-clone).
- [ ] Add a test asserting two assemblies of identical inputs are byte-identical.
- [ ] Add a test asserting the API-bound object is unchanged after observers run (cache-stability guard).

### Build — assets, variables, versioning

- [ ] Each tool/agent has a co-located `prompt.ts`/`prompt.rs`; none in a detached bucket.
- [ ] Every prompt asset carries a version; changes are reviewable/rollback-able.
- [ ] Template variables have a declared schema; substitution validates inputs before assembly.
- [ ] No inline magic prompt strings in handlers (lint/grep for literals over a length threshold).
- [ ] Model-shaping reads ids/capabilities from `models.json`; no hardcoded model ids.
- [ ] Provide a prompt/template library with create/edit/version/share, trust-scoped per author.

### Review & trust

- [ ] Assembler injects only fragments the active trust boundary permits; Local fragments never enter BYOK/Managed prompts without a fork.
- [ ] Provider-specific shaping (system block, beta headers, role mapping) lives in the provider abstraction, not feature code.
- [ ] Thinking/effort fragments included only when the catalog says the model supports them.
- [ ] Import-from-other-provider prompt/workflow (Privacy P0) normalizes into AGI's template schema and is trust-labeled.

### Security

- [ ] Untrusted external content (web/email/memory/page) is wrapped as guarded _data_, never injected as instructions (Vol 30; `odysseus` O5 pattern).
- [ ] Secrets/credentials never embedded in assembled prompts; secret scan runs at the Local→BYOK fork.
- [ ] Template inputs sanitized to prevent prompt-injection via variable values.

## Definition of Done

Prompt assembly is deterministic and cache-stable: identical inputs produce a byte-identical API-bound object, and that object is never mutated by observers (clone instead). Tool/agent prompts are co-located; prompt assets are versioned with typed, validated variables and no inline magic strings. Model-shaping reads from `models.json`; provider shaping lives in the provider abstraction. Trust-scoped assembly is enforced and tested — Local fragments never reach BYOK/Managed prompts without a fork. `check:structure-conventions` (co-location), targeted assembly/cache tests, and trust-boundary tests pass.

## Anti-patterns

- Mutating the API-bound prompt after assembly (breaks prompt caching, costs cache-miss money).
- Prompts stored as scattered string literals or in a shared bucket detached from their owner.
- Nondeterministic prefix ordering (map iteration, timestamps) that defeats caching.
- Hardcoding model ids or branching provider prompt shape inside feature code.
- Interpolating unvalidated template variables or untrusted external content as instructions.
- Including thinking/effort directives for models the catalog says don't support them.
