# Volume 11 — Context System

Status: Canonical (expands `docs/spec/AGI_CODE_MASTER_SPEC.md` Vol 11)
Authority: this manual, `docs/strategy/09-reference-codebases.md` (context cascade, RAG tool selection), `docs/strategy/10-oss-corpus-port-plan.md` §2/§4 (compaction, memory), `packages/contracts/types/src/suite-contracts.ts`.

## Philosophy & Cloud/Local stance

Context assembly is the highest-leverage, highest-risk subsystem: it decides _what the model knows_ on every turn. AGI treats it as a **cost-ordered, trust-scoped pipeline**, not a pile of strings. Two laws govern it. First, **RAG over stuffing**: as the context approaches the model's window, retrieve the relevant slice rather than concatenate everything (`docs/strategy/09` — cheap structural reduction runs before expensive lossy summarization). Second, **trust scoping is absolute**: only assemble context the active trust boundary permits. Local files, Local memory, and Local prior conversations never leak into a BYOK or Managed request — this is the moat, enforced in code, not convention.

Cloud/Local changes the _eligible sources and the retrieval/embedding location_. On Local, ingestion, embedding, and retrieval run on-device (e.g., fastembed/ONNX, liteparse) and never leave the device. On BYOK/Managed, server-side retrieval is allowed within that boundary, but a fork is required to pull Local-origin context across. The pipeline must explain its choices (which sources it pulled, why it dropped some) and never silently cross a boundary.

## Binding rules

1. **Context assembly is cost-ordered.** Cheapest, highest-signal sources first; expensive retrieval and lossy summarization last. Run cheap structural reduction (drop stale tool results, dedup) before any model-call summarization.
2. **Context assembly is trust-scoped.** Only sources the active `ChatExecutionMode` permits enter the request. Local-origin context never enters a BYOK/Managed request without an explicit fork (Vol 9).
3. **RAG over full-context stuffing near limits.** When projected tokens approach the window, retrieve top-K relevant chunks (+ keyword force-includes) instead of concatenating; do not silently truncate the user's latest intent.
4. **Untrusted sources enter as guarded data.** Files, web pages, email, connector payloads, and retrieved memory are wrapped as data, never as instructions (`odysseus` O5; Vol 30).
5. **Every assembled source is labeled.** The user can see what context was used (files, project, memory, connectors, prior chats) and its trust origin.
6. **Retrieval is hybrid where it helps.** Vector for prose, lexical/field-qualified search for code/structured data; walk the relation graph, not only top-K (`docs/strategy/10` §4).
7. **Embeddings survive model swaps.** Use dual-lane / dimension-pinned collections so changing the embedder cannot silently corrupt retrieval (`odysseus` O6).
8. **The pipeline is deterministic and cache-aware.** Stable, cacheable context goes in the prompt prefix; volatile retrieved context goes in the suffix (Vol 10).
9. **Tool/skill/MCP context is loaded on demand.** Defer large tool/MCP schemas; load on use (Vol 19) and select relevant tools by retrieval for small/local models (`odysseus` O2).
10. **Overflow recovers, not errors.** On context overflow, withhold-and-recover (drain → compact → escalate) rather than failing the turn (Vol 24).

## Repository map

- Context assembly + chat lib: `packages/ui/unified-chat/src/lib/`, `apps/web/features/chat/lib/`, `apps/web/features/chat/services/`.
- Memory sources (assembled into context): `apps/desktop/src/features/memory/` (`MemorySearch.tsx`, `MemoryManager.tsx`), Vol 12.
- Projects/knowledge sources: `apps/web/features/projects/`, `apps/desktop/src/features/projects/` (Vol 13).
- Files/ingestion sources: `apps/desktop/src/features/file-upload/`, `apps/mobile/services/docParser.ts` (Vol 15).
- Connectors/MCP/skills sources: `apps/web/features/connectors/`, `apps/desktop/src/features/{connectors,mcp}/`, `packages/tools/mcp/src/`, `packages/tools/skills/src/`.
- Trust scoping primitives: `packages/contracts/types/src/suite-contracts.ts` (`PrivacyMode`, `ChatExecutionMode`, `assertSurfaceCanSyncChats`).
- Model windows/capabilities (budgeting): `packages/contracts/types/src/models.json`.
- Routing/runtime (where assembly runs): `packages/ai/routing/`, `packages/client/client-runtime/`, `packages/ai/provider-runtime/`.

