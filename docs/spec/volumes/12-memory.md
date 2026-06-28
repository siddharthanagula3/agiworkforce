# Volume 12 — Memory

Status: Canonical (expands `docs/spec/AGI_CODE_MASTER_SPEC.md` Vol 12)
Authority: this manual, `docs/strategy/10-oss-corpus-port-plan.md` §4 (supermemory schema, build-your-own engine), `docs/strategy/09-reference-codebases.md` §2.1 (O8/O9 extraction+consolidation), `docs/current/source-of-truth.md` (Privacy settings, P0 #6), `packages/types/src/suite-contracts.ts`.

## Philosophy & Cloud/Local stance

Memory is what turns a chat tool into a workspace the user keeps coming back to. Without it there is no retention habit (`docs/strategy/02` §2). AGI's memory is **generated from conversation history, viewable and manageable by the user, and trust-scoped by construction**. The decisive architecture decision (`docs/strategy/10` §4): adopt supermemory's _data-model contract_ (MIT, in-repo), but **build the engine ourselves** — supermemory's retrieval engine is closed-source, so the chunker, extractor, embedder, and ranker are AGI-original.

Cloud/Local is the deepest constraint here. Memory is namespaced by trust boundary using a `containerTag`-equivalent: **a Local memory can never surface in a BYOK or Managed query, and vice versa.** On Local, extraction and embedding run on-device (fastembed/ONNX) and the store stays on-device. Managed memory follows Managed retention/deletion policy. Memory is the moat applied to the user's own knowledge — a leak across boundaries is a P0, identical in severity to a chat leak.

## Binding rules

1. **Four memory types.** Model episodic (events/turns), semantic (facts), procedural (skills/workflows), and working (current-task scratch) explicitly; do not collapse them into one blob.
2. **Four scopes, isolated.** User, project, workspace, and global scopes; each respects its boundary. Project memory never bleeds across projects (Vol 13).
3. **Trust isolation is absolute.** Namespace memory by trust boundary (container-tag equivalent). A Local memory never surfaces in a BYOK/Managed query; cross-boundary surfacing is a P0.
4. **Two-layer store with provenance.** A RAG layer (`document` + `chunk` with embeddings) and a fact layer (`memoryEntry` linked to sources via a join carrying a relevance score) — every fact knows where it came from.
5. **Generated from history.** An async extraction pipeline distills facts from conversations (the source-of-truth P0 "generated memory from chat history"), with an observable status enum (`queued → extracting → chunking → embedding → indexing → done`).
6. **User controls everything.** View, manage, edit, reset, export, and import memory (Privacy settings). Reference-chat search and generated-memory-from-history are opt-in toggles.
7. **TTL forgetting.** Support `forgetAfter` / `isForgotten` so stale memory ages out; pruning is conservative and reversible within a window.
8. **Hybrid recall.** Combine vector + lexical (BM25-style) retrieval with dedup and conservative caps; walk relations, not only top-K.
9. **Embedder swaps are safe.** Dimension-pinned / dual-lane collections so changing the embedder cannot silently corrupt memory (`odysseus` O6).
10. **Import normalizes + labels.** Importing prompts/workflows/memory from other AI providers (Privacy P0) maps into AGI's schema, is trust-labeled, and never silently upgrades a memory's boundary.

## Repository map

- Desktop memory UI (view/manage/search/import): `apps/desktop/src/features/memory/` — `MemoryManager.tsx`, `MemoryBrowserModal.tsx`, `MemorySearch.tsx`, `MemoryViewer.tsx`, `MemoryImport.tsx`, `CreateMemoryDialog.tsx`, `MemoryImportanceIndicator.tsx`.
- Memory panel surface: `apps/desktop/src/features/memory-panel/`.
- Privacy settings (toggles, import, view/manage/reset): `apps/desktop/src/features/*` settings + `apps/web/features/settings/` (per source-of-truth Privacy IA).
- Shared memory contracts/types: `packages/types/src/` (Vol 38; adopt supermemory schema shape).
- Trust scoping: `packages/types/src/suite-contracts.ts` (`PrivacyMode`, `ChatExecutionMode`).
- Embeddings/retrieval runtime: `packages/runtime/`, `packages/routing/`; on-device embeddings via fastembed/ONNX (`docs/strategy/09` §2.2).
- Mobile compliance/export (for managed deletion/DSAR): `apps/mobile/services/dsarExport.ts`, `apps/mobile/services/complianceLedger.ts`.

## Competitor notes

Per `docs/strategy/01` / `02`: ChatGPT ships memory + 24h project synthesis; Claude ships personalization and project memory — both table-stakes for retention, and AGI is currently **Partial** here (gap analysis §2). AGI's divergence is **trust-scoped, user-owned, exportable memory** — incumbents store memory in their single cloud zone, while AGI keeps Local memory on-device and lets users view/manage/import/reset it. The reference codebases close most of the build risk: `odysseus` O9 (automatic extraction + periodic consolidation, hybrid BM25+vector, dedup, conservative caps) and O8 (self-evolving skills) are a near-complete blueprint for the memory P0; supermemory's `packages/validation/schemas.ts` gives the two-layer schema. Adapt the schema and patterns; the engine is AGI-original; never copy proprietary memory internals.

## Checklists

### Build — store & schema

- [ ] Two-layer store: `document` + `chunk` (embeddings) and `memoryEntry` (facts) joined to sources with a relevance score.
- [ ] Model episodic / semantic / procedural / working memory as distinct types.
- [ ] Model user / project / workspace / global scopes with enforced isolation.
- [ ] Dimension-pinned / dual-lane embedding collections (embedder-swap safe).
- [ ] Add `forgetAfter` / `isForgotten` TTL fields and a conservative, reversible pruner.

### Build — generation & recall

- [ ] Async extraction pipeline with an observable status enum, distilling facts from conversation history.
- [ ] Periodic consolidation/dedup with conservative caps (avoid memory bloat).
- [ ] Hybrid recall (vector + lexical) with dedup; walk relations beyond top-K.
- [ ] Optional org-level LLM pre-filter to exclude PII categories before storing (privacy).

### Build — user controls (Privacy IA)

- [ ] View/manage/edit/reset memory UI wired end-to-end.
- [ ] Reference-chat search toggle and generated-memory-from-history toggle (opt-in).
- [ ] Export memory (with provenance) and import memory/prompts/workflows from other providers, normalized + trust-labeled.

### Review & trust

- [ ] Memory queries are namespaced by trust boundary; Local memory cannot surface in BYOK/Managed (trust-boundary test).
- [ ] Local extraction/embedding/storage run on-device and never egress.
- [ ] Project memory never bleeds across projects or shared-project members beyond RBAC (Vol 13).
- [ ] Managed memory honors retention/deletion + DSAR export (Vol 30; `dsarExport.ts`).
- [ ] Temporary chats never produce memory (Vol 9).

## Definition of Done

Memory is generated from history through an observable extraction pipeline, stored in a two-layer (RAG + fact) schema with source provenance, recalled via hybrid retrieval, and fully user-manageable (view/manage/edit/reset/export/import) behind opt-in Privacy toggles. Episodic/semantic/procedural/working types and user/project/workspace/global scopes are modeled and isolated. Trust isolation is provable: Local memory never surfaces cross-boundary (trust-boundary test passes). Embedder swaps are safe; TTL forgetting works; Managed memory honors retention/deletion/DSAR. The memory UI is verified end-to-end (not build-only).

## Anti-patterns

- One memory blob with no type/scope distinction or provenance.
- Any path where Local memory surfaces in a BYOK/Managed query (P0 leak).
- Memory the user cannot view, edit, export, or reset.
- Generating memory from temporary chats, or with reference-search/generated-memory toggles ignored.
- Changing the embedder without dimension-pinned lanes (silent corruption).
- Unbounded memory growth with no consolidation, dedup, or TTL.
- Reproducing supermemory's closed engine internals instead of building AGI's own engine on the adopted schema.
