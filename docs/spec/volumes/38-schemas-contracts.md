# Volume 38 — Schemas & Contracts

Status: Canonical · domain volume (depth of Master Spec Vol 38)
Authority: `packages/types/` (shared contracts), `packages/types/src/models.json` (model catalog), `packages/types/src/suite-contracts.ts` (trust/privacy contracts), this manual. Generated types live under `*/generated/` (Vol 2, `docs/strategy/15`).

## Philosophy & Cloud/Local stance

A contract is the only thing two surfaces, two languages, or a client and a service can agree on without reading each other's code. AGI is a pnpm + cargo monorepo with six TS/Rust surfaces over shared `packages/`/`crates/` and a `services/` backend — so **shared contracts are the load-bearing seam of the whole product**. Define a wire/persistent shape once in `packages/types`, generate language bindings, and never re-declare it per surface (that is the surface-drift debt of Vol 35).

Cloud/Local stance is encoded _in the contracts themselves_. Trust mode, privacy mode, provider label, source surface, and storage scope are not UI strings — they are fields on the canonical types (`suite-contracts.ts`) that every message, attachment, artifact, and request carries. Local context never serializes into a BYOK/Managed request because the contract that crosses the boundary is a different, redacted shape with a recorded redaction hash (Vol 3/9/11). The contract is where the trust boundary is _expressed_; the validators are where it is _enforced_.

## Binding rules

1. **Shared contracts live in `packages/types`.** Wire and persistent shapes are declared once there; surfaces and services import them. No duplicate per-surface re-declaration of a shared contract.
2. **The model catalog is `models.json`, period.** All model IDs, capabilities, pricing, and provider metadata read from `packages/types/src/models.json` / `model-catalog.ts`. Never invent, guess, or hardcode a model ID (Operating Law 2). Current verified IDs include `claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5`, `gpt-5.5`, `gemini-3.5-flash`, and the DeepSeek line — but always read them from the catalog rather than copying any literal, including these.
3. **Generated types stay under `*/generated/`.** Generated bindings (TS types, serde structs, OpenAPI/JSON-schema output) are isolated in `generated/` dirs, never hand-edited, and regenerated from the source contract.
4. **Validate every external input.** Every tool input, LLM/tool output, API request/response, and IPC payload is validated at the boundary — **Zod** in TS, **serde** (with explicit deserialization + bounds) in Rust. No unvalidated external input reaches business logic (Operating Law from CLAUDE.md; `docs/agent-context/llm-failure-taxonomy.json`).
5. **Trust/privacy fields are mandatory on boundary-crossing types.** Messages carry provider + privacy labels; attachments carry privacy mode + source surface + size/type + scan status + storage scope; boundary crossings carry a redaction hash (Vol 9/15). A contract missing these may not cross a trust boundary.
6. **Contracts are versioned and additive.** Change a wire/persistent shape additively where possible; version it otherwise; never silently repurpose a field. Constants/enums replace inline magic strings (Vol 10).

## Repository map / authority docs

- Shared TS contracts: `packages/types/src/` — `suite-contracts.ts` (trust/privacy/sync), `models.json` + `model-catalog.ts` (model catalog), plus typed request/response/event contracts consumed across surfaces.
- Generated bindings: `*/generated/` under the relevant package/app/crate.
- Persistence schemas: canonical migrations in `apps/web/db/neon` (RLS-scoped — Vol 25/30); local stores (SQLite/MMKV/IndexedDB) mirror the same logical shapes.
- Provider wire shapes: `packages/providers` (per-provider auth/SSE/error contracts; Vol 7).
- Enforcement: `pnpm check:boundaries`, `check:llm-failures` (catches unvalidated input/swallowed assertions), `check:agent-context`, provider-contract tests (INC-0.4 in `strategy/11`).

## Competitor notes

Both incumbents run a **single source-of-truth model registry read by every surface** and pin snapshot IDs with deprecation calendars (`strategy/01` §4) — AGI's `models.json` is the direct analog and must stay the only catalog. OpenAI's **Responses API** is a stateful contract that doubles as the agent runtime (`strategy/01` §3.2); AGI's equivalent is the typed agent/tool/stream contracts in `packages/types` consumed by the shared runtime (Vol 6/17). A real cost gotcha to encode honestly: tokenizer changes (e.g., Opus 4.7+ consuming ~35% more tokens for the same text) mean token-count and pricing must come from catalog metadata, never a hardcoded assumption.

## Checklists

### Defining or changing a contract

- [ ] Place the shared type in `packages/types/src/`, not in an app/surface.
- [ ] Add Zod (TS) / serde (Rust) validation at every boundary that parses it.
- [ ] Include trust/privacy fields if the type ever crosses a boundary (provider, privacy mode, source surface, storage scope, redaction hash).
- [ ] Make the change additive or explicitly versioned; never repurpose a field silently.
- [ ] Regenerate bindings into `*/generated/`; do not hand-edit generated output.
- [ ] Add/adjust a contract test (recorded fixture) so a shape change fails CI, not production.

### Model catalog discipline (`models.json`)

- [ ] All model IDs/capabilities/pricing read from `models.json` / `model-catalog.ts`.
- [ ] No hardcoded model ID in selectors, route defaults, tests, provider adapters, or docs.
- [ ] Token counting + cost estimation use catalog metadata (tokenizer-change safe).
- [ ] Catalog edits carry a `verificationLog` entry (provider + date + source).

### Validation gate (Zod/serde)

- [ ] Every tool input is schema-validated before execution (Vol 18).
- [ ] Every LLM/tool output consumed as data is validated before use.
- [ ] Every API request/response is typed + validated at the route boundary.
- [ ] Every IPC payload (Tauri commands, native modules, message handlers) is validated on receipt.
- [ ] BYOK base URLs / outbound targets pass the SSRF allowlist contract (Vol 30).

### Wire/persistent contract review

- [ ] Persistent rows carry org/workspace/user scope for RLS (Vol 4/25).
- [ ] Wire events for streaming carry the lifecycle state (queued/running/tool_wait/completed/interrupted/failed — Vol 24).
- [ ] JSON/CSV import/export schemas are explicit, versioned, and validated on ingest.
- [ ] Local-store shapes mirror the canonical logical contract (no per-store drift).

### Cross-language consistency

- [ ] TS and Rust representations of a shared contract agree (verified by a round-trip/fixture test).
- [ ] Enum/constant values are defined once and shared, not re-typed per language.

## Definition of Done

A contract is "production-ready" when: it is declared once in `packages/types`; validated with Zod/serde at every boundary that parses it; carries the trust/privacy fields required to cross a boundary; has generated bindings isolated under `*/generated/`; is covered by a fixture/contract test that fails CI on an unexpected shape change; and (for model data) reads exclusively from `models.json`. No external input reaches business logic unvalidated.

## Anti-patterns

- Hardcoding a model ID anywhere instead of reading `models.json`.
- Re-declaring a shared contract inside a surface (surface drift; Vol 35).
- Hand-editing generated bindings, or putting generated types outside `*/generated/`.
- Trusting LLM/tool/API/IPC output without Zod/serde validation.
- Serializing Local context into a boundary-crossing contract (privacy leak; Vol 3).
- Repurposing a wire/persistent field silently instead of versioning it.
- Carrying a stale model ID/pricing/tokenizer assumption in code or docs.