## Competitor notes

Per `docs/strategy/02` §2: Claude and ChatGPT both assemble context from projects, files, memory, and connectors — and their connectors directory is how they create lock-in. AGI's parity target is the same set of sources; its divergence is the **trust-scoped pipeline** — Local context is provably walled off, which incumbents cannot match without abandoning their single trust zone. The references hand AGI the implementation: `claude-code` (study-only) shows the cost-ordered cascade and deferred tools; `odysseus` (MIT) shows RAG tool selection (O2), dual-lane embeddings (O6), and tool-message-invariant repair (O11 — a real OpenAI 400 trap AGI will hit across 15 providers). Adapt these; build the engine; never copy proprietary code.

## Checklists

### Build — pipeline & retrieval

- [ ] Implement one cost-ordered assembler: cheap structural reduction → retrieval → summarization → hard limit.
- [ ] Drop stale/oldest tool results and dedup before any model-call summarization.
- [ ] Switch to RAG retrieval (top-K + keyword force-includes) as projected tokens approach the model window from `models.json`.
- [ ] Hybrid retrieval: vector for prose + field-qualified lexical for code/structured data.
- [ ] Walk the relation graph (parents/children), not only top-K, for connected sources.
- [ ] Repair tool-message invariants after trimming (no orphaned tool roles) before sending (O11).

### Build — sources & labeling

- [ ] Assemble files, projects, memory, connectors, MCP, skills, prior conversations, and user/team profile as distinct, labeled sources.
- [ ] Show the user which sources were used and their trust origin.
- [ ] Defer large tool/MCP schemas; load on use; retrieval-select tools for small/local models.
- [ ] Dual-lane / dimension-pinned embedding collections so embedder swaps don't corrupt retrieval.

### Review & trust

- [ ] Every source passes a trust-boundary check; Local-origin context cannot enter a BYOK/Managed request without a fork.
- [ ] Local ingestion/embedding/retrieval run on-device and never egress (assert in a trust-boundary test).
- [ ] Untrusted external content is wrapped as guarded data, never instructions (Vol 30).
- [ ] Assembly is deterministic and cache-aware (stable prefix, volatile suffix) — shares Vol 10's cache guard.

### Security & resilience

- [ ] Secret scan runs on ingested content before it can cross a boundary.
- [ ] Context overflow triggers withhold-and-recover, not a turn failure (Vol 24).
- [ ] Connector/MCP context respects per-user source permissions and per-conversation loading.

## Definition of Done

Context assembles through one cost-ordered, trust-scoped pipeline that prefers RAG over stuffing near the window, repairs tool-message invariants, and labels every source with its trust origin. Local-origin context is provably walled off from BYOK/Managed requests (trust-boundary test passes). Embeddings survive model swaps; untrusted content enters as guarded data; overflow recovers instead of erroring. Retrieval is hybrid and respects per-user/per-conversation source permissions. Surface check and trust-boundary contract tests pass; the one-chat context flow is verified end-to-end (not build-only).

## Anti-patterns

- Concatenating all files/memory/history and letting the provider truncate (loses the user's latest intent).
- Any path where Local files/memory/prior chats reach a BYOK/Managed request without a fork.
- Injecting retrieved/connector/web content as instructions instead of guarded data.
- Trimming context into orphaned tool-role messages (provider 400s).
- Sending full tool/MCP catalogs every turn instead of deferring/retrieval-selecting.
- Changing the embedder without dimension-pinned lanes (silent retrieval corruption).
- Erroring on context overflow instead of withhold-and-recover.
