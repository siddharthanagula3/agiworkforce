# W8 — Model routing, agent runtime, connectors and durable execution

[← all waves](../WAVES.md) · [register index](../README.md)

**Why now.** This is the engine every surface calls, so it is fixed once, centrally, before the surface waves build on it — otherwise web, desktop, mobile and CLI each grow another private copy of the same routing bug. The clustering is deliberate: hardcoded provider endpoints and model IDs appear identically in web, desktop and CLI (AI-01/AI-02/DESK-16/DESK-17/CLI-04); there is no voice/TTS or realtime routing slot, which is why desktop hardcodes speech models (AI-04/AI-05/AI-06/DESK-14); the harness is implemented twice with no shared crate (AI-19/DESK-15); runtime profiles resolve zero models for desktop chat (AI-21/DESK-30/DESK-31); knowledge retrieval is prompt-stuffing with the desktop indexer and RAG engine unwired (AI-12/DESK-20/DESK-21); and connectors are the tool layer this engine calls, still with an empty OAuth registry and a 404 client-metadata document. Durable-execution infrastructure (idempotency, leases, retries, cancellation, backpressure, checkpoints) is included because the agent loop is its only serious consumer and retrofitting it later would rewrite the same call sites.

**Size.** 92 items (33 high, 47 medium, 12 low); 82 open.

**Done when.** No provider endpoint or model ID literal exists outside the canonical registry and its generated mirrors — enforced by a guard that scans web, desktop, CLI, mobile and test fixtures; replacing a model requires no consumer edit. Routing slots exist for speech synthesis, transcription and realtime audio; no retired or deprecated model is served without a recorded successor decision. Every runtime profile resolves at least one candidate for desktop local-chat and cloud-chat, and the model badge reports the model that actually ran, including after server-side substitution. Deep research runs the research loop on all providers with connector tools and project files citable; code execution either runs or the control is not offered; capability flags (research, search, tool use, MCP) gate on themselves. Anthropic pause_turn maps to a distinct stop reason, Gemini thought signatures survive tool loops, and the OpenAI Responses reasoning dialect has a live-key smoke record. Memory has project scope, source suppression, user-visible provenance and inspect/edit/delete/export controls. One shared agent-runtime contract is used by desktop and CLI (no second harness), checkpoints persist durably and a killed process resumes without duplicating completed effects, mutations carry idempotency keys and expected-revision leases, one retry implementation with jittered backoff replaces the four, client stop propagates cancellation to downstream work, and a transient sandbox reconnect no longer orphans a live sandbox. Connector OAuth registry has real providers, the CIMD document resolves in production, grants are keyed by issuer, and one definition of the OAuth start path and callback builder remains.

| ID                    | Sev    | Item                                                                                                                                                                        | Effort |
| --------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| [AI-01](#ai-01)       | HIGH   | Provider endpoint literals bypass the canonical registry across web, desktop and CLI                                                                                        | L      |
| [AI-04](#ai-04)       | HIGH   | No voice/TTS routing slot exists, so speech defaults are hardcoded and a retired model stayed live for 19 days                                                              | M      |
| [AI-08](#ai-08)       | HIGH   | Auto routing is only partially migrated off fake model records and hardcoded task maps                                                                                      | L      |
| [AI-09](#ai-09)       | HIGH   | The model shown to the user is the model requested, not the model that actually ran                                                                                         | M      |
| [AI-12](#ai-12)       | HIGH   | Project knowledge is prompt-stuffed, not retrieved — no embeddings, ranking, ACL filtering or provenance                                                                    | XL     |
| [AI-13](#ai-13)       | HIGH   | Deep Research silently degrades: Anthropic bypasses the research loop, connector tools are stripped, project files are uncitable                                            | L      |
| [AI-14](#ai-14)       | HIGH   | Agent checkpoints are not durably persisted, so a process or deploy failure cannot be recovered without duplicating completed effects                                       | L      |
| [AI-17](#ai-17)       | HIGH   | The 'research' capability flag is decorative server-side — it is gated on 'search' instead                                                                                  | M      |
| [AI-19](#ai-19)       | HIGH   | No canonical cross-surface agent-runtime contract; the harness is implemented independently in Desktop and CLI                                                              | XL     |
| [AI-20](#ai-20)       | HIGH   | The OpenAI Responses dialect for reasoning models has never been smoke-tested with a live key                                                                               | S      |
| [AI-24](#ai-24)       | HIGH   | Code execution silently no-ops on the OpenAI chat-completions path and under providers with no execution tool                                                               | M      |
| [AI-26](#ai-26)       | HIGH   | Memory has no project scope, no source suppression and no user-visible provenance or correction                                                                             | L      |
| [AI-29](#ai-29)       | HIGH   | The Cloud Code approval state machine is write-only — a suspended turn can never be decided or resumed                                                                      | M      |
| [AI-37](#ai-37)       | HIGH   | Durable (survives-connection-close) execution for initial AGI Work turns is off by default while CHANGELOG describes the flag as a kill-switch                              | M      |
| [AI-38](#ai-38)       | HIGH   | No way to steer or redirect an active agentic run without stopping it entirely                                                                                              | M      |
| [AI-39](#ai-39)       | HIGH   | Scheduled task execution has zero tool access — no web search, code execution, connectors, MCP, files or media                                                              | L      |
| [AI-40](#ai-40)       | HIGH   | Web chat never retrieves or references excerpts from the user's other past conversations at send time                                                                       | L      |
| [AI-58](#ai-58)       | HIGH   | No developer-session remote-control protocol exists end to end on any surface                                                                                               | XL     |
| [CLI-04](#cli-04)     | HIGH   | CLI provider fallback hardcodes the OpenAI chat-completions URL, bypassing trust mode and the registry                                                                      | M      |
| [CONN-01](#conn-01)   | HIGH   | The connector catalog is nonfunctional by default: branded connectors 501 and the OAuth registry ships with zero providers                                                  | XL     |
| [CONN-03](#conn-03)   | HIGH   | The MCP client-metadata document 404s in production, blocking first authorization for eight CIMD connectors                                                                 | S      |
| [CONN-07](#conn-07)   | HIGH   | Custom MCP connectors are invisible on Desktop, and desktop Local mode runs an entirely separate connector system                                                           | L      |
| [CONN-09](#conn-09)   | HIGH   | MCP OAuth discovery reportedly implements only pre-registration; contradicted by later CIMD and DCR evidence                                                                | M      |
| [CONN-17](#conn-17)   | HIGH   | No surface offers automatic (progressive-disclosure) skill invocation — a working desktop matcher has zero callers                                                          | M      |
| [DESK-15](#desk-15)   | HIGH   | Desktop and CLI each hand-roll a separate agent, MCP and LLM harness with no shared crate                                                                                   | XL     |
| [DESK-16](#desk-16)   | HIGH   | Desktop provider endpoints and image model IDs are hardcoded outside the registry; image generation calls three nonexistent model IDs                                       | L      |
| [INFRA-26](#infra-26) | HIGH   | Context, payloads and producer rates are not bounded, so nothing applies backpressure                                                                                       | L      |
| [INFRA-28](#infra-28) | HIGH   | Durable job execution has no retries, backoff, leases, dead-letter path or fair concurrency                                                                                 | XL     |
| [INFRA-29](#infra-29) | HIGH   | Mutations lack idempotency keys, expected-revision leases and out-of-order reconciliation                                                                                   | L      |
| [INFRA-30](#infra-30) | HIGH   | Cancellation does not propagate from the client stop to downstream work                                                                                                     | M      |
| [INFRA-31](#infra-31) | HIGH   | Four independent retry implementations and no protection against retry storms or refresh stampedes                                                                          | L      |
| [UI-83](#ui-83)       | HIGH   | Deep Research progress/plan UI and saved-report retrieval exist only on web; desktop parses the events and renders nothing, mobile and the extension have no parser at all  | L      |
| [UI-85](#ui-85)       | HIGH   | No surface offers genuinely full-duplex, interruptible spoken conversation — every voice implementation is turn-based dictation or absent                                   | XL     |
| [AI-02](#ai-02)       | MEDIUM | Retired and hardcoded model IDs persist in directories the model-ID guard never scans                                                                                       | M      |
| [AI-03](#ai-03)       | MEDIUM | Model registry still names a deleted google-batch adapter, and preview-only batch-tier code has no backend or caller                                                        | S      |
| [AI-05](#ai-05)       | MEDIUM | Catalog schema has no realtime/duplex audio model type, so realtime voice cannot be modelled at all                                                                         | L      |
| [AI-06](#ai-06)       | MEDIUM | The only model served on the OpenAI TTS path carries a Deprecated badge with no published successor                                                                         | S      |
| [AI-07](#ai-07)       | MEDIUM | Local-provider identity is hardcoded to 'ollama', misclassifying LM Studio, llama.cpp and vLLM                                                                              | M      |
| [AI-10](#ai-10)       | MEDIUM | The ExecutionPlan/CPST router contract is fully specified with zero implementation                                                                                          | XL     |
| [AI-15](#ai-15)       | MEDIUM | Anthropic pause_turn stop reason is mismapped to end_turn, telling callers a suspended turn completed cleanly                                                               | S      |
| [AI-16](#ai-16)       | MEDIUM | Gemini thought-signature continuity across tool loops is mitigated but unresolved                                                                                           | M      |
| [AI-21](#ai-21)       | MEDIUM | Runtime profiles resolve zero candidates for desktop local-chat and zero selectable models for desktop cloud-chat                                                           | M      |
| [AI-22](#ai-22)       | MEDIUM | Media-generation model and aspect-ratio options are advertised beyond what the providers actually deliver                                                                   | M      |
| [AI-27](#ai-27)       | MEDIUM | Connected files are not a synchronized knowledge source — no revision, permissions, cursor or tombstone state                                                               | XL     |
| [AI-28](#ai-28)       | MEDIUM | Condition-triggered and cloud-triggered automation lacks an authenticated durable trigger path                                                                              | L      |
| [AI-30](#ai-30)       | MEDIUM | AGI Work has no durable pause/resume, no clarification round-trip, and a single-threaded cloud loop                                                                         | XL     |
| [AI-31](#ai-31)       | MEDIUM | Managed-cloud SSE carries reasoning only as token counts, so the reasoning chip can never render                                                                            | M      |
| [AI-32](#ai-32)       | MEDIUM | Several catalog models remain unpriced or unverified against live provider APIs                                                                                             | M      |
| [AI-35](#ai-35)       | MEDIUM | Model retirement/migration logic is reimplemented per-surface instead of centralized in the shared model registry                                                           | M      |
| [AI-41](#ai-41)       | MEDIUM | No vector storage or semantic retrieval anywhere; the fully-built, fully-billed embeddings endpoint has zero internal callers                                               | XL     |
| [AI-47](#ai-47)       | MEDIUM | Provider-outage / credit-downgrade fallback reason is computed but never reaches the streaming client                                                                       | S      |
| [AI-48](#ai-48)       | MEDIUM | Ultra/Pro reasoning-mode and reasoningDots catalog fields have zero product consumers (schema built ahead of product)                                                       | S      |
| [AI-49](#ai-49)       | MEDIUM | Opening a conversation whose persisted model has been retired silently substitutes the default with no notice                                                               | S      |
| [AI-50](#ai-50)       | MEDIUM | No cross-provider memory import on Web or Desktop despite mobile already shipping a working on-device parser                                                                | M      |
| [AI-51](#ai-51)       | MEDIUM | Web Memory settings lack search, pin and summary controls, and the pinned DB column is invisible to the CRUD API                                                            | M      |
| [AI-52](#ai-52)       | MEDIUM | Memory is only ever a flat/provenance-grouped fact list, never synthesized narrative, and its retrieval is never named in the reasoning trace                               | M      |
| [AI-54](#ai-54)       | MEDIUM | No approval/autonomy-mode picker on web, and the existing 4-tier picker is not reused by Cowork or scheduled tasks                                                          | M      |
| [AI-56](#ai-56)       | MEDIUM | Completed research reports are a dead end: no table of contents, no notify-on-done, no derivative formats, no suite export, no source scoping, no follow-up composer        | L      |
| [CLI-20](#cli-20)     | MEDIUM | CLI has no durable detached-run/backgrounding contract, so subagent batches are foreground-only                                                                             | XL     |
| [CONN-02](#conn-02)   | MEDIUM | GitHub connector requires a registered GitHub App (7 env vars) and silently disappears when any one is missing                                                              | S      |
| [CONN-04](#conn-04)   | MEDIUM | Six MCP vendors refuse dynamic client registration, keeping those connectors unlisted                                                                                       | M      |
| [CONN-05](#conn-05)   | MEDIUM | An authorization-server change is undetectable because connector grants are not keyed by issuer (SEP-2352)                                                                  | S      |
| [CONN-08](#conn-08)   | MEDIUM | CONNECTOR_OAUTH_START_PATH and its callback builder have multiple independent live definitions                                                                              | M      |
| [CONN-10](#conn-10)   | MEDIUM | Pivot to MCP protocol revision 2026-07-28 is blocked on the official SDK                                                                                                    | M      |
| [CONN-11](#conn-11)   | MEDIUM | MCP directory content is placeholder rather than a signed curated registry, and no install/publish lifecycle exists                                                         | XL     |
| [CONN-13](#conn-13)   | MEDIUM | Connector explicit invocation and discovery are absent from the composer on every surface                                                                                   | L      |
| [CONN-22](#conn-22)   | MEDIUM | No skill-authoring path on web/BYOK/managed cloud: no AI-assisted authoring, no file upload, no GitHub import                                                               | L      |
| [CONN-23](#conn-23)   | MEDIUM | No connector-search toggle and no per-capability auto-invoke controls — connectors are always auto-searched with no way to disable                                          | M      |
| [CONN-29](#conn-29)   | MEDIUM | Confirm-before-destructive-action dialog copy-pasted three times while the live connector disconnect remains unconfirmed                                                    | S      |
| [DESK-14](#desk-14)   | MEDIUM | Desktop TTS model IDs are hardcoded because no voice-synthesis routing slot exists in the catalog                                                                           | M      |
| [DESK-17](#desk-17)   | MEDIUM | Groq transcription endpoint and speech-provider config duplicated across the Desktop and CLI Rust binaries                                                                  | M      |
| [DESK-20](#desk-20)   | MEDIUM | Desktop workspace semantic-embeddings indexer is implemented but unwired and not authorized to send Local content remotely                                                  | L      |
| [DESK-21](#desk-21)   | MEDIUM | Desktop project RAG engine is unreachable and permanently non-semantic even if reached                                                                                      | L      |
| [DESK-30](#desk-30)   | MEDIUM | Desktop/cloud-chat surface returns zero selectable models for every tier; desktop/local-chat profile has zero allowed harnesses                                             | M      |
| [DESK-31](#desk-31)   | MEDIUM | No installed Local model is certified for Desktop Local Tasks, so the feature stays disabled                                                                                | M      |
| [DESK-62](#desk-62)   | MEDIUM | Desktop OpenAI reasoning Responses dialect has no live-key smoke proof                                                                                                      | S      |
| [INFRA-32](#infra-32) | MEDIUM | Process-local job state remains on desktop and gateway surfaces                                                                                                             | M      |
| [INFRA-45](#infra-45) | MEDIUM | A transient sandbox reconnect failure orphans a still-live paused sandbox                                                                                                   | S      |
| [SEC-84](#sec-84)     | MEDIUM | Approval/autonomy-mode control does not reach the surfaces that most need it: no picker on Web chat, global-binary only on Desktop, none on Cowork or scheduled tasks       | M      |
| [UI-09](#ui-09)       | MEDIUM | Memory has no user-facing lifecycle controls: no disable, inspect, edit, delete, export, scope separation, or provenance                                                    | L      |
| [AI-18](#ai-18)       | LOW    | allowToolUse and allowMCP documentation contradicts the tier values they document                                                                                           | S      |
| [AI-23](#ai-23)       | LOW    | The web-search honesty guard does not cover native-provider models                                                                                                          | S      |
| [AI-33](#ai-33)       | LOW    | Inbound messaging-platform bot presence is undecided and outside current phases                                                                                             | XL     |
| [AI-45](#ai-45)       | LOW    | Provider request-shaping (OpenAI wire-compat, reasoning-effort normalization) is web-only with unverified parity on mobile and extension                                    | S      |
| [AI-53](#ai-53)       | LOW    | No personalization layer beyond chat memory: no forward-looking brief, no connector-fed personalization, no disclosure of whether memory personalizes outbound tool queries | L      |
| [AI-55](#ai-55)       | LOW    | Internal task-complexity classification is computed for routing but never narrated to the user                                                                              | S      |
| [CONN-21](#conn-21)   | LOW    | No product-catalog design/UI skill wired into artifact generation, so named-skill narration can never occur                                                                 | M      |
| [CONN-24](#conn-24)   | LOW    | No self-serve non-MCP 'Custom API' connector authoring path                                                                                                                 | XL     |
| [CONN-25](#conn-25)   | LOW    | No plugin provenance reaches the skill autocomplete, so no attribution or skill-load narration is possible                                                                  | M      |
| [CONN-26](#conn-26)   | LOW    | Connector and plugin catalog browsing gaps: no data-source category, no example prompts, no provider-bundle toggle, no ratings primitive, no storefront category tabs       | M      |
| [CONN-27](#conn-27)   | LOW    | No context-load control (lazy vs always-loaded) for installed tools; the only such setting was dead and was deleted                                                         | M      |
| [SEC-78](#sec-78)     | LOW    | No configurable safety fallback (switch model vs pause) when a message is flagged                                                                                           | M      |

---

### AI-01 — Provider endpoint literals bypass the canonical registry across web, desktop and CLI

`HIGH` · ai-routing · effort L

**What.** HARD-001: apps/desktop/src-tauri/src/core/agi/conversation_summarizer.rs hardcodes OpenAI endpoints — VERIFIED still present at :681 ("https://api.openai.com/v1/chat/completions") and :757 (".../v1/embeddings"). HARD-002 duplicates Perplexity/Veo hosts across provider modules and search config. HARD-003: CLI provider fallback hardcodes the OpenAI chat-completions URL, potentially bypassing trust mode, selected base URL, proxy and region. HARD-004: Groq transcription endpoint duplicated between the Desktop and CLI Rust binaries. HARD-005 triage (2026-08-09) counted 36 first-party api.(openai|anthropic|groq|perplexity).com literals outside tests/redaction. ExecutionPlan #61 was BLOCKED because the canonical registry and its 19 consumers cannot move independently inside one item. PROVIDER-REMOVAL-REPO-WIDE-01 adds that desktop Rust/UI transports and CLI Cohere/Together discovery mappings still reference removed providers. The endpoint guard now exists (scripts/check-no-hardcoded-endpoints.mjs, VERIFIED) but SCAN_ROOTS = ['apps','packages','services','crates','shared'] so examples/ and tools/ are unscanned.

Also recorded by a later audit (Model selection must use catalog/provider capability metadata everywhere; remove scattered hardcoded current-model assumptions (source-of-truth.md GAP-5)): Preserves GAP-5 as the trail-back id for the provider/model-literal P0, confirming AI-01 (endpoint literals bypassing the registry) and AI-02 (hardcoded model IDs in unscanned directories) as the two halves of the same requirement.

**Done when.** Every outbound provider call resolves its base URL and path from provider metadata (default_base_url()/capability path builders), so replacing or re-hosting a provider requires no consumer edits; the endpoint guard rejects any new host literal outside approved declaration files and its scan roots cover examples/ and tools/.

**Where.** `apps/desktop/src-tauri/src/core/agi/conversation_summarizer.rs:681,757`, `apps/cli/src/lib.rs`, `scripts/check-no-hardcoded-endpoints.mjs:45`

**From.** AuditRemediationLedger.md; known-flaws.md; ExecutionPlan.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** HARD-001 Desktop conversation summarizer hardcodes OpenAI endpoints; HARD-002 Perplexity and Veo hosts are duplicated; HARD-003 CLI provider fallback hardcodes OpenAI chat-completions URL; HARD-004 Groq transcription endpoint duplicated across Rust binaries; HARD-005 Repository-wide provider-endpoint sweep never run; PROVIDER-REMOVAL-REPO-WIDE-01; ExecutionPlan #61 Provider hostnames retyped across web routes and both Rust binaries

### AI-04 — No voice/TTS routing slot exists, so speech defaults are hardcoded and a retired model stayed live for 19 days

`HIGH` · ai-routing · effort M

**What.** VOICE-TTS-NO-ROUTING-SLOT: no voice_tts routing slot exists, so apps/desktop/src-tauri/src/features/speech/tts.rs hardcodes both cloud TTS defaults; this is precisely how a retired ElevenLabs default stayed live for 19 days after upstream removed it, meaning every unconfigured ElevenLabs playback called a nonexistent model. IDs were patched with a guard test but the catalog-driven fix is still owed. HARD-013 states the same defect generally: TTS model resolution is not routed through the live model/provider registry with lifecycle/deprecation checks and there is no startup or catalog validation preventing a removed default. ExecutionPlan #97 confirms model-catalog.ts defines only voice_transcription and voice_rewrite — no synthesis slot — and notes the architectural gap remained after its own fix. PP-20 adds that hardcoded TTS model IDs persist and Web has no read-aloud voice picker.

**Done when.** A voice-synthesis routing slot exists in the catalog and every TTS caller resolves through it, so a deprecated or removed speech model is caught at catalog-validation time instead of failing silently at playback.

**Where.** `apps/desktop/src-tauri/src/features/speech/tts.rs`, `packages/contracts/types/src/model-catalog.ts`

**From.** known-flaws.md; AuditRemediationLedger.md; ExecutionPlan.md

**Folded in.** HARD-013 Voice TTS default can point to a removed model; VOICE-TTS-NO-ROUTING-SLOT; ExecutionPlan #97 Voice/TTS has no catalog routing slot; PP-20 hardcoded TTS model IDs

### AI-08 — Auto routing is only partially migrated off fake model records and hardcoded task maps

`HIGH` · ai-routing · effort L · **in-progress**

**What.** AUTO-ROUTER-MIGRATION-01: 'Auto' was represented as fake model records AND hardcoded TS/Rust task maps simultaneously; 4 false managed_cloud model records were removed and the normalized registry adopted for Desktop/CLI/VSCode/Chrome, but the row is explicitly marked only partially fixed. ExecutionPlan #63 (marked fixed 2026-08-09) established that crates/agiworkforce-model-registry/src/lib.rs is the LIVE CLI Auto decision path — not shadow-gated as previously believed — and was missing the task_family_pareto stage present in the TS routing package, i.e. the two implementations had already drifted. PLAN.md OQ-1 still records 'which of two already-diverged resolvers is canonical' as an open question.

**Done when.** One resolver owns Auto routing for every surface, with no fake model records and no per-surface task map, so a routing-policy change lands once and cannot drift between the TS and Rust paths.

**Where.** `packages/ai/model-registry/catalog/`, `packages/ai/routing/src/auto.ts`, `crates/agiworkforce-model-registry/src/lib.rs`

**From.** known-flaws.md; ExecutionPlan.md; PLAN.md

**Folded in.** AUTO-ROUTER-MIGRATION-01

### AI-09 — The model shown to the user is the model requested, not the model that actually ran

`HIGH` · ai-routing · effort M

**What.** phase4 PP-02 (SHIP): the server computes usedFallback/original_model (response-builder.ts:181, stream-transform.ts:150) and emits fallback:{original_model,reason}, but useChatStream.ts sets the turn's model from the REQUEST (options.model||selectedModel) and persists that; no client ever reads original_model. VERIFIED still present — grep for usedFallback/original_model/x-agi-fallback in useChatStream.ts returns zero hits while fallbackReason is still constructed at request-processor.ts:2701. This means credit-fallback and managed-cloud provider failover are invisible to the user. Partially addressed by a different fix: ExecutionPlan's demo pass added X-AGI-Resolved-Model so Auto no longer labels every reply 'Unavailable model' — but that closes the Auto-label bug, not the substitution-disclosure bug. PP-02 also records that pin-to-model is unwired, there is no model-version/snapshot pinning, and two duplicate ReasoningAccordion implementations exist.

**Done when.** The client reads the resolved/original model from the response and updates both the persisted record and the visible badge whenever a substitution occurred, so a user can always tell which model answered; model-version pinning either works end to end or the pin control is removed.

**Where.** `apps/web/lib/hooks/useChatStream.ts:1964`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2701`, `apps/web/app/api/llm/v1/chat/completions/lib/response-builder.ts:181`, `apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts:150`

**From.** phase4-capability-audit.md; AuditRemediationLedger.md; ExecutionPlan.md

**Folded in.** PP-02 Model/reasoning controls: pin-to-model unwired, no version pinning, duplicate reasoning UIs; phase4 Model-identity badge does not reflect server-side model substitution

### AI-12 — Project knowledge is prompt-stuffed, not retrieved — no embeddings, ranking, ACL filtering or provenance

`HIGH` · ai-routing · effort XL

**What.** PP-06: no indexed retrieval, embeddings, hybrid retrieval, reranking, ACL filtering or provenance; memory/knowledge search uses simple ILIKE rather than semantic search. phase4 PP-06 (PRIVATE_PREVIEW) adds concrete residues: apps/desktop/src-tauri/src/features/projects/rag.rs sets embedding_generator:None with with_embeddings having zero call sites, so generate_embedding always falls through to a bag-of-words hash the file itself labels 'NOT semantic'; project_search_knowledge/project_add_knowledge_file are registered Tauri commands with zero TS invokers; apps/web/app/api/projects/[id]/knowledge-files/route.ts inserts summary as null unconditionally so any file whose extractor returns null contributes only its filename; and project-context-service.ts MAX_FILE_CONTENT_CHARS=16_000 silently truncates a 90-page PDF with no truncation indicator in KnowledgeFilesPanel or SourcesPanel. Desktop's format_project_scope_prompt takes the first 10 files in stored order, truncating each at 4,000 chars, with no ranking. CAP-018 (see AI-27) is the ingestion half of the same gap.

Also recorded by a later audit (Web document ingestion and project knowledge extraction/retrieval must be implemented (frontend-experience-contract.md §14 P1 item 4, §12.1, §11.1)): States the acceptance bar the register entry lacks: 'general document ingestion required before claiming file parity; a filename manifest alone is not project knowledge parity'. Confirms AI-12's prompt-stuffing finding and links it to WEB-17/WEB-25 (ingestion breadth) as one blocking chain — the vector backend for it is tracked as AI-38.

**Done when.** Project knowledge is retrieved by relevance with embeddings and reranking under the caller's ACL, carries provenance the model can cite, and surfaces extraction and truncation state so a user is never silently answered from a fraction of their file.

**Where.** `apps/desktop/src-tauri/src/features/projects/rag.rs:45-49,52,210-211`, `apps/web/app/api/projects/[id]/knowledge-files/route.ts:355-365`, `apps/web/lib/services/project-context-service.ts:54`, `apps/desktop/src-tauri/src/sys/commands/chat/send_message_setup.rs:680-752`

**From.** AuditRemediationLedger.md; phase4-capability-audit.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** PP-06 Project knowledge/RAG: full-context stuffing, lexical-only search, unwired Desktop RAG engine; phase4 PP-06 residues

### AI-13 — Deep Research silently degrades: Anthropic bypasses the research loop, connector tools are stripped, project files are uncitable

`HIGH` · ai-routing · effort L

**What.** phase4 PP-04 (SHIP): route.ts:313-317 gates runResearchLoop to provider !== 'anthropic', so all 3 Anthropic research-capable models fall through to a legacy single-turn path with no planning turn; persistReport never runs, so ResearchPanel's Report tab shows 'No saved report yet' even after a finished run — the tab is permanently dead for Claude. phase4 PP-04b (NOT_SUPPORTED): research-loop.ts:953-963 filters the tool array down to url_fetch only, so every function-shaped MCP/connector tool is dropped inside a research turn with no error or disclosure, while marketing claims 'cited reports across... connected tools'. Project knowledge stuffed into a research turn carries no source label and cannot appear in the citation list, since citations come only from searchedSources/fetchedSources. Mobile drops x_research_status/x_research_plan entirely (zero hits in apps/mobile), so runs lasting up to 4 minutes show nothing. PP-04 additionally records no plan preview/approval before an expensive run, no source-quality scoring or contradiction detection, and reports that can render literal Markdown.

Also recorded by a later audit (Deep Research silently degrades to a single-turn web-search fallback for Anthropic models and free-trial users (SEARCH-RESEARCH-001 / CAP-045; also dr-G2, orch-gap-03)): IMPORTANT STATUS UPDATE: the Anthropic half is reported FIXED. FIXES-APPLIED.md records that the `provider !== 'anthropic'` exclusion in route.ts:301-318 was removed after finding its stated premise (raw-stream normalization) was already generalized in tool-loop-anthropic.ts:30-160, and the fix was verified live on the Gemini Pro-tier catalog model the router selected producing a real plan list, elapsed timer, round counter and structured cited report. The free-trial-user half of the same gate was NOT reported fixed and remains open. Re-verify the exclusion is actually gone at HEAD before closing AI-13's Anthropic clause. Fallback path refs: request-processor.ts:1062-1071,1102-1127 (applyResearchMode, single forced web_search turn, no research_reports row, Report tab shows 'No saved report yet').

Also recorded by a later audit (Deep Research is strictly web-search-only, with no connector/connected-data integration (SEARCH-RESEARCH-003)): Exact mechanism for the 'connector tools are stripped' clause: runResearchLoop explicitly strips every client tool except url_fetch before gathering rounds, with the in-code justification 'No other function tool is executed by this loop, so none other is offered' (research-loop.ts:953-966). A user's read-only connectors (Drive, Notion, Slack, MCP servers) are therefore never available during Deep Research. Fix: extend the research-loop tool filter to allow the user's read-only connector tools, using connector-tool-permissions.ts's existing allow/ask/deny verdicts.

**Done when.** Deep Research behaves identically across providers and surfaces: every research-capable model runs the real loop and persists a report, connector/MCP tools are either usable or explicitly disclosed as excluded, project files carry citable provenance, and mobile renders the same phase and plan events as web.

**Where.** `apps/web/app/api/llm/v1/chat/completions/route.ts:313-317`, `apps/web/lib/research-loop.ts:16-17,953-963`, `apps/mobile/src/features/chat/lib/toolCallAccumulator.ts:99,143-178`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1531-1556`

**From.** AuditRemediationLedger.md; phase4-capability-audit.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** PP-04 Deep Research: no plan approval, weak source verification, dropped Mobile events; phase4 PP-04 Anthropic bypass; phase4 PP-04b connectors/MCP silently ignored; phase4 project-file context unlabeled and never citable

### AI-14 — Agent checkpoints are not durably persisted, so a process or deploy failure cannot be recovered without duplicating completed effects

`HIGH` · ai-routing · effort L

**What.** SCALE-CON-007: no confirmed recovery after process or deploy failure without duplicating completed effects. The desktop side compounds this — PP-14 records duplicate checkpoint implementations, and phase4 PP-14 found three separate checkpoint stacks with only coding*checkpoint*\* wired to UI: checkpoint_create/restore/list/delete has no frontend caller, and apps/desktop/src-tauri/src/lib.rs:1315 is a bare comment '// AGI Checkpoint Management' with nothing registered under it. Desktop settings expose Enable Checkpointing, Checkpoint Interval and Auto-resume toggles that persist but have zero live consumers because both the ContinuousExecutor and the standalone CheckpointManager are dormant and never instantiated.

Also recorded by a later audit (Add typed resumable subagent/tool/approval progress (frontend-experience-contract.md §14 P2 item 3)): Second-document confirmation that resumability is a contract-level gap, not just a persistence bug: the remediation order asks for TYPED RESUMABLE progress across subagent, tool and approval events. Pairs with AI-30 (no durable pause/resume for AGI Work) and AI-29 (write-only Cloud Code approval state machine) as the three consumers of the same missing contract.

**Done when.** One checkpoint implementation persists agent state durably and is the only one registered, so a run resumes after a crash or deploy without re-running completed effects — and the settings toggles that claim to control it actually do.

**Where.** `apps/desktop/src-tauri/src/lib.rs:1305-1320`, `apps/desktop/src-tauri/src/core/agent/continuous_executor.rs`, `apps/desktop/src-tauri/src/core/agi/checkpoint.rs`

**From.** AuditRemediationLedger.md; phase4-capability-audit.md; known-flaws.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** SCALE-CON-007 Agent checkpoints not durably persisted; phase4 PP-14 three separate checkpoint stacks; known-flaws desktop continuous-executor/checkpoint UI wired to dormant subsystems

### AI-17 — The 'research' capability flag is decorative server-side — it is gated on 'search' instead

`HIGH` · ai-routing · effort M · **in-progress**

**What.** WEB-CONNECTORS-NO-RUNTIME-EFFECT-01 residual: connector/MCP tools are now injected into the authenticated tool loop, but the 'research' capability flag is decorative server-side because it is gated on 'search' instead, so several research-capable models get no research at all. Web search additionally requires both a client flag and PERPLEXITY_API_KEY, so a model can advertise research and receive neither.

**Done when.** Each declared capability flag gates the runtime behaviour it names, so a model advertised as research-capable actually receives research tooling rather than being silently downgraded by a mismatched gate.

**Where.** `apps/web/lib/user-connector-tools.ts`, `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts`

**From.** known-flaws.md

### AI-19 — No canonical cross-surface agent-runtime contract; the harness is implemented independently in Desktop and CLI

`HIGH` · ai-routing · effort XL

**What.** DESKTOP-CLI-HARNESS-FRAGMENTATION-01: Desktop and CLI share exactly one Cargo dependency, while the agent/tool-execution loop, MCP client (~11.5K vs ~5.7K LOC) and LLM provider clients are independently implemented twice with no shared harness crate, unlike reference architectures that share one core. GAP-P1-009 generalises this: Desktop, CLI, web, extension and hosted paths have separate implementations, VS Code retains a second provider-stream path alongside the CLI app-server, and there is no canonical Conversation/Run/Step/ToolCall model, stream event vocabulary, cancellation, approval, error, usage-settlement or MCP-capability contract across surfaces. XSURF-PROVIDER-STREAM-DUP-01 records the provider layer specifically: request/SSE/tool-call logic was implemented roughly six times, TS is now unified but the desktop Rust unification was still pending. DESKTOP-AGI-LOOP-VERIFICATION-01 shows the behavioural cost — the main chat loop feeds tool failures back for self-correction with iteration and wall-clock caps while the separate AGICore::achieve_goal engine, reached by a different path, behaves differently, and parity has never been verified.

Also recorded by a later audit (packages/ai/agent-core is misleadingly named — it's a context/memory utility, not a shared agent runtime (CROSS-SURFACE-014)): Adds the naming hazard: packages/ai/agent-core contains only context.ts (context-window budgeting) and memory.ts (relevance scoring) — no planning loop, tool-call loop, subagent orchestration, checkpoint/resume or approval-gate code exists anywhere in packages/ai/\*, so the name implies a shared runtime that does not exist. The real agent loop, approvals and checkpoint/resume live independently in Desktop's Rust core/agi/ and CLI's Rust src/agent/. Proposes renaming to something accurate (e.g. @agiworkforce/context-memory) and scoping a follow-up to identify which agentic-loop invariants warrant a real cross-language contract test. (Same defect as DESK-15 from the desktop side.)

Also recorded by a later audit (packages/ai/agent-core is misleadingly named and the real per-surface agent loops have no cross-surface parity test (CROSS-SURFACE-014)): Concrete proof of the naming problem: packages/ai/agent-core contains only context.ts (context-window budgeting) and memory.ts (relevance scoring) — no planning loop, tool-call loop, subagent orchestration, checkpoint/resume or approval-gate code exists anywhere in packages/ai/\*. The real agent loop, approvals and checkpoint/resume logic live independently in Desktop's Rust core/agi/ and CLI's Rust src/agent/, with no shared TS package and no fixture-replay contract test. Suggested first step: rename the package to something accurate (e.g. @agiworkforce/context-memory) so future readers stop assuming a shared runtime exists, then scope which agentic-loop invariants warrant a real cross-language contract test.

**Done when.** One shared harness owns the run loop, tool execution, MCP client and provider streaming for every surface, with a canonical Run/Step/ToolCall contract, so a behavioural fix lands once and cannot diverge between Desktop, CLI and the hosted paths.

**Where.** `apps/desktop/src-tauri/src/core/agi`, `apps/cli/src/agent`, `apps/desktop/src-tauri/src/core/agi/core.rs`, `apps/desktop/src-tauri/src/sys/commands/chat/send_message_execution.rs`

**From.** known-flaws.md; gap-audit-2026-08-08.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** DESKTOP-CLI-HARNESS-FRAGMENTATION-01; GAP-P1-009 Runtime semantics remain fragmented across surfaces; XSURF-PROVIDER-STREAM-DUP-01; DESKTOP-AGI-LOOP-VERIFICATION-01

### AI-20 — The OpenAI Responses dialect for reasoning models has never been smoke-tested with a live key

`HIGH` · ai-routing · effort S · **in-progress**

**What.** DESKTOP-OPENAI-REASONING-RESPONSES-01: the shared Rust LLM owner now has an explicit openai_responses dialect (fixed 2026-07-15) because OpenAI reasoning models need Responses rather than Chat-Completions compatibility, but the row states the live-key smoke remains external and unrun. phase4 PP-10 records a related unproven claim on the same route: code_interpreter is forwarded on the Responses path with no container field and zero tests assert the payload works.

**Done when.** A live-key smoke against the Responses dialect runs and is recorded, so the reasoning-model path is proven against the real API rather than only against types.

**Where.** `packages/ai/providers/openai/src/translate-responses.ts:183-192`

**Blocked by.** Requires a live provider key and an authorized paid smoke run

**From.** known-flaws.md; phase4-capability-audit.md

### AI-24 — Code execution silently no-ops on the OpenAI chat-completions path and under providers with no execution tool

`HIGH` · ai-routing · effort M

**What.** phase4 PP-10 (SHIP): packages/ai/providers/openai/src/translate.ts:223,262-269 deliberately strips code_interpreter on the Chat Completions route (comment: 'degrades to no native search/interpreter instead of failing outright'), so the toggle is a silent no-op there; the Responses route forwards it with no container field and zero tests assert it works. Separately, the composer enables 'Run code' unconditionally under Auto while resolveCodeExecutionTools('zhipu') returns [] — with the E2B flag off the turn proceeds with no execution tool and no notice. The E2B gate AGI_E2B_EXECUTION defaults to 0 in .env.example and the auditor could not read production env to confirm the live value, so the shipped write_file/create_folder sandbox capability advertised on /agent-permissions may be entirely off in production.

**Done when.** A lit 'Run code' control means the resolved model and provider will actually execute code; when the resolved route cannot, the control is disabled or the turn fails honestly rather than degrading silently.

**Where.** `packages/ai/providers/openai/src/translate.ts:223,262-269`, `apps/web/lib/e2b/execution-tools.ts:113-128`, `apps/web/lib/e2b/gate.ts:65-67`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:713`

**From.** phase4-capability-audit.md; AuditRemediationLedger.md

**Folded in.** PP-10 Code execution and notebooks; phase4 PP-10 OpenAI code execution silent no-op; phase4 PP-10 auto-routing selects provider with no code-execution tool

### AI-26 — Memory has no project scope, no source suppression and no user-visible provenance or correction

`HIGH` · ai-routing · effort L

**What.** GAP-P1-005 bundles CAP-006 (suppress an irrelevant memory source, requiring attribution and retrieval enforcement) and CAP-027 (project-only memory, requiring project scope and the ability to exclude global memory end to end): global/project/conversation scoping, explicit inclusion and exclusion, provenance and user-visible correction controls are all missing. phase4 PP-05 shows the concrete failure — the Desktop Project Settings 'Memory' tab creates and shows account-wide memories under a project heading with no scoping at all, because MemoryManagerProps has no projectId or scope prop, so a 'project' memory silently becomes account-wide and visible in every other project. PP-07 adds that there are no Web controls for memory lifecycle, the Desktop memory-management UI is unmounted, and sensitive-data exclusions do not exist. DEDUP-MEMORY-CATEGORY-3WAY-01 records that MemoryCategory is modelled three incompatible ways (7 literals in types/memory.ts, 6 in agent-core/memory.ts which is the runtime one, 4 in desktop memoryStore.ts) and needs a product decision on the canonical set first.

Also recorded by a later audit (Memory facts never render or cite the chat they were learned from, and cloud-synced facts have no provenance field (MEMORY-007)): Sharpens AI-26's 'no user-visible provenance': MemoryFact.sourceConversationId (packages/ui/unified-chat/src/stores/memoryStore.ts:36-48,61,215-226) and Mobile's SQLite source_conversation_id ARE genuinely populated by Mobile's Local auto-consolidation with a tested null-on-delete cleanup path — but no surface renders the field. MemoryEditor.tsx:250-278 has no 'from this chat' link and Mobile's MemoryItem.tsx never reads it either. Worse, CloudMemoryEntry (apps/mobile/stores/memory/cloudMemoryStore.ts:22-42) has no conversation-reference field at all, so cloud-synced facts — the majority of real usage — lose their origin permanently. Fix: render a 'From: <conversation title>' chip when sourceConversationId is present, and add the field to CloudMemoryEntry and its wire contract.

Also recorded by a later audit (Web has no project-scoped memory capability (MEMORY-004 / memory-13-gap / memory-14-gap / PROJ-WS-01, prior CAP-027)): Root-cause detail for the 'no project scope' clause: user_memories has no project column at all (0010_memory.sql:1-10) and loadManagedMemoryContext selects purely by user_id (managed-memory-context-service.ts:137-158). The team already removed a decorative single-option memory-scope <select> from ProjectSettingsDialog.tsx:229-251 and replaced it with honest static copy, so this is an honest absence, not a fake control. Downstream blocked items: memory-14-gap (no memory-mode selector in CreateProjectDialog.tsx at project-creation time) and memory-15-gap (project settings rail has static Memory copy instead of a real editable card). Severity was raised from P2 to P1 in the competitive pass because Gemini was confirmed as a third product with the capability, making it ALL_PRODUCTS convergence. Fix: nullable project_id on user_memories, a per-project memoryScope preference, threaded through loadManagedMemoryContext and persistManagedAutoMemoryFacts.

Also recorded by a later audit (Memory facts never render or cite the chat they were learned from, and cloud-synced facts have no provenance field at all (MEMORY-007)): Sharpens the 'no user-visible provenance' clause: MemoryFact.sourceConversationId (memoryStore.ts:36-48,61,215-226) and Mobile's SQLite source_conversation_id ARE genuinely populated by Mobile's Local auto-consolidation, with a tested null-on-delete cleanup path — but no surface ever renders the field. MemoryEditor.tsx:250-278's list item has no 'from this chat' link and Mobile's MemoryItem.tsx never reads it either. Worse, CloudMemoryEntry (cloudMemoryStore.ts:22-42) has no conversation-reference field at all, so cloud-synced facts — the majority of real usage — lose their origin permanently. Fix: render a 'From: <conversation title>' chip when sourceConversationId is present, and add the field to CloudMemoryEntry and its wire contract.

Also recorded by a later audit (Memory suppression ('Never remember') is content-term only; there is no way to exclude an entire source (MEMORY-008, prior CAP-006)): Sharpens the 'no source suppression' clause: MemoryExclusions.tsx:1-249 is server-enforced and genuinely works, but normalizeMemoryExclusions/isMemoryExcluded (managed-memory-context-service.ts:75-135) operate purely on literal content strings with no source parameter. There is no way to say 'never learn memories from my #finance connector' beyond the existing all-or-nothing allowToolAssistedGeneration toggle. Fix: extend the exclusions model with a sources: string[] list (connector ids / project ids) alongside excludedTerms, checked in persistManagedAutoMemoryFacts against the turn's originating connector or project.

**Done when.** Memory carries an explicit scope and provenance end to end, a user can inspect, correct, exclude or suppress any source, and every surface models the same category taxonomy.

**Where.** `apps/desktop/src/features/chat/ProjectSettingsDialog.tsx:1284-1286`, `apps/desktop/src/features/memory/MemoryManager.tsx:94-103`, `packages/contracts/types/src/memory.ts`, `apps/desktop/src/stores/memoryStore.ts`

**From.** gap-audit-2026-08-08.md; capability-gaps.csv; phase4-capability-audit.md; AuditRemediationLedger.md; known-flaws.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** GAP-P1-005 Memory lacks complete project scoping and source suppression; CAP-006 Suppress an irrelevant memory source; CAP-027 Project-only memory; phase4 PP-05 Desktop project Memory tab is unscoped; PP-07 Memory and chat search controls; DEDUP-MEMORY-CATEGORY-3WAY-01

### AI-29 — The Cloud Code approval state machine is write-only — a suspended turn can never be decided or resumed

`HIGH` · ai-routing · effort M

**What.** MATCH-002, explicitly re-verified in the ledger on 2026-08-09 as still open after a prior mislabel (commit 94046227f was flagship routing-slot billing, not approvals): cloud_code_agent_loop.ts has an awaiting_approval stop reason and writes a cloud_code_agent_approvals row, but no decision path ('approved'/'rejected' transitions) exists in that module, so a suspended turn cannot resume. ExecutionPlan #38 independently confirmed and marked it BLOCKED: rows can be inserted but never decided (no SELECT or UPDATE on the table; preApproved is supplied only by tests), and closing it requires touching the agent loop and approvals service together, outside that item's declared write set. Three of four decision states are unreachable.

**Done when.** An approval written by the agent loop can be read, decided and resumed through the approvals service, so a turn suspended for approval reaches a terminal state instead of being stranded.

**Where.** `apps/web/lib/services/cloud-code-agent-loop.ts`, `apps/web/db/neon/0082_cloud_code_agent_turns.sql:102-127`

**From.** AuditRemediationLedger.md; ExecutionPlan.md

**Folded in.** MATCH-002 Cloud Code approval state machine is write-only; ExecutionPlan #38 Cloud Code approval gate write-only

### AI-37 — Durable (survives-connection-close) execution for initial AGI Work turns is off by default while CHANGELOG describes the flag as a kill-switch

`HIGH` · ai-routing · effort M

**What.** AGENTIC-WORK-003. A real durable path exists (Vercel Workflow DevKit start()) but only runs when AGI_DURABLE_INITIAL_TURNS is explicitly enabled; .env.example ships it commented out. CHANGELOG.md:328-336 calls the same flag a 'kill-switch' and states 'close the laptop and the run continues server-side' as unconditional shipped behaviour. No file proves the variable is set in production. Runs that reach a tool-approval checkpoint do become durable regardless of the flag.

**Done when.** Flip the default on now that the original startup-hang concern is handled by ordering, or rename/redocument the flag so its off-by-default behaviour is not described as a kill-switch; add a deploy-time assertion that fails loudly if unset in production.

**Where.** `apps/web/lib/workflows/durable-initial-turns.ts:1-23`, `apps/web/app/api/llm/v1/chat/completions/route.ts:516-557`, `apps/web/.env.example:219`, `CHANGELOG.md:328-336`

**From.** audit/parity-2026-08-15/gaps/domain-agentic-work.json AGENTIC-WORK-003

### AI-38 — No way to steer or redirect an active agentic run without stopping it entirely

`HIGH` · ai-routing · effort M

**What.** AGENTIC-WORK-005. A conversation with an active managed run hard-rejects any new message with HTTP 409 (route.ts:165-199). The only intervention surface, the tool-approval resume endpoint, accepts only 'approved'|'rejected' with no free-text field, so a user cannot add context or redirect scope without fully stopping the run and losing progress. Restated by sched-gap-15 (TasksPage renders a detail panel with no follow-up input anywhere) and by search-deep-research G3 (every send-path handler early-returns on isStreaming; the only interrupt during a research run is handleStopGeneration, a full cancel).

**Done when.** Add an optional `guidance: string` field to ToolApprovalResumeRequestSchema that is appended as a user turn before the tool loop resumes; surface a follow-up composer in TaskDetailPanel; consider a 'Quick answer' interrupt reusing the existing Stop plumbing for research runs.

**Where.** `apps/web/app/api/llm/v1/chat/completions/route.ts:165-199`, `packages/contracts/cloud-contracts/src/tool-approval-resume.ts:28-44`, `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:420-585`, `apps/web/features/chat/pages/WebChatPage.tsx:4238,2617,3403,3437,3519,3584`

**From.** audit/parity-2026-08-15/gaps/domain-agentic-work.json AGENTIC-WORK-005; audit/competitive-gap-2026-08-15/domains/scheduled-tasks-automation.json sched-gap-15; audit/competitive-gap-2026-08-15/domains/web-search-deep-research.json G3

**Folded in.** AGENTIC-WORK-005; sched-gap-15; dr-G3

### AI-39 — Scheduled task execution has zero tool access — no web search, code execution, connectors, MCP, files or media

`HIGH` · ai-routing · effort L

**What.** AGENTIC-WORK-007 (prior art GAP-168). executeScheduledAgent builds a single non-streaming completion with a fixed system prompt and the saved prompt and no `tools` field at all, while the system prompt itself implies tool use ('Do not claim to have performed external actions unless a tool result proves it'). A scheduled task can only produce text from the model's own knowledge, below even ChatGPT Tasks' floor. sched-gap-12 confirms there is no richer tool-using scheduled tier at any maturity, unlike Gemini's intentional two-tier split; the schedule form itself honestly states 'Web search, tools, research, files, and media generation are not available in this surface'.

**Done when.** Route scheduled execution through the same runToolLoop/tool-definition assembly used by interactive chat, gated by per-tier tool-availability rules.

**Where.** `apps/web/lib/services/scheduled-agent-executor.ts:88-135`, `apps/web/lib/services/schedule-service.ts:1127-1192`

**From.** audit/parity-2026-08-15/gaps/domain-agentic-work.json AGENTIC-WORK-007; audit/competitive-gap-2026-08-15/domains/scheduled-tasks-automation.json sched-gap-12

**Folded in.** AGENTIC-WORK-007; sched-gap-12; GAP-168

### AI-40 — Web chat never retrieves or references excerpts from the user's other past conversations at send time

`HIGH` · ai-routing · effort L

**What.** MEMORY-002. Web's memory system only injects the curated MemoryFact list; neither WebChatRuntime.ts:181-189 nor the production request-processor.ts path ever searches other conversations. /api/memory/search and /api/search exist as callable routes with zero callers from the chat send path. Mobile already ships the feature end-to-end via pastChatContext.ts's retrievePastChatContext(), wired into chatExecutionStore.ts and gated by the same preference. memory-19-gap adds that because the capability does not exist, web folds 'generate summary from history' and 'search/reference raw past chats' into one dependent toggle (CapabilitiesSection.tsx:140-149) rather than two independent dimensions. The parity matrix records the same row as Missing/Partial.

**Done when.** Port pastChatContext.ts's retrieval/fencing/scoring logic (or a server-side equivalent) into web's send path, gated by the existing memory preference and excluded for temporary chats; then expose past-chat search as an independent toggle rather than a sub-toggle of memory generation.

**Where.** `apps/web/lib/runtime/WebChatRuntime.ts:181-189`, `apps/web/app/api/memory/search/route.ts:1-66`, `apps/mobile/src/features/memory/services/pastChatContext.ts`, `apps/web/features/settings/sections/CapabilitiesSection.tsx:140-149`

**From.** audit/parity-2026-08-15/gaps/domain-memory.json MEMORY-002; audit/competitive-gap-2026-08-15/domains/memory-personalization.json memory-19-gap; docs/current/parity-implementation-matrix.md (Reference chat history row)

**Folded in.** MEMORY-002; memory-19-gap

### AI-58 — No developer-session remote-control protocol exists end to end on any surface

`HIGH` · ai-routing · effort XL

**What.** frontend-experience-contract.md §13: Remote control is Web=Absent, Desktop='Host/companion UI not mounted', Mobile='Static/feature-off', CLI='Host transport missing', VS Code='Host transport missing', Chrome='Native bridge is not Code remote control'; §14 P0 items 2-3 track defining one remote protocol from a CLI/Desktop host to a Mobile/Web projection and replacing Mobile's static Code shell. The parity matrix's founder-decision list records the same dependency chain: MS-3 (Code sessions — 'Build the contract, not a placeholder screen'), MS-18 (promote session keys to revocable device grants), and CAP-049 (Desktop dispatch/scheduled-routines product) are all blocked on it. Distinct from MOB-12, which is the fire-and-forget defect inside the existing dispatch path.

**Done when.** Define one host-relay/remote-control contract (host transport, device grants with revocation, projection client) before building any dependent surface; MS-3, MS-18 and CAP-049 all unblock from it.

**Where.** `apps/mobile/app/(app)/companion/index.tsx`, `apps/desktop/src/features/mobile-companion/`

**From.** docs/current/frontend-experience-contract.md §13 Remote control row, §14 P0 items 2-3; docs/current/parity-implementation-matrix.md MS-3, MS-18, CAP-049

**Folded in.** frontend-P0-2; frontend-P0-3; MS-3; MS-18; CAP-049

### CLI-04 — CLI provider fallback hardcodes the OpenAI chat-completions URL, bypassing trust mode and the registry

`HIGH` · cli · effort M

**What.** A fallback literal bypasses the registry/adapter path and could therefore bypass trust mode, the selected base URL, a proxy, or a region constraint — the exact class of defect that makes a Local-mode guarantee unenforceable.

**Done when.** Resolve the fallback endpoint through the provider registry and assert the trust mode before any request.

**Where.** `apps/cli/src`

**From.** AuditRemediationLedger.md (HARD-003)

### CONN-01 — The connector catalog is nonfunctional by default: branded connectors 501 and the OAuth registry ships with zero providers

`HIGH` · integrations · effort XL

**What.** Verified: apps/web/lib/connectors/oauth-registry.ts states in its own header that it 'SHIPS WITH ZERO PROVIDERS ON PURPOSE' and a provider becomes connectable only when an operator supplies credentials — this is deliberate design, but the catalog still advertises branded connectors in the present tense while POST /api/connectors returns 501 for them. Only GitHub and custom MCP are genuinely connectable. Mobile shows the same reality as ~19 of 21 providers giving an honest 'coming soon' alert. There is no canonical capability registry, no contract tests for authorize→callback→storage→discovery→action→disconnect, and no guard against present-tense copy for non-production connectors. Connector descriptions also may not match the actual adapters and actions.

Also recorded by a later audit (Connector catalog lists 89 providers but the large majority cannot be connected in a stock deployment (EXTENSIBILITY-006)): Quantifies the register entry: connecting any of 89 catalog ids requires the GitHub App flow, a user-defined custom MCP connector, or the operator having set per-provider OAuth env vars — no descriptor ships by default for any well-known provider. POST /api/connectors 501s with 'Connector authorization is not implemented for this provider' for every id that is not GitHub or custom MCP, and the route's own comment documents the missing 55+-id allowlist. Refs: apps/web/app/api/connectors/route.ts:1-19,114-120,384-429; oauth-registry.ts:144-166,225-231. Concrete first step: register first-party OAuth apps for 4-6 highest-usage providers (Slack, Notion, Google Drive, Linear) and ship their client ids in the default deployment config.

Also recorded by a later audit (Connectors/apps/plugins must support directory, categories, search, OAuth/custom MCP, per-tool permissions, per-conversation loading and admin controls (source-of-truth.md GAP-7)): Preserves GAP-7 as the trail-back id for the connector-catalog P0. Its sub-clauses now map to: CONN-01 (directory/OAuth), CONN-06 (per-tool permissions), CONN-13/CONN-22 (per-conversation loading and auto-invoke), CONN-19 (admin/org controls), CONN-25 (categories/search).

**Done when.** Drive catalog availability from a capability registry so unconfigured providers are labelled unavailable rather than advertised, register the launch OAuth apps, and add a full connector-lifecycle contract test plus a present-tense-copy guard.

**Where.** `apps/web/lib/connectors/oauth-registry.ts`, `apps/web/app/api/connectors/route.ts`

**Blocked by.** founder must register provider OAuth apps (FoundersAssistance.md #6)

**From.** AuditRemediationLedger.md (CRIT-001, DOC-013); docs/current/gap-audit-2026-08-08.md (GAP-P1-001); docs/agent-context/known-flaws.md (MOBILE-CONNECTORS-501); FoundersAssistance.md (#6, #22); audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** GAP-P1-001: Connector breadth is mostly operator configuration, not an out-of-box product; MOBILE-CONNECTORS-501: ~19 of 21 connector providers show only an honest 'coming soon' alert; DOC-013: Connector descriptions may not match actual adapters/actions

### CONN-03 — The MCP client-metadata document 404s in production, blocking first authorization for eight CIMD connectors

`HIGH` · integrations · effort S

**What.** airtable, canva, huggingface, linear, notion, posthog, sentry and todoist advertise client_id_metadata_document_supported and fetch AGI's published URL as client_id. The route exists in source at apps/web/app/.well-known/oauth-client-metadata/route.ts and works on localhost, but 404s in production because the branch has not shipped; linear, sentry, canva and todoist returned invalid_client when probed — a symptom of the missing deploy, not the flow.

**Done when.** Ship the branch, confirm the well-known URL returns 200 with a matching client_id, complete one Linear consent end to end, and never change MCP_CLIENT_METADATA_PATH afterwards since it is the recorded client identity for all prior consents.

**Where.** `apps/web/app/.well-known/oauth-client-metadata/route.ts`

**Blocked by.** deploying the branch to production (FoundersAssistance.md #24)

**From.** FoundersAssistance.md (#24); ExecutionPlan.md (MCP connectors section)

### CONN-07 — Custom MCP connectors are invisible on Desktop, and desktop Local mode runs an entirely separate connector system

`HIGH` · integrations · effort L

**What.** Full CRUD on custom connectors exists on web only; Desktop's type structurally excludes 'custom' as a source (mobile's ConnectorSource union now includes it, so the mobile half appears addressed). Worse: Desktop's default Local mode runs a separate device-local Tauri MCP connector system with its own OAuth storage that never reads or writes the shared user_connectors/github_installations tables every other surface uses — so Local-mode connectors are invisible to Cloud/BYOK mode and vice versa. Requires a founder trust-boundary call.

**Done when.** Decide the trust boundary for Local-mode connectors, then either bridge the two stores with an explicit consent step or state the split in the product; add 'custom' to the desktop connector source type either way.

**Where.** `apps/desktop/src/api/cloudConnectors.ts`, `apps/desktop/src/stores/connectorsStore.ts`, `apps/desktop/src-tauri/src/sys/commands/mcp_oauth.rs`, `apps/mobile/services/connectors.ts`

**Blocked by.** founder trust-boundary decision on Local vs Cloud connector storage

**From.** docs/agent-context/known-flaws.md (CUSTOM-CONNECTORS-DESKTOP-MOBILE-GAP-01, DESKTOP-CONNECTOR-LOCAL-CLOUD-SPLIT-01)

**Folded in.** DESKTOP-CONNECTOR-LOCAL-CLOUD-SPLIT-01: Local-mode connectors invisible to Cloud/BYOK mode

### CONN-09 — MCP OAuth discovery reportedly implements only pre-registration; contradicted by later CIMD and DCR evidence

`HIGH` · integrations · effort M · **unclear**

**What.** One source states that of the three client-registration mechanisms only pre-registration is implemented, so a user can never add an MCP server the founder has not personally onboarded. SOURCES DISAGREE: the later FoundersAssistance record shows CIMD is implemented and merely undeployed (CONN-03) and DCR works for 15 providers and is refused by six (CONN-04). Reconcile before acting.

**Done when.** Confirm the current state of CIMD and DCR support against the deployed code, then close or restate this item; if a gap remains, complete the missing mechanism.

**Where.** `apps/web/lib/connectors/`, `apps/web/app/api/connectors/oauth/`

**From.** ExecutionPlan.md (TODO MCP OAuth discovery); FoundersAssistance.md (#22, #24, #25)

### CONN-17 — No surface offers automatic (progressive-disclosure) skill invocation — a working desktop matcher has zero callers

`HIGH` · integrations · effort M

**What.** EXTENSIBILITY-004 / CPS-01. Desktop has a real token-matching heuristic, skill_match_for_message (skills.rs:342-414), exposed to the frontend as matchForMessage (skillMarketplaceStore.ts:247,348-354), but grepping the entire desktop frontend — including features/chat and features/v3 — finds only its own interface declaration and implementation; no chat component ever calls it. Web's tool loop requires an explicit client-supplied skill_name and errors if absent, with no server-side relevance matching at all.

**Done when.** Wire the existing matchForMessage call into the desktop chat composer (dismissible chips before send) as the smallest end-to-end slice; extend the same relevance signal to web's request-processor as a follow-up.

**Where.** `apps/desktop/src-tauri/src/sys/commands/skills.rs:342-414`, `apps/desktop/src/stores/skillMarketplaceStore.ts:247,348-354`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:316-329,461-473,2272-2322`

**From.** audit/parity-2026-08-15/gaps/domain-extensibility.json EXTENSIBILITY-004; audit/competitive-gap-2026-08-15/domains/connectors-plugins-skills-mcp-custom-assista.json CPS-01; audit/parity-2026-08-15 EXTENSIBILITY-004; audit/competitive-gap-2026-08-15 CPS-01

**Folded in.** EXTENSIBILITY-004; CPS-01; No surface offers automatic (progressive-disclosure) skill invocation — a working desktop matcher exists with zero callers

### DESK-15 — Desktop and CLI each hand-roll a separate agent, MCP and LLM harness with no shared crate

`HIGH` · desktop · effort XL

**What.** Desktop and CLI share exactly one Cargo dependency. The agent/tool-execution loop, the MCP client (~11.5K LOC desktop vs ~5.7K CLI) and the LLM provider clients are independently implemented twice, unlike reference architectures that share one core. Compounding inside desktop alone: the main chat loop feeds tool failures back for self-correction with iteration and wall-clock caps, while the separate AGICore::achieve_goal engine reached via a different path behaves differently, and parity/safety across both is unverified. Overlaps the CLI slice.

**Done when.** Extract one agent-harness crate (loop, MCP client, provider clients) consumed by both binaries, then converge the two desktop chat engines onto it or delete the second.

**Where.** `apps/desktop/src-tauri/src/core/agi`, `apps/cli/src/agent`, `apps/desktop/src-tauri/src/core/agi/core.rs`, `apps/desktop/src-tauri/src/sys/commands/chat/send_message_execution.rs`

**From.** docs/agent-context/known-flaws.md (DESKTOP-CLI-HARNESS-FRAGMENTATION-01, DESKTOP-AGI-LOOP-VERIFICATION-01, XSURF-PROVIDER-STREAM-DUP-01)

**Folded in.** DESKTOP-AGI-LOOP-VERIFICATION-01: divergent tool-failure/self-correction behavior between desktop chat engines; XSURF-PROVIDER-STREAM-DUP-01: desktop Rust provider/stream unification still pending

### DESK-16 — Desktop provider endpoints and image model IDs are hardcoded outside the registry; image generation calls three nonexistent model IDs

`HIGH` · desktop · effort L · **unclear**

**What.** conversation_summarizer.rs and sibling modules bypass the canonical default_base_url()/provider registry; a repo-wide sweep found 36 first-party host literals outside registries and no endpoint-literal guard exists (only check-no-hardcoded-models.sh). SOURCES DISAGREE: ExecutionPlan #55 records a fix (d16a0df18) for llm_router.rs, completion.rs, llm_tools.rs, models_config.rs, voice.rs and perplexity.rs while HARD-001/HARD-005 remain open for the summarizer and the sweep. The image-model half was REVERTED — resolve_image_model() still falls through to a literal wire ID and ImageProvider::GoogleImagenLite selects nothing, deliberately deferred until the provider-registry work lands so a second unused copy is not created. A related repo-wide gap: banned-provider and retired-model removal is complete in the registry but desktop Rust transports and CLI discovery mappings still reference removed providers.

**Done when.** Land the provider-registry resolution first, then repoint resolve_image_model and the summarizer at it, and add an approved-declaration-file guard rejecting new provider host literals plus a centralized denylist for removed providers.

**Where.** `apps/desktop/src-tauri/src/core/agi/conversation_summarizer.rs`, `apps/desktop/src-tauri/src/integrations/api_integrations/image_gen.rs:241-245,371-375`, `apps/desktop/electron/config.ts:69`

**From.** AuditRemediationLedger.md (HARD-001, HARD-002, HARD-005, HARD-018); ExecutionPlan.md (items #54, #55, #61); docs/agent-context/known-flaws.md (PROVIDER-REMOVAL-REPO-WIDE-01)

**Folded in.** HARD-001: Desktop conversation summarizer hardcodes OpenAI endpoints; HARD-002: Perplexity and Veo hosts are duplicated; HARD-005: Repository-wide provider-endpoint sweep never run; 36 hardcoded host literals; Image generation calls three model IDs that do not exist in the catalog (REVERTED); Provider hostnames retyped across web routes and both Rust binaries (BLOCKED); PROVIDER-REMOVAL-REPO-WIDE-01: banned-provider/retired-model removal not repo-wide

### INFRA-26 — Context, payloads and producer rates are not bounded, so nothing applies backpressure

`HIGH` · infra/ci · effort L

**What.** SCALE-IO-006: no enforced limits for history, tool schemas, retrieved chunks, SSE queues, browser snapshots, logs or artifacts. SCALE-IO-007: producers may overwhelm UI streams, queues, WebSockets/SSE, DB writers or external providers with no backpressure. A concrete instance is recorded in ExecutionPlan #48: the desktop 'Max iterations' slider (1-20) fed numAgents with no clamp so it actually spawned that many concurrent agents — fixed, but it illustrates that bounds are per-site rather than systemic. HARD-012 shows the pagination arm: page size 50 is repeated across Desktop/Web/Mobile while run-history drifts to 20, with no resource-specific pagination contract carrying server maximums.

**Done when.** Each stream, queue, context assembly and payload has an enforced ceiling and a defined behaviour at that ceiling, so a fast producer degrades predictably instead of exhausting a consumer.

**From.** AuditRemediationLedger.md; ExecutionPlan.md

**Folded in.** SCALE-IO-006 Context and payloads are not bounded; SCALE-IO-007 No backpressure for producers; HARD-012 Page size repeated across surfaces

### INFRA-28 — Durable job execution has no retries, backoff, leases, dead-letter path or fair concurrency

`HIGH` · infra/ci · effort XL

**What.** GAP-P1-002 / CAP-039: the job queue is tracked as implemented-but-unwired and explicitly missing retries, backoff, leases and dead-letter handling for cloud agent runs, schedules, triggered tasks, refresh jobs, exports and long-running artifact or research work. VERIFIED: apps/desktop/src/stores/agentTaskStore.ts has no retry, backoff, lease or dead-letter logic — only a one-time 'runtime ended' terminal message. SCALE-CON-004: worker concurrency is not bounded per provider, tenant, user or task type, so no fair scheduling exists. This is the substrate AI-14 (checkpoints), AI-28 (triggers) and INFRA-33 (schedules) all depend on.

**Done when.** One durable queue owns background work with leases, bounded retries and backoff, a dead-letter path, and per-tenant and per-provider concurrency limits, so a failed job is visibly retried or parked rather than lost.

**Where.** `apps/desktop/src/stores/agentTaskStore.ts`

**From.** gap-audit-2026-08-08.md; capability-gaps.csv; AuditRemediationLedger.md

**Folded in.** GAP-P1-002 Durable job execution lacks a complete retry/DLQ model; CAP-039 Retrying job queue with dead-letter handling; SCALE-CON-004 Worker concurrency not bounded

### INFRA-29 — Mutations lack idempotency keys, expected-revision leases and out-of-order reconciliation

`HIGH` · infra/ci · effort L

**What.** SCALE-CON-002: chat sends with side effects, approvals, schedules, payments, webhooks, connector writes, file completion and notifications need idempotency keys. SCALE-CON-003: duplicate workers or stale clients can overwrite newer task, subscription, approval or artifact state with no expected-revision or lease. SCALE-CON-008: no sequence or revision rules are confirmed for sync, webhooks, push, tools, streams or task updates. The red-team review of CAP-052 shows how weak the existing keying is: managed-usage idempotency keys are validated for shape only (VERIFIED IDEMPOTENCY*KEY_PATTERN = /^[A-Za-z0-9.*:-]{8,128}$/ at managed-usage-request-service.ts:14), so a caller minting a fresh key per loop iteration bills each time. Billing overlap: BIZ-008 (checkout not proven idempotent) and BIZ-024 (refund-delta correctness under replay) are the money-side instances.

**Done when.** Every mutation entry point carries an idempotency key bound to its semantic operation, writes are guarded by an expected revision or lease, and out-of-order events reconcile by sequence rather than by arrival.

**Where.** `apps/web/lib/services/managed-usage-request-service.ts:14`

**From.** AuditRemediationLedger.md; cap-052-security-review

**Folded in.** SCALE-CON-002 Idempotency keys not added to all mutation entry points; SCALE-CON-003 No expected-revisions/leases; SCALE-CON-008 Out-of-order events not reconciled; cap-052 RT-4 idempotency key format is shape-only

### INFRA-30 — Cancellation does not propagate from the client stop to downstream work

`HIGH` · infra/ci · effort M

**What.** SCALE-CON-005: a client stop may not reach model streams, tools, subprocesses, browser sessions, uploads or child agents. ExecutionPlan records a concrete, still-open instance from a founder report: /api/media/video/cancel/route.ts is fully implemented with its own test suite (cancelRequestedAt, provider cancel attempts, requested/unconfirmed state machine) but a grep across apps/ and packages/ finds no client caller, while ChatComposerNew.tsx actively suppresses the Stop button and disables the textarea in video mode — making a 1-2 minute generation completely uninterruptible on both Web and Mobile. ExecutionPlan #21 shows the billing consequence of the reverse case: a client disconnect mid-stream once settled as 'failed' and billed zero (since fixed).

**Done when.** A stop from any client cancels the whole downstream chain — model stream, tools, subprocesses, browser sessions, uploads and child agents — and every long-running generation exposes a working cancel control.

**Where.** `apps/web/app/api/media/video/cancel/route.ts`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2234,2245`

**From.** AuditRemediationLedger.md; ExecutionPlan.md

**Folded in.** SCALE-CON-005 Cancellation propagation incomplete; ExecutionPlan: no way to stop a video generation

### INFRA-31 — Four independent retry implementations and no protection against retry storms or refresh stampedes

`HIGH` · infra/ci · effort L

**What.** HARD-011: four HTTP retry implementations independently default to three attempts, with no single retry policy library providing idempotency awareness, status/error classification, jittered backoff, Retry-After handling, a retry budget, cancellation or telemetry — so unsafe writes may be retried without idempotency protection (compounding INFRA-29). SCALE-CON-006: no distributed locks, single-flight, jitter, circuit breakers or retry budgets are confirmed, so retry storms and token-refresh stampedes are unprevented. ExecutionPlan's mobile audit adds that mobile hand-rolls its cloud calls instead of using createManagedCloudChatClient, so retry/backoff, error mapping and save idempotency are duplicated or absent and will drift from Web and Desktop.

**Done when.** One retry policy library — with idempotency awareness, error classification, jittered backoff, Retry-After, a budget, cancellation and telemetry — is the only retry path, and every surface consumes it rather than hand-rolling one.

**From.** AuditRemediationLedger.md; ExecutionPlan.md

**Folded in.** HARD-011 Four HTTP retry implementations; SCALE-CON-006 Retry storms/token-refresh stampedes not prevented; ExecutionPlan: Mobile hand-rolls its cloud calls

### UI-83 — Deep Research progress/plan UI and saved-report retrieval exist only on web; desktop parses the events and renders nothing, mobile and the extension have no parser at all

`HIGH` · ui · effort L

**What.** SEARCH-RESEARCH-002: the x_research_status/x_research_plan SSE contract and GET /api/research/reports are consumed by exactly one client. Desktop's cloudStreamDeltas.ts actually parses x_research_status into state, but zero desktop components read that field — the data is captured and never rendered. Mobile's 'Deep research' toggle sends research: true but toolCallAccumulator.ts has no handling for the plan/status events at all. None of the three non-web surfaces ever call the reports endpoint, so a report started elsewhere is only readable by opening the web app. Complements WEB-15, which covers the web-side research defects.

**Done when.** Wire desktop's already-parsed research state into a compact progress indicator (phase plus counts), and extend GET /api/research/reports calls to Desktop and Mobile.

**Where.** `apps/desktop/src/runtime/cloudStreamDeltas.ts:300,501-534,677`, `apps/web/app/api/research/reports/route.ts:1-76`, `apps/mobile/src/features/chat/utils/toolCallAccumulator.ts`

**From.** audit/parity-2026-08-15 SEARCH-RESEARCH-002; prior art CAP-045; audit/parity-2026-08-15/gaps/domain-search-research.json SEARCH-RESEARCH-002; audit/parity-2026-08-15 — SEARCH-RESEARCH-002 (CAP-045)

**Folded in.** Deep Research progress/plan UI and saved-report retrieval exist only on web; desktop parses the events and renders nothing, mobile/extension have no parser; Deep Research progress/plan UI and saved-report retrieval exist only on web; desktop parses the events and renders nothing

### UI-85 — No surface offers genuinely full-duplex, interruptible spoken conversation — every voice implementation is turn-based dictation or absent

`HIGH` · ui · effort XL

**What.** VOICE-MEDIA-004 (prior strategic framing P2-003): web's settings page states outright it is 'push-to-talk dictation, not a live voice conversation'; Chrome and Desktop offer browser-Speech-API dictation into the text field; Mobile has a real spoken-conversation UI but it is strictly turn-based (full utterance -> chat pipeline -> TTS readback), cannot be interrupted mid-reply, and does not listen while speaking; VS Code has nothing. This is the cross-surface umbrella above the per-surface entries WEB-23, DESK-13/DESK-97, MOB-26 and EXT-32.

**Done when.** Correctly deferred as a separate product program after the core task engine is reliable, not a single actionable slice; keep filed so the cross-surface gap stays visible rather than being closed by per-surface dictation fixes.

**Where.** `apps/web/app/settings/voice/page.tsx:38-62`, `apps/mobile/app/(app)/voice.tsx`, `apps/extension/src/features/side-panel/voice.ts:16-58`

**From.** audit/parity-2026-08-15 VOICE-MEDIA-004; prior art P2-003

### AI-02 — Retired and hardcoded model IDs persist in directories the model-ID guard never scans

`MEDIUM` · ai-routing · effort M

**What.** DOC-006 was closed for examples/multi-provider-chat.ts (a retired Anthropic compact-model ID guaranteeing 404s, repointed 2026-08-09) but recorded two residues: the class guard's SCAN_ROOTS excludes examples/ and tools/, so this drift can recur undetected, and tools/skill-vetting still hardcodes retired Anthropic IDs in its own bundled registry. VERIFIED: tools/skill-vetting/src/skillspector/providers/anthropic/provider.py still exists, and scripts/check-no-hardcoded-endpoints.mjs SCAN_ROOTS confirms apps/packages/services/crates/shared only. MODELS-CURATION-DRIFT-01 records models.json hand-edited out of sync with its curation source for months, fixed then RECURRED once then re-fixed — evidence the class recurs whenever a path is unguarded. CLAUDE.md's critical rules forbid concrete catalog model IDs outside canonical registry sources and generated mirrors.

Also recorded by a later audit (Model dropdown still carries hardcoded model drift in some tests and providers (parity-implementation-matrix.md, Models/Providers/Routing)): Independent confirmation from a second document that the model-ID guard's blind spots persist: 'shared model catalog and Desktop popover exist; hardcoded drift still exists in some tests/providers'. Consistent with AI-02's finding that retired and hardcoded model IDs persist in directories the guard never scans.

**Done when.** Model-ID and marketing-model guards scan every directory that can ship or influence a provider call — including examples/ and tools/ — so a retired ID cannot survive anywhere outside the canonical registry and its generated mirrors.

**Where.** `tools/skill-vetting/src/skillspector/providers/anthropic/provider.py:45,47`, `tools/skill-vetting/src/skillspector/anthropic_proxy/provider.py:209`, `scripts/check-no-hardcoded-model-ids.mjs`, `scripts/check-marketing-models.mjs`

**From.** AuditRemediationLedger.md; known-flaws.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** DOC-006 Fake/deprecated model IDs and release names in developer demos (residue); MODELS-CURATION-DRIFT-01 recurrence risk

### AI-03 — Model registry still names a deleted google-batch adapter, and preview-only batch-tier code has no backend or caller

`MEDIUM` · ai-routing · effort S

**What.** DOC-001 residue: packages/ai/model-registry/catalog/harnesses.json names "adapter":"desktop-google-batch" pointing at a module deleted with examples/google-batch-api.ts, and that value is mirrored into 3 generated registries. VERIFIED still present at harnesses.json:142. CAP-016 (BatchTier) independently says to remove preview-only Google batch code unless a real backend, pricing and caller are selected. The allowlist arm was already clean (grep -c google_batch on apps/desktop/wiring-allowlist.json returned 0), so only the catalog metadata and the preview code remain.

**Done when.** The catalog names no adapter that has no module behind it — either a real batch backend with pricing and a caller exists and is selectable, or the harness entry and its generated mirrors are removed together with the preview code.

**Where.** `packages/ai/model-registry/catalog/harnesses.json:142`

**From.** AuditRemediationLedger.md; capability-gaps.csv

**Folded in.** DOC-001 Stale Google Batch documentation/allowlist entries (residue); CAP-016 Provider batch tier

### AI-05 — Catalog schema has no realtime/duplex audio model type, so realtime voice cannot be modelled at all

`MEDIUM` · ai-routing · effort L

**What.** VOICE-REALTIME-FAMILY-ABSENT (founder-gated): ModelType has no 'realtime' member, so adding realtime voice is a schema change across the TS union, the registry schema, and both generated Rust registries; it is additionally blocked on a realtime-provider and echo-cancellation decision. PP-20 restates the product-side consequence: whether the product is turn-based or true full-duplex is undecided, and if realtime is promised then barge-in, VAD, reconnect, session lease and transcript reconciliation are all unbuilt.

**Done when.** Either the catalog gains a realtime model family carried consistently through the TS union, registry schema and both generated Rust registries with a named provider, or all realtime/full-duplex voice claims are removed from product copy.

**Where.** `packages/contracts/types/src/model-catalog.ts`

**Blocked by.** Founder decision on a realtime voice provider and echo-cancellation approach

**From.** known-flaws.md; AuditRemediationLedger.md

**Folded in.** VOICE-REALTIME-FAMILY-ABSENT; PP-20 realtime voice scope undecided

### AI-06 — The only model served on the OpenAI TTS path carries a Deprecated badge with no published successor

`MEDIUM` · ai-routing · effort S

**What.** VOICE-OPENAI-TTS-DEPRECATED-NO-SUCCESSOR: the model is marked deprecated:true (non-selectable) but retained because removing it leaves the OpenAI TTS path with no model at all. The entry raises an unresolved product question — prefer ElevenLabs or local Piper rather than waiting for a shutdown date to appear.

**Done when.** The OpenAI speech path either resolves a non-deprecated model from the catalog or is removed, so no shipped path depends on a model whose vendor has announced its end.

**Blocked by.** Product decision between an OpenAI successor, ElevenLabs, or local Piper

**From.** known-flaws.md

### AI-07 — Local-provider identity is hardcoded to 'ollama', misclassifying LM Studio, llama.cpp and vLLM

`MEDIUM` · ai-routing · effort M

**What.** HARD-014 triage (2026-08-09): 6 production provider==='ollama' comparisons remain and there is no local-provider capability interface, so users running LM Studio, llama.cpp or vLLM are treated as having no local provider at all. DESKTOP-LOCAL-PROVIDER-TRUST-CLASSIFICATION-DRIFT-01 records the trust-boundary half: LOCAL_PROVIDER_IDS in packages/contracts/types/src/model-catalog.ts was never updated when those runtimes were added, so getProviderSurface misclassifies them. Sources partially disagree — ExecutionPlan #64 claims the harnesses.json trustModes arm was fixed 2026-08-09 (ac20a2962) while the ledger's provider-comparison arm remains open, and full local-runtime UI already ships for all three runtimes (LocalRuntimeSettings.tsx). Overlaps the security slice because misclassification here is a trust-boundary error, not only a routing one.

**Done when.** Local runtimes are described by a capability interface rather than a provider-id string, so trust-surface classification and routing eligibility are correct for every local runtime the product already ships UI for.

**Where.** `packages/contracts/types/src/model-catalog.ts`, `apps/desktop/src/features/settings/tabs/ModelsKeys/LocalRuntimeSettings.tsx:28,41,49,57`

**From.** AuditRemediationLedger.md; known-flaws.md; ExecutionPlan.md

**Folded in.** HARD-014 Local provider IDs are hardcoded to 'ollama'; DESKTOP-LOCAL-PROVIDER-TRUST-CLASSIFICATION-DRIFT-01

### AI-10 — The ExecutionPlan/CPST router contract is fully specified with zero implementation

`MEDIUM` · ai-routing · effort XL

**What.** PLAN.md 2026-08-05: 'THE ROUTER GETS AN OBJECTIVE — EXECUTIONPLAN AND CPST ARE SPECIFIED, NOTHING IS IMPLEMENTED... no code, schema, curation, or generated file was touched.' Eight open questions are recorded as unknown, including which of two already-diverged resolvers is canonical (OQ-1, see AI-08) and what identifies a model snapshot. Four dependent slices are queued and none started: (1) CPST telemetry fields — taskOutcome, retries, fallbackUsed, verifierResult, routePlanId, taskFamily — added to managed_usage_requests usage jsonb as a pass-through at existing reserve/finalize call sites, with a two-week non-null-rate exit criterion; (2) rules-based eligibility plus a session-sticky escalation-only Pareto router; (3) an eval corpus (see AI-11); (4) shadow-mode execution logging preferred routes without acting on them.

**Done when.** Routing decisions are driven by a declared objective with measured outcomes: telemetry lands first, then eligibility and Pareto selection, then shadow-mode comparison — each stage gated on the previous one producing real data rather than on the spec alone.

**Where.** `docs/design/execution-plan-contract-and-cpst-2026-08-05.md`, `apps/web/db/neon/0056_managed_usage_request_lifecycle.sql`, `apps/web/lib/services/managed-usage-accounting-service.ts`, `packages/ai/routing/src/model-switch-cache.ts`, `packages/ai/model-registry/catalog/routing-policies.json`

**From.** PLAN.md

**Folded in.** PLAN.md follow-on slice 1 CPST telemetry fields; PLAN.md follow-on slice 2 rules-based eligibility and Pareto router; PLAN.md follow-on slice 4 shadow-mode router execution

### AI-15 — Anthropic pause_turn stop reason is mismapped to end_turn, telling callers a suspended turn completed cleanly

`MEDIUM` · ai-routing · effort S

**What.** PROVIDER-ANTHROPIC-PAUSE-TURN-01: mapStopReason in packages/ai/providers/anthropic/src/stream.ts has no case for pause_turn — a resumable server-tool pause — so it falls through to 'end_turn' and every caller is told the turn finished when it did not.

**Done when.** Every provider stop reason maps to a distinct domain value, so a resumable pause is surfaced as resumable rather than silently reported as completion.

**Where.** `packages/ai/providers/anthropic/src/stream.ts`

**From.** known-flaws.md

### AI-16 — Gemini thought-signature continuity across tool loops is mitigated but unresolved

`MEDIUM` · ai-routing · effort M

**What.** GEMINI-FUNCTIONCALL-THOUGHT-SIGNATURE-01 (marked mitigated): Gemini strictly validates thoughtSignature on replayed functionCall parts, so a tool-loop continuation without it 400s. The workaround is in place but real-signature continuity across the OpenAI-compatible message thread remains open, meaning the compatibility layer still cannot carry a Gemini reasoning signature faithfully.

**Done when.** The OpenAI-compatible message thread carries Gemini thought signatures through tool-loop continuations, so replayed functionCall parts validate on the real signature rather than on a workaround.

**Where.** `packages/ai/providers/google/src/translate.ts`, `packages/ai/providers/google/src/stream.ts`

**From.** known-flaws.md

### AI-21 — Runtime profiles resolve zero candidates for desktop local-chat and zero selectable models for desktop cloud-chat

`MEDIUM` · ai-routing · effort M

**What.** DESKTOP-LOCAL-CHAT-EMPTY-HARNESS: the registry runtimeProfile desktop/local-chat has allowedHarnessIds:[] with status 'partial', so the Auto strategy under a Local boundary yields zero candidates at the auto-policy step — correct fail-closed behaviour, but no local harnesses are actually wired and no fallback order is documented. WEB-PREEXISTING-TEST-FAILURES-01 residual (c) records the sibling defect on the other profile: web-search-model-coverage.test.ts's 'non-empty roster' failure traces to a desktop-surface catalog mapping gap where the desktop/cloud-chat surface returns 0 selectable models for every tier.

Also recorded by a later audit (Local model mode: Desktop needs a complete UX (parity-implementation-matrix.md, Models/Providers/Routing)): Confirms the register's runtime-profile finding from the product side: 'CLI/provider dispatch and mobile local gates exist; Desktop needs complete UX'. Pairs with DESK-31 (no installed Local model is certified for Desktop Local Tasks) — the profile resolving zero candidates and the missing UX are two views of the same unshipped surface.

**Done when.** Every shipped runtime profile resolves at least one eligible harness and model for every tier it is offered to, and a profile that legitimately has none is not presented as an available surface.

**Where.** `apps/web/__tests__/web-search-model-coverage.test.ts`

**From.** known-flaws.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** DESKTOP-LOCAL-CHAT-EMPTY-HARNESS; WEB-PREEXISTING-TEST-FAILURES-01 residual (c)

### AI-22 — Media-generation model and aspect-ratio options are advertised beyond what the providers actually deliver

`MEDIUM` · ai-routing · effort M

**What.** phase4 PP-18 (SHIP): ChatComposerNew.tsx:248-255 maps 3:4 and 9:16 both to 1024x1792 and 4:3/16:9 both to 1792x1024, and the Google path re-derives ratio purely from width>height, so 'Portrait 3:4' silently produces a 9:16 image and 'Landscape 4:3' produces 16:9 with no notice — 6 advertised ratios collapse to 3 actual sizes. phase4 PP-19 (SHIP): VIDEO_MODELS filters only on status==='deprecated', not on availability, so a preview-availability Google video model renders as pickable and then 400s immediately with 'Unknown or unavailable video model'. PP-19 also records that advertised aspect ratios are not all reachable and that video task state lives in process-local maps rather than durable tenant-scoped storage.

**Done when.** The composer offers exactly the ratios and models the resolved provider can serve, derived from catalog capability metadata, so a selectable option never silently produces something else or fails on submit.

**Where.** `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:248-255,309-315`, `apps/web/app/api/media/image/generate/route.ts:482-487`, `apps/web/app/api/media/video/generate/route.ts:162`

**From.** phase4-capability-audit.md; AuditRemediationLedger.md

**Folded in.** phase4 PP-18 aspect-ratio labels mislabeled; phase4 PP-19 preview-only video model selectable; PP-19 advertised aspect ratios not all reachable

### AI-27 — Connected files are not a synchronized knowledge source — no revision, permissions, cursor or tombstone state

`MEDIUM` · ai-routing · effort XL

**What.** GAP-P1-004 / CAP-018: connected files and sources lack persisted revision/ETag, ownership, permissions, sync cursor and status, content hash, ingestion version and tombstone state; there is no incremental sync, permission-aware ingestion, reindexing or deletion propagation. This is the ingestion half of the retrieval gap in AI-12, and its deletion-propagation arm overlaps the compliance slice's erasure work (SCALE-GROW-002).

**Done when.** A connected source is a tracked object with revision, permissions, sync cursor and tombstone state, so ingestion is incremental and permission-aware and a deletion upstream propagates to every index that saw it.

**From.** gap-audit-2026-08-08.md; capability-gaps.csv

**Folded in.** GAP-P1-004 Connected files are not a complete synchronized knowledge source; CAP-018 Synchronized connected files

### AI-28 — Condition-triggered and cloud-triggered automation lacks an authenticated durable trigger path

`MEDIUM` · ai-routing · effort L

**What.** GAP-P1-003 bundles CAP-007 (condition-triggered monitoring tasks, needing durable schedules extended with observation state and change-only notification) and CAP-044 (cloud-triggered tasks, needing a durable authenticated trigger path instead of localhost and type-only variants): authenticated durable triggers for webhooks, connector events, file and DB changes, and GitHub events do not exist. phase4 PP-21 shows the desktop equivalent is worse than absent — TriggerRegistry::start(), which spawns the cron poll loop and webhook server, has zero non-test callers (its only call site is inside a #[cfg(test)] module at triggers.rs:1425, VERIFIED per the audit), so a user creating a Cron or Webhook trigger sees a green 'Active' badge and it never fires once; triggers additionally live in an in-memory HashMap with no persistence, so all are lost on restart; and with app_handle None the file-watcher path logs 'cannot spawn agent' yet still returns Ok(()), recording success:true for a run that did nothing.

**Done when.** A created trigger either runs — through a durable, authenticated, persisted trigger path with an honest execution log — or it cannot be created, so no UI ever shows an Active badge for a trigger with no loop behind it.

**Where.** `apps/desktop/src-tauri/src/core/agent/triggers.rs:415-440,583-586,628-643,1261,1425`, `apps/desktop/src-tauri/src/lib.rs:1150-1152`

**From.** gap-audit-2026-08-08.md; capability-gaps.csv; phase4-capability-audit.md

**Folded in.** GAP-P1-003 Cloud-triggered and condition-triggered automation is incomplete; CAP-007 Condition-triggered monitoring tasks; CAP-044 Cloud-triggered tasks; phase4 PP-21 Desktop Cron/Webhook triggers can never fire

### AI-30 — AGI Work has no durable pause/resume, no clarification round-trip, and a single-threaded cloud loop

`MEDIUM` · ai-routing · effort XL

**What.** PP-13: Work is not clearly a standalone durable task surface versus a chat toggle; clarification questions cannot suspend and resume a running task; there is no user pause/resume/cancel with durable state; no per-task cost or usage is surfaced; and the cloud loop is single-threaded with no task-independence-based parallelism, durable runs, retries, checkpointing or post-close continuation. phase4 PP-13 confirms the residues concretely: clarify.v1 has a contract (x_interactive_card) and a ClarifyCard renderer but zero server-side producers outside tests, and InteractiveCardBlock.tsx:68 hardcodes ctx:{canRespond:false}; 'paused' is emitted only by the tool-approval gate and TasksPage.tsx has no pause control at all; CloudAgentRunSchema carries provider/model/state but no usage or cost fields; and no task-completion notification exists (the push path fires only from schedule-notification-service.ts). CAP-048 records the missing goal-intake and editable plan surface that would complete the loop.

**Done when.** AGI Work is a durable task object a user can pause, resume, cancel and be notified about, with clarification questions that suspend and resume the run and per-task cost visible on the record.

**Where.** `apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:68`, `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:42`, `packages/contracts/cloud-contracts/src/cloud-agent-runs.ts:47-65`, `apps/web/lib/services/schedule-notification-service.ts:104`

**From.** AuditRemediationLedger.md; phase4-capability-audit.md; capability-gaps.csv

**Folded in.** PP-13 AGI Work: clarification round-trip broken, no durable pause/resume; phase4 PP-13 residues; CAP-048 AGI Work goal intake and plan surface

### AI-31 — Managed-cloud SSE carries reasoning only as token counts, so the reasoning chip can never render

`MEDIUM` · ai-routing · effort M

**What.** VOICE-REASONING-TEXT-NOT-STREAMED, proven on device: managed-cloud SSE carries reasoning only as token counts and stream-transform.ts never emits a reasoning TEXT delta, so MessageBubble's reasoning!==undefined gate never fires and 'Thought for Ns' can never appear on a managed-cloud turn. The entry records this was misdiagnosed twice as 'the model doesn't think' — it is a streaming gap spanning the transform, the SSE parser and the mobile message store. ExecutionPlan's mobile pass independently reports the same user-visible symptom as a P1: after send the transcript sits blank for up to 60s with no thinking block or status steps even though ThinkingChip, StatusStep, AgentActivityTimeline and StreamingIndicator all exist.

**Done when.** The managed-cloud stream emits reasoning as a text delta through the transform, SSE parser and every client store, so the reasoning affordance renders on the surfaces that already implement it.

**Where.** `apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts`, `apps/mobile/src/features/chat/components/MessageBubble.tsx:168`

**From.** known-flaws.md; ExecutionPlan.md

**Folded in.** VOICE-REASONING-TEXT-NOT-STREAMED; ExecutionPlan P1 Mobile shows no reasoning/status/streaming feedback

### AI-32 — Several catalog models remain unpriced or unverified against live provider APIs

`MEDIUM` · ai-routing · effort M

**What.** MODEL-CATALOG-HELD-VERIFICATIONS: several NIM open-weight endpoints are served but unpriced; a provider image tier remains unpriced in full; a provider preview has no official API id; and the Moonshot flagship, xAI reasoning, Mistral tiers and the OpenAI transcription model are docs-verified only, never live-probed with real keys. An unpriced served model is a metering hole as well as a catalog gap, so this overlaps the billing slice.

**Done when.** Every model the catalog offers carries verified pricing and a live-probed provider id, and a model that cannot be verified is not served.

**Blocked by.** Requires live provider keys for the unverified providers

**From.** known-flaws.md

### AI-35 — Model retirement/migration logic is reimplemented per-surface instead of centralized in the shared model registry

`MEDIUM` · ai-routing · effort M

**What.** CROSS-SURFACE-010: retired-models.json is enforced only as a CI/authoring-time guard; there is no packages-level runtime function that migrates a persisted conversation's stored modelId when its model retires. Web implements this ad hoc in model-store.ts, and desktop and mobile each carry their own equivalent — evidenced by dedicated per-surface test files — rather than sharing one migration function. Distinct from AI-02 (retired/hardcoded model IDs in directories the guard never scans).

**Done when.** Extract model-store.ts's retirement-check logic into a pure resolveModelForConversation(storedModelId, catalog) function in @agiworkforce/model-registry, have web adopt it first, then port desktop's and mobile's equivalents onto it.

**Where.** `apps/web/shared/stores/model-store.ts:85-105`, `apps/desktop/src/__tests__/lib/cloudChatPersistence.test.ts`, `apps/mobile/__tests__/model-display-name.test.ts`

**From.** audit/parity-2026-08-15 CROSS-SURFACE-010; audit/parity-2026-08-15/gaps/domain-cross-surface.json CROSS-SURFACE-010

**Folded in.** Model retirement/migration logic is reimplemented per surface instead of centralized in the shared model registry

### AI-41 — No vector storage or semantic retrieval anywhere; the fully-built, fully-billed embeddings endpoint has zero internal callers

`MEDIUM` · ai-routing · effort XL

**What.** BACKEND-RUNTIME-006 / SEARCH-RESEARCH-004 / MEMORY-005 all land on the same defect. POST /api/llm/v1/embeddings is a real 306-line billed endpoint with no caller anywhere in the repo. /api/search and /api/memory/search are plain Postgres ILIKE substring matching (memory route's own docstring: 'Simple ILIKE text search - can be upgraded to vector similarity later'). No migration under apps/web/db/neon/\*.sql declares a vector column or the pgvector extension. Project knowledge files are stuffed verbatim into prompts rather than retrieved by relevance.

**Done when.** Build one pgvector-backed store (chunk + embed via the existing embeddings endpoint + ANN query) as the shared backend prerequisite, then switch /api/memory/search and /api/search to cosine-similarity ranking with ILIKE kept as a fallback — rather than building two separate retrieval implementations. Distinct from AI-12, which is the project-knowledge consumer of this missing backend.

**Where.** `apps/web/app/api/llm/v1/embeddings/route.ts`, `apps/web/app/api/memory/search/route.ts:37-47`, `apps/web/app/api/search/route.ts:186,221,249,281`, `apps/web/db/neon/0010_memory.sql`

**From.** audit/parity-2026-08-15/gaps/domain-backend-runtime.json BACKEND-RUNTIME-006; audit/parity-2026-08-15/gaps/domain-search-research.json SEARCH-RESEARCH-004; audit/parity-2026-08-15/gaps/domain-memory.json MEMORY-005

**Folded in.** BACKEND-RUNTIME-006; SEARCH-RESEARCH-004; MEMORY-005

### AI-47 — Provider-outage / credit-downgrade fallback reason is computed but never reaches the streaming client

`MEDIUM` · ai-routing · effort S

**What.** MODELS-004. managed-failover.ts and request-processor.ts compute fallbackReason (provider outage / insufficient-credits downgrade) and it reaches response-builder.ts's x_agi_workforce.fallback.reason on the JSON path, but the streaming path — what chat actually uses — only propagates the resolved model id via the X-AGI-Resolved-Model header, never the reason text. Zero consumers of x_agi_workforce were found. Distinct from AI-09/UI-03, which cover the model identity itself rather than the reason for substitution.

**Done when.** Add an X-AGI-Fallback-Reason header alongside X-AGI-Resolved-Model on the streaming path and render it as a small dismissible note on the affected message.

**Where.** `apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.ts:86,108,250`, `apps/web/app/api/llm/v1/chat/completions/lib/response-builder.ts:281-299`, `apps/web/lib/hooks/useChatStream.ts:2219-2234`

**From.** audit/parity-2026-08-15/gaps/domain-models.json MODELS-004

### AI-48 — Ultra/Pro reasoning-mode and reasoningDots catalog fields have zero product consumers (schema built ahead of product)

`MEDIUM` · ai-routing · effort S

**What.** MODELS-005. model-catalog.ts:179,209-215,609 defines a structured ultraMode/proMode contract and a reasoningDots display hint, populated in models.json for OpenAI reasoning models, but no request builder reads proMode.param and no UI renders an Ultra/Pro toggle or dot indicator.

**Done when.** Either wire proMode/ultraMode into canonical-request.ts and add a composer control gated on their presence, or annotate the schema fields as speculative/unused so future readers do not assume a live capability.

**Where.** `packages/contracts/types/src/model-catalog.ts:179,209-215,609`, `packages/contracts/types/src/models.json:550-558,647-655,744-752`

**From.** audit/parity-2026-08-15/gaps/domain-models.json MODELS-005

### AI-49 — Opening a conversation whose persisted model has been retired silently substitutes the default with no notice

`MEDIUM` · ai-routing · effort S

**What.** MODELS-006. WebChatPage.tsx:1211-1220's hydration effect resolves a deprecated persisted model via resolveSelectableModelId() and calls setSelectedModelId with the substitute, with no toast or banner comparing persisted vs resolved model. Note: the separate advance-warning fix for a future deprecation_date shipped (CLR-01 / models-quotas G2, FIXES-APPLIED.md); this silent-substitution-on-open case is a different code path and remains open.

**Done when.** In the hydration effect, compare persisted vs resolved model id and, when they differ due to deprecation, set a one-time dismissible banner.

**Where.** `apps/web/shared/stores/model-store.ts:82-99,204-210`, `apps/web/features/chat/pages/WebChatPage.tsx:1211-1220`

**From.** audit/parity-2026-08-15/gaps/domain-models.json MODELS-006

### AI-50 — No cross-provider memory import on Web or Desktop despite mobile already shipping a working on-device parser

`MEDIUM` · ai-routing · effort M

**What.** MEMORY-003 / memory-12-gap. Mobile's memoryImport.ts genuinely parses ChatGPT/Claude/Gemini exports with format auto-detection, preview and dedup, reachable from the Memory screen header. Web explicitly ships none of it — CapabilitiesSection.tsx:169-174 carries a comment stating the Import row was removed because 'the web import flow is a placeholder (no working provider import endpoint)'. Desktop's prior GAP-077 declined citing 'no ingestion or authorization contract', a premise mobile's file-only implementation disproves. The parity matrix records 'Import memory from other AI providers' as Missing entirely.

**Done when.** Port memoryImport.ts's parsers (no server dependency) into a shared package and add a file-picker-based Import flow to Web's MemorySection and Desktop's Memory settings tab.

**Where.** `apps/mobile/src/features/memory/services/memoryImport.ts:1-300`, `apps/mobile/app/(app)/settings/memory-import.tsx`, `apps/web/features/settings/sections/CapabilitiesSection.tsx:169-174`

**From.** audit/parity-2026-08-15/gaps/domain-memory.json MEMORY-003; audit/competitive-gap-2026-08-15/domains/memory-personalization.json memory-12-gap; docs/current/parity-implementation-matrix.md; audit/parity-2026-08-15 MEMORY-003; audit/competitive-gap-2026-08-15 memory-12-gap; audit/ui-gaps GAP-077

**Folded in.** MEMORY-003; memory-12-gap; GAP-077; No cross-provider memory import on Web or Desktop, despite mobile shipping a working on-device parser

### AI-51 — Web Memory settings lack search, pin and summary controls, and the pinned DB column is invisible to the CRUD API

`MEDIUM` · ai-routing · effort M

**What.** MEMORY-006. Web's MemoryEditor is a flat add/edit/delete list with no search box, pin/unpin, category grouping or summary screen. The `pinned` column exists in Postgres (migration 0047) and is read by managed-memory-context-service.ts for prompt prioritization, but /api/memory and /api/memory/[id] never select, return or accept `pinned` at all — a stored, prompt-affecting field with no read/write path. Mobile already has search, All/Pinned filter, per-item pin toggles and a Memory summary screen. memory-03-gap adds that no surface offers natural-language ('Ask or update') memory editing.

**Done when.** Add `pinned` to the /api/memory GET/PUT contracts, add a pin toggle + search input + a read-only summary route to Web's MemorySection reusing MemoryEditor with new optional props, and consider a free-text instruction input for add/merge/remove.

**Where.** `packages/ui/unified-chat/src/components/MemoryEditor.tsx:1-350`, `apps/web/app/api/memory/route.ts:36,49-56`, `apps/web/app/api/memory/[id]/route.ts:22-103`

**From.** audit/parity-2026-08-15/gaps/domain-memory.json MEMORY-006; audit/competitive-gap-2026-08-15/domains/memory-personalization.json memory-03-gap

**Folded in.** MEMORY-006; memory-03-gap

### AI-52 — Memory is only ever a flat/provenance-grouped fact list, never synthesized narrative, and its retrieval is never named in the reasoning trace

`MEDIUM` · ai-routing · effort M

**What.** memory-02-gap: Web's MemoryEditor.tsx:215-283 renders a flat unheaded <li> list; mobile groups facts under provenance headers but each item stays a discrete unedited fact line, not synthesized topic-based prose. memory-17-gap: no memory-retrieval-labeled reasoning step exists in ThinkingBlock.tsx or around enrichManagedMemoryContext in request-processor.ts:972, so memory injection is folded silently into the system prompt (static-analysis finding, not verified against a live run).

**Done when.** Add a model-generated narrative summary pass (topic-clustered paragraphs) as a read-only view layered over the existing editable fact list on Web and Mobile; when reasoning-trace labeling is added generally, name memory-context injection explicitly as a step.

**Where.** `packages/ui/unified-chat/src/components/MemoryEditor.tsx:215-283`, `apps/mobile/app/(app)/settings/memory-summary.tsx:105-146`, `apps/web/features/chat/components/ThinkingBlock.tsx`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:972`

**From.** audit/competitive-gap-2026-08-15/domains/memory-personalization.json memory-02-gap, memory-17-gap

**Folded in.** memory-02-gap; memory-17-gap

### AI-54 — No approval/autonomy-mode picker on web, and the existing 4-tier picker is not reused by Cowork or scheduled tasks

`MEDIUM` · ai-routing · effort M

**What.** agentic-modes-gap-08: web's composer has zero approval-mode UI; Desktop has only a global binary 'Approvals: Auto' warning, and a per-conversation 3-tier picker was explicitly declined (GAP-059) because the native Tauri executor only exposes a global policy. settings-03-gap: AgentControl.tsx:64's 4-tier Ask/Auto/Plan/Bypass chip is imported only by AgentControl.tsx and ChatInput.tsx; desktop CreateTaskModal.tsx has zero occurrences of approval/autonom/mode and the Cowork tab is a single boolean toggle. settings-28-gap / sched-gap-04: scheduled task creation has no approval picker and the backend ApprovalMode type is only 2-tier ('auto'|'manual') with zero .tsx call sites in apps/web.

**Done when.** Reuse AgentControl's mode chip (and its bypass confirm-gate) in CoworkTab; add at minimum the Desktop-equivalent global 'Approvals: Auto' warning to the web composer. Do not add a scheduled-task approval picker until AI-36 gives scheduled runs real tools to gate.

**Where.** `packages/ui/unified-chat/src/components/AgentControl.tsx:64`, `apps/desktop/src/features/settings/tabs/Cowork/index.tsx:10-11`, `apps/desktop/src/features/scheduler/CreateTaskModal.tsx:190,209,227,236-243`, `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:223`

**Blocked by.** scheduled-task half blocked on AI-36 (scheduled runs currently have no tools to gate)

**From.** audit/competitive-gap-2026-08-15/domains/agentic-modes.json agentic-modes-gap-08; audit/competitive-gap-2026-08-15/domains/settings-taxonomy-permission-approval-archit.json settings-03-gap, settings-28-gap; audit/competitive-gap-2026-08-15/domains/scheduled-tasks-automation.json sched-gap-04

**Folded in.** agentic-modes-gap-08; settings-03-gap; settings-28-gap; sched-gap-04

### AI-56 — Completed research reports are a dead end: no table of contents, no notify-on-done, no derivative formats, no suite export, no source scoping, no follow-up composer

`MEDIUM` · ai-routing · effort L

**What.** search-deep-research G5: ResearchReportView.tsx:252-257 renders the whole report body as one continuous MarkdownContent block with no heading extraction and no TableOfContents helper. G6: no titled prose narration panel (deliberate design divergence). G7: zero 'notify' hits in any research-adjacent component. G8: no derivative-format Create menu (repo-wide zero hits for 'Audio Overview'/'Flashcards'). G9: EXPORT_FORMATS limited to local Markdown/PDF/Word download; no write-scoped Docs/Drive export despite a Drive connector catalog entry. G11: no domain-allowlist/source-scoping mechanism in research-loop.ts or web-search-tool.ts. G12: a report reopened outside its originating conversation has no composer or 'ask about this' affordance.

**Done when.** Highest value first: extract markdown headings client-side into a clickable nested TOC, and add a lightweight composer to ResearchReportView when hosted outside the live conversation. Defer derivative formats and Docs export.

**Where.** `apps/web/features/chat/components/research/ResearchReportView.tsx:74-109,252-257`, `apps/web/features/chat/components/research/ResearchPanel.tsx`, `apps/web/lib/research/research-loop.ts:953-966`, `apps/web/lib/connectors/catalog.ts`

**From.** audit/competitive-gap-2026-08-15/domains/web-search-deep-research.json G5,G6,G7,G8,G9,G11,G12

**Folded in.** dr-G5; dr-G6; dr-G7; dr-G8; dr-G9; dr-G11; dr-G12

### CLI-20 — CLI has no durable detached-run/backgrounding contract, so subagent batches are foreground-only

`MEDIUM` · cli · effort XL

**What.** wire-or-cut.md 2026-07-30 CLI Placeholder Surface: the advertised /background (/bg) command was removed because it only returned an unavailable message, and the placeholder task lifecycle (six deferred task-registry tools that created empty output files and accepted caller-authored status transitions) was deleted outright. The ledger states subagent batches remain foreground-only until a durable detached-run contract exists — that contract has not been built. Related to CLI-07 (/task cancel rejected despite subagent.cancel() existing).

**Done when.** Design and implement a durable detached-run contract (process supervision, stdout capture, exit status, polling, termination) before re-advertising any backgrounding command.

**Where.** `apps/cli/src/agent/`, `apps/cli/src/subagent.rs`

**From.** docs/adr/wire-or-cut.md 2026-07-30 CLI Placeholder Surface; docs/adr/wire-or-cut.md#2026-07-30 CLI Placeholder Surface

**Folded in.** No durable detached-run/backgrounding contract for the CLI; subagent batches remain foreground-only

### CONN-02 — GitHub connector requires a registered GitHub App (7 env vars) and silently disappears when any one is missing

`MEDIUM` · integrations · effort S

**What.** Verified: github is a reserved connector id served by apps/web/lib/github-app.ts, whose isGitHubInstallationLinkingAvailable() treats a partial credential set as absent — so a single missing variable makes the connector silently not appear rather than reporting a misconfiguration. It needs a GitHub App (not an OAuth app) with a two-turn install flow, because install/route.ts:63-65 guards against spoofable setup-URL installation_ids. Seven variables are required: GITHUB_APP_ID, GITHUB_APP_SLUG, GITHUB_APP_CLIENT_ID, GITHUB_APP_CLIENT_SECRET, GITHUB_APP_PRIVATE_KEY_BASE64, GITHUB_WEBHOOK_SECRET, GITHUB_TOKEN_ENCRYPTION_KEY.

**Done when.** Register the GitHub App and set all seven variables in every environment; make a partial credential set log a loud misconfiguration instead of silently hiding the connector.

**Where.** `apps/web/lib/github-app.ts:97-101`, `apps/web/app/api/github/install/route.ts:63-65`

**Blocked by.** founder must register the GitHub App (FoundersAssistance.md #22 section A)

**From.** FoundersAssistance.md (#22)

### CONN-04 — Six MCP vendors refuse dynamic client registration, keeping those connectors unlisted

`MEDIUM` · integrations · effort M

**What.** A real registration attempt on 2026-08-14 was refused by each: asana 400 invalid_redirect_uri, dropbox 403 registration_not_supported (pre-registered partners only), figma 403 Forbidden, intercom 400 invalid_redirect_uri, square 400 invalid_redirect_uri, vercel 400 invalid_redirect_uri. They are correctly recorded as preregistered in mcp-endpoints.ts and not offered, avoiding a Connect button that fails on click.

**Done when.** Apply to each vendor's partner programme to allowlist https://agiworkforce.com/api/connectors/oauth/callback, then flip the entry to dynamic or supply the issued client credentials.

**Where.** `apps/web/lib/connectors/mcp-endpoints.ts`

**Blocked by.** per-vendor partner programme application (FoundersAssistance.md #25)

**From.** FoundersAssistance.md (#25); ExecutionPlan.md (MCP connectors section)

### CONN-05 — An authorization-server change is undetectable because connector grants are not keyed by issuer (SEP-2352)

`MEDIUM` · integrations · effort S

**What.** connector_oauth_grants is keyed unique(user_id, connector_id) with no issuer column, and nothing compares the stored endpoint against the descriptor at read time — so an operator repointing a connectorId at a different authorization server would let a stale grant keep reading as connected. Zero migration risk today because the table has no rows (no provider is configured).

**Done when.** Add an issuer column to connector_oauth_grants, include it in the uniqueness key, and invalidate the grant when the descriptor's issuer changes. Do this while the table is still empty.

**Where.** `apps/web/db/neon (connector_oauth_grants)`

**From.** ExecutionPlan.md (TODO Two 2026-07-28 items)

### CONN-08 — CONNECTOR_OAUTH_START_PATH and its callback builder have multiple independent live definitions

`MEDIUM` · integrations · effort M

**What.** Route and callback builders are duplicated across surfaces instead of living in the connector auth contract package, and there are no Web/Mobile/shared-UI contract tests or OAuth redirect-URI tests — so a redirect-URI change can silently break one surface while the others pass.

**Done when.** Export one route/callback builder from the connector auth contract package, delete the copies, and add redirect-URI contract tests per surface.

**Where.** `packages/contracts`

**From.** AuditRemediationLedger.md (MATCH-009)

### CONN-10 — Pivot to MCP protocol revision 2026-07-28 is blocked on the official SDK

`MEDIUM` · integrations · effort M

**What.** Checked against npm on 2026-08-13: @modelcontextprotocol/sdk@1.30.0 still declares LATEST_PROTOCOL_VERSION='2025-11-25'. Hand-rolling the new transport would mean maintaining a fork against a spec whose reference implementation has not shipped.

**Done when.** Wait for SDK support, then adopt the new revision; do not hand-roll the transport.

**Where.** `packages/tools/mcp/`

**Blocked by.** external — @modelcontextprotocol/sdk has not shipped 2026-07-28 support

**From.** ExecutionPlan.md (TODO Pivot to MCP 2026-07-28)

### CONN-11 — MCP directory content is placeholder rather than a signed curated registry, and no install/publish lifecycle exists

`MEDIUM` · integrations · effort XL

**What.** The MCP directory ships placeholder content instead of a signed or curated registry, and its copy has not been downgraded. The plugin registry v1 shipped first-party-only with a world-readable catalog and deliberately no install buttons, and the web plugin page identifies itself as a catalogue preview where nothing installs. There is no signature, allowlist, sandbox or kill-switch test, no publisher identity, no versioning, no update policy and no uninstall path. CAP-037 tracks the same gap as an authoritative extension directory. Compounding: the plugin marketplace 503s because migration 0096_plugin_registry.sql was never applied to production.

**Done when.** Apply the registry migration, then either build the signed registry with a real install/publish lifecycle (signature verification, publisher identity, versioning, permissions, update policy, uninstall, kill-switch) or downgrade every directory surface to an explicitly labelled preview.

**Where.** `apps/web/app/plugins/page.tsx`, `apps/web/db/neon/0096_plugin_registry.sql`

**From.** AuditRemediationLedger.md (PP-16, PP-17, DOC-023); audit/capability-gaps.csv (CAP-037, CAP-046); docs/current/gap-audit-2026-08-08.md (Section 7.4); ExecutionPlan.md (item #94)

**Folded in.** DOC-023: Placeholder MCP directory not downgraded; CAP-037: Authoritative extension directory; PP-17: skills are read-only discovery; plugin store lacks install/versioning/publisher identity; Plugin marketplace 503s on an unapplied migration

### CONN-13 — Connector explicit invocation and discovery are absent from the composer on every surface

`MEDIUM` · integrations · effort L

**What.** There is no explicit connector invocation or discovery affordance in the composer, and connector scope, reauth, expiry and risk metadata are unused in real policy decisions. Catalog entries for Maps, Photos, Contacts, Microsoft 365 and Slack remain undecided. Related surface gaps: the connector catalog has no New/Community/Trending badges, popularity ranking or verified indicator, and no 'Popular' quick-connect row or Type column.

Also recorded by a later audit (Connectors and Plugins have no in-composer per-message attachment; only Skills do (CPS-02)): Names the mechanism and the honest rationale: ChatComposerNew.tsx:2714-2800's Connectors and Plugins rows only call openSettings(...), with a code comment stating 'per-conversation connector enablement has no runtime backing', while the Skills row's settings-only behaviour follows a documented founder directive keeping per-message selection in @mention. Genuine per-message connector scoping requires new backend support for scoping a connector to a single turn.

Also recorded by a later audit (Composer '+' menu Connectors entry is a settings link-out, not in-composer registration (CLR-09); and Connectors/Plugins have no per-message attachment while Skills do (CPS-02)): Both are the same underlying gap as CONN-13 with in-code rationale worth preserving. ChatComposerNew.tsx:2735-2775's 'Connectors' item calls openSettings('connectors') with a comment explaining the choice is deliberate — 'An inline connect toggle here would imply a mid-chat capability that does not exist' — and the Plugins row carries a comment stating 'per-conversation connector enablement has no runtime backing'. Skills genuinely gets in-composer @mention/slash attachment (per a documented founder directive that per-message selection stays in @mention); Connectors and Plugins do not. Genuine per-message connector scoping would require new backend support for scoping a connector to a single turn, which does not exist today — so this should be stated as an explicit product decision or backed by real work, not left ambiguous.

**Done when.** Add explicit connector mention and invocation to the shared composer backed by the capability registry, and decide the undecided catalog entries.

**Where.** `packages/ui/unified-chat/src/components/ChatInput.tsx`, `apps/web/features/connectors/pages/ConnectorsPage.tsx`

**From.** AuditRemediationLedger.md (PP-16); audit/ui-gaps.md (GAP-257, GAP-269); audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** GAP-257: Connector catalog has no New/Community/Trending badges or verified indicator; GAP-269: Connectors settings lacks a 'Popular' quick-connect row and a Type column

### CONN-22 — No skill-authoring path on web/BYOK/managed cloud: no AI-assisted authoring, no file upload, no GitHub import

`MEDIUM` · integrations · effort L

**What.** CPS-04: grepped for SkillEditor, SkillComposer, createSkill, CreateSkillDialog, NewSkillForm — no matches; apps/web/app/settings/skills/new/page.tsx is a pure browse/redirect surface. Desktop's different mechanism ('Record skill') is gated to privacyMode==='local' only, so it does not cover web/BYOK/managed-cloud users. CPS-05: the same sweep found no upload or GitHub-import UI anywhere; the only inbound-skill-adjacent path is a one-way OUTBOUND file save to Downloads with no import-back-in step (see CONN-17).

**Done when.** Add a conversational skill-authoring entry point on web reusing existing chat infrastructure and the skill catalog's write path, plus a file-upload and 'paste a GitHub URL' path validated through the existing tools/skill-vetting scanner.

**Where.** `apps/web/app/settings/skills/new/page.tsx`, `apps/desktop/src/features/v3/DesktopShellV3.tsx:777-779`, `apps/desktop/src-tauri/src/sys/commands/skills.rs:528`

**From.** audit/competitive-gap-2026-08-15/domains/connectors-plugins-skills-mcp-custom-assista.json CPS-04, CPS-05

**Folded in.** CPS-04; CPS-05

### CONN-23 — No connector-search toggle and no per-capability auto-invoke controls — connectors are always auto-searched with no way to disable

`MEDIUM` · integrations · effort M

**What.** CPS-06: grepped for 'Connector search', connectorSearch, 'Tool access mode', 'Load tools when needed' — no matches on web or desktop. Connectors are always auto-searched with no way to disable that behaviour short of disconnecting the connector. memory-18-gap: CapabilitiesSection.tsx has exactly three toggles, all under 'Memory' — no auto-invoke section exists at all for web search, canvas, voice, library or connector search. The parity matrix's 'Internal/app connector search' row is likewise Partial.

**Done when.** Add a single settings toggle that, when off, skips loadUserConnectorToolCatalog in route.ts; then extend it into an 'Advanced' subsection of CapabilitiesSection with independent per-tool auto-invoke switches, mirroring the pattern already used for memory sub-toggles.

**Where.** `apps/web/features/settings/sections/CapabilitiesSection.tsx`, `apps/web/app/api/llm/v1/chat/completions/route.ts`

**From.** audit/competitive-gap-2026-08-15/domains/connectors-plugins-skills-mcp-custom-assista.json CPS-06; audit/competitive-gap-2026-08-15/domains/memory-personalization.json memory-18-gap

**Folded in.** CPS-06; memory-18-gap

### CONN-29 — Confirm-before-destructive-action dialog copy-pasted three times while the live connector disconnect remains unconfirmed

`MEDIUM` · integrations · effort S

**What.** duplication/extension-surfaces.md §2.2. The identical confirm-dialog block was added twice in the same SettingsModal.tsx file (DirectoryBrowse's plugin tab ~line 974-1006 and PluginsPanel's table view ~line 2014-2046), both citing 'CPS-03 … mirroring apps/web ConnectorsPage's Disconnect/Remove-custom-connector Dialogs' — a third hand-copy of the original pattern — while ConnectorsPanel's own disconnect action in the same file still has no confirm step at all. FIXES-APPLIED.md's useConfirm() work covered conversation/project/message deletion and plugin removal but not connector disconnect.

**Done when.** Extract one shared confirm-dialog primitive (the existing useConfirm()) used by DirectoryBrowse, PluginsPanel and ConnectorsPanel's disconnect action alike.

**Where.** `packages/ui/ui/src/settings-modal/SettingsModal.tsx:482,974-1006,1749,2014-2046`

**From.** audit/competitive-gap-2026-08-15/duplication/extension-surfaces.md §2.2; audit/competitive-gap-2026-08-15/duplication/all-axes.json#extension-surfaces[1]

### DESK-14 — Desktop TTS model IDs are hardcoded because no voice-synthesis routing slot exists in the catalog

`MEDIUM` · desktop · effort M

**What.** packages/contracts/types/src/model-catalog.ts defines voice_transcription and voice_rewrite slots but no synthesis slot, so apps/desktop/src-tauri/src/features/speech/tts.rs hardcodes both cloud TTS defaults. This is how a retired ElevenLabs default stayed live for 19 days after upstream removed it — every unconfigured ElevenLabs playback called a nonexistent model. The IDs were patched with a guard test but the catalog-driven fix is still owed. Compounding: the only model served on /v1/audio/speech carries a Deprecated badge with no published successor, and there is no realtime/duplex audio model type in the catalog schema at all.

**Done when.** Add a voice_tts routing slot to the catalog with lifecycle/deprecation checks and resolve tts.rs defaults through it; decide the successor for the deprecated OpenAI TTS model and whether a realtime model type is added.

**Where.** `apps/desktop/src-tauri/src/features/speech/tts.rs`, `packages/contracts/types/src/model-catalog.ts`

**From.** AuditRemediationLedger.md (HARD-013); docs/agent-context/known-flaws.md (VOICE-TTS-NO-ROUTING-SLOT, VOICE-OPENAI-TTS-DEPRECATED-NO-SUCCESSOR, VOICE-REALTIME-FAMILY-ABSENT)

**Folded in.** HARD-013: Voice TTS default can point to a removed model; VOICE-OPENAI-TTS-DEPRECATED-NO-SUCCESSOR; VOICE-REALTIME-FAMILY-ABSENT: no realtime/duplex audio model type in the catalog schema

### DESK-17 — Groq transcription endpoint and speech-provider config duplicated across the Desktop and CLI Rust binaries

`MEDIUM` · desktop · effort M

**What.** The speech-provider endpoint and its configuration are maintained twice — once in the Desktop Tauri binary and once in the CLI binary — instead of living in a shared crate or generated contract, so a provider change must be made in two places and can silently diverge. Overlaps the CLI slice.

**Done when.** Move speech-provider endpoint/config into a shared crate or generated contract consumed by both binaries.

**Where.** `apps/desktop/src-tauri/src/features/speech`, `apps/cli/src/voice.rs`

**From.** AuditRemediationLedger.md (HARD-004)

### DESK-20 — Desktop workspace semantic-embeddings indexer is implemented but unwired and not authorized to send Local content remotely

`MEDIUM` · desktop · effort L

**What.** The symbol/codebase indexer half was deleted 2026-07-30; the semantic-embeddings indexer (index_workspace, semantic_search_codebase) remains implemented with a TS wrapper but no live consumer. Independently confirmed: the registered Tauri embedding commands exist but apps/desktop/src/api/embeddings.ts is imported only by api/index.ts — zero React components consume it. Unresolved trust question: sending Local workspace content to a remote embedding provider is not authorized.

**Done when.** Decide the trust boundary for embedding Local workspace content, then either wire a consumer behind an explicit consent path or delete the indexer and its commands.

**Where.** `apps/desktop/src-tauri/src/core/embeddings/indexer.rs`, `apps/desktop/src/api/embeddings.ts:123-140`, `apps/desktop/src-tauri/src/lib.rs:1578-1582`

**From.** docs/agent-context/known-flaws.md (DESKTOP-WORKSPACE-INDEXING-UNWIRED-01); docs/agent-context/phase4-capability-audit.md (PP-14)

**Folded in.** Desktop repository indexer (embeddings) commands registered but zero React components import the client wrapper

### DESK-21 — Desktop project RAG engine is unreachable and permanently non-semantic even if reached

`MEDIUM` · desktop · effort L

**What.** project_search_knowledge and project_add_knowledge_file are registered Tauri commands with zero TS invokers. Worse, RAGEngine::new sets embedding_generator: None and with_embeddings has zero call sites, so generate_embedding always falls through to a bag-of-words hash the file itself labels 'NOT semantic'. Meanwhile desktop copy claims 'AGI searches this content and references the most relevant parts', while format_project_scope_prompt actually takes the first 10 files in stored order and truncates each at 4,000 chars with no ranking.

Also recorded by a later audit (Desktop project RAG embeddings — unreachable chain with a latent dimension-mismatch bug, deliberately not wired): Explains why DESK-21's 'permanently non-semantic even if reached' is worse than it sounds: the hash fallback is 384-dimensional while the configured embedding route is 768-dimensional, and which one is used is decided per call — so an Ollama outage between indexing and querying yields dimension-mismatched vectors and cosine_similarity returns 0 for every chunk, i.e. search silently returns nothing rather than failing. Closing this requires per-chunk embedding-model and dimension persistence, not just wiring. Also records that ProjectManager (features/projects/manager.rs) has zero production consumers and is constructed only by its own test, and that its real call sites at sys/commands/knowledge.rs:194,231 are themselves unreachable.

Also recorded by a later audit (Desktop project RAG embeddings are unreachable and carry a latent dimension-mismatch bug (wire-or-cut, Wave 2 Wire Decisions)): Explains WHY it was deliberately left unwired, which the register entry does not capture: wiring it would introduce a silent failure — the hash fallback is 384-dimensional while the configured embedding route is 768-dimensional, decided per call, so an Ollama outage between indexing and querying yields dimension-mismatched vectors and cosine_similarity returns 0 for every chunk, i.e. search silently returns nothing. Closing this requires per-chunk persistence of the embedding model and dimension, not just a call-site. Also: ProjectManager (features/projects/manager.rs) has zero production consumers and is constructed only by its own test; its real call sites (sys/commands/knowledge.rs:194,231) are themselves unreachable.

**Done when.** Either wire a real embedding generator and a UI consumer, or delete the RAG engine and correct the project-knowledge copy to describe first-N truncation.

**Where.** `apps/desktop/src-tauri/src/features/projects/rag.rs:45-49,52,210-211`, `apps/desktop/src-tauri/src/lib.rs:1256-1257`, `apps/desktop/src-tauri/src/sys/commands/chat/send_message_setup.rs:680-752`

**From.** docs/agent-context/phase4-capability-audit.md (PP-06); AuditRemediationLedger.md (PP-06); audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** Desktop project-knowledge copy claims semantic search/ranking that does not exist

### DESK-30 — Desktop/cloud-chat surface returns zero selectable models for every tier; desktop/local-chat profile has zero allowed harnesses

`MEDIUM` · desktop · effort M

**What.** web-search-model-coverage.test.ts's 'non-empty roster' failure traced to a desktop-surface catalog mapping gap distinct from the latest-family-only retirement. Related: registry runtimeProfiles desktop/local-chat has allowedHarnessIds:[] with status 'partial', so Auto strategy under a Local boundary yields zero candidates at the auto-policy step — correct fail-closed behavior, but no local harness is wired and the fallback order is undocumented.

**Done when.** Populate the desktop surface catalog mapping and wire real local harnesses into the desktop/local-chat runtime profile, or document the fallback order explicitly.

**Where.** `apps/web/__tests__/web-search-model-coverage.test.ts`, `packages/ai/model-registry/catalog`

**From.** docs/agent-context/known-flaws.md (WEB-PREEXISTING-TEST-FAILURES-01 residual (c), DESKTOP-LOCAL-CHAT-EMPTY-HARNESS)

**Folded in.** DESKTOP-LOCAL-CHAT-EMPTY-HARNESS: desktop/local-chat runtime profile has zero allowed harness IDs

### DESK-31 — No installed Local model is certified for Desktop Local Tasks, so the feature stays disabled

`MEDIUM` · desktop · effort M

**What.** No Ollama-reported model matches the canonical registry's tools+agentic requirement; a manual attempt with AGI_WDIO_OLLAMA_MODEL_ID generated malformed and invented tool identifiers. The model picker, Tasks creator disabled state, and Rust command boundary rejection are already implemented and verified — the gap is a certified model profile.

**Done when.** Founder selects a concrete Local model for the 16GB target, then empirically certify structured planning, tool IDs, permissions, cancellation and memory-latency bounds and add it to the canonical registry.

**Where.** `packages/ai/model-registry/catalog`

**Blocked by.** founder choice of Local model + empirical certification (FoundersAssistance.md #17)

**From.** FoundersAssistance.md (#17); ExecutionPlan.md (Desktop Local Tasks capability honesty)

### DESK-62 — Desktop OpenAI reasoning Responses dialect has no live-key smoke proof

`MEDIUM` · desktop · effort S · **in-progress**

**What.** The shared Rust LLM owner now has an explicit openai_responses dialect (fixed 2026-07-15) so OpenAI reasoning models no longer go through Chat Completions compat, but the live-key smoke test remains external and unrun.

**Done when.** Run one live-key reasoning turn per dialect and record the evidence.

**Where.** `apps/desktop/src-tauri/src/core/llm`

**Blocked by.** live provider key smoke run (external)

**From.** docs/agent-context/known-flaws.md (DESKTOP-OPENAI-REASONING-RESPONSES-01)

### INFRA-32 — Process-local job state remains on desktop and gateway surfaces

`MEDIUM` · infra/ci · effort M · **in-progress**

**What.** SCALE-CON-001 triage (2026-08-09): SATISFIED for the web API surface — zero new Map() job/task/video/status holders remain under apps/web/app/api — but not proven for desktop and gateway surfaces, and the wave-6 pass flagged media and agent status still living in a process Map on desktop. PP-19 records the same defect for video specifically: process-local video task maps instead of durable tenant-scoped storage and queue. AI-28 records the trigger-registry instance (an in-memory HashMap losing every trigger on restart).

**Done when.** No job, task or media status lives in process memory on any surface; all of it is in durable tenant-scoped storage so a restart or a second process cannot lose or diverge from it.

**From.** AuditRemediationLedger.md

**Folded in.** SCALE-CON-001 Process-local job state not fully migrated

### INFRA-45 — A transient sandbox reconnect failure orphans a still-live paused sandbox

`MEDIUM` · infra/ci · effort S

**What.** E2B-TRANSIENT-RESUME-ORPHAN: a transient connect() failure creates a fresh sandbox and overwrites the mapping, orphaning the previous paused one; cost is bounded by per-user quota and E2B's own timeout auto-kill, but a precise handle-and-kill fix is deferred. The sweeper half (E2B-NO-ORPHAN-SWEEPER) has since landed — lib/e2b/reclaim.ts lists running and paused sandboxes, kills expired and orphaned sessions, settles open compute intervals and removes stale mappings, scheduled daily via an authenticated cron — which bounds but does not eliminate this specific leak. ExecutionPlan #23 records why it matters: quota counted both running and paused sandboxes and paused ones were never reaped, so 12 paused sandboxes were found on the account, the oldest from 11 July, silently making 'Run code' fail.

**Done when.** A failed reconnect kills the sandbox it could not reach before creating a replacement, so a transient network error cannot strand paid capacity.

**Where.** `apps/web/lib/e2b/reclaim.ts`

**From.** known-flaws.md; ExecutionPlan.md

### SEC-84 — Approval/autonomy-mode control does not reach the surfaces that most need it: no picker on Web chat, global-binary only on Desktop, none on Cowork or scheduled tasks

`MEDIUM` · security · effort M

**What.** agentic-modes-gap-08 (prior GAP-058/GAP-059), settings-03-gap, settings-28-gap and sched-gap-04 (competitive-gap-2026-08-15) all describe the same coverage hole. A real 4-tier Ask/Auto/Plan/Bypass chip exists in AgentControl.tsx:64 but is imported only by AgentControl.tsx and the shared ChatInput.tsx; the Web composer has zero approval-mode UI (grep of ChatComposerNew.tsx and settings); Desktop exposes only a global binary 'Approvals: Auto' warning because the native Tauri executor exposes just a global policy (a true per-conversation 3-tier picker was explicitly declined at GAP-059); Desktop's CreateTaskModal.tsx has zero occurrences of approval/autonom/mode; the Cowork tab is a single boolean toggle; ScheduleForm.tsx has zero approval hits and the backend ApprovalMode type is only 2-tier ('auto'|'manual') with zero .tsx call sites in apps/web.

**Done when.** Reuse the existing AgentControl mode chip (and its bypass confirm-gate) in the Web composer and CoworkTab rather than building new pickers; at minimum surface Desktop's global 'Approvals: Auto' warning on Web. Do not build a per-conversation picker the backend cannot isolate.

**Where.** `packages/ui/unified-chat/src/components/AgentControl.tsx:64`, `apps/desktop/src/features/settings/tabs/Cowork/index.tsx:10-11`, `apps/desktop/src/features/scheduler/CreateTaskModal.tsx:190,209,227,236-243`, `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:223`

**Blocked by.** The scheduled-task half is blocked on scheduled runs having any tool access at all (AGENTIC-WORK-007) — there is nothing to gate today

**From.** audit/competitive-gap-2026-08-15/domains/agentic-modes (agentic-modes-gap-08; prior GAP-058/GAP-059); audit/competitive-gap-2026-08-15/domains/settings (settings-03-gap, settings-28-gap); audit/competitive-gap-2026-08-15/domains/scheduled-tasks (sched-gap-04)

**Folded in.** agentic-modes-gap-08; settings-03-gap; settings-28-gap; sched-gap-04

### UI-09 — Memory has no user-facing lifecycle controls: no disable, inspect, edit, delete, export, scope separation, or provenance

`MEDIUM` · ui · effort L

**What.** There are no Web controls for memory lifecycle; the Desktop memory management UI is unmounted; there are no sensitive-data exclusions; global/project/org/temporary scopes are not separated; and provenance is missing. Related capability rows track suppressing an irrelevant memory source (CAP-006) and project-only memory with global exclusion (CAP-027) as unbuilt. Memory retrieval/semantic-search quality is owned by the ai-routing slice.

Also recorded by a later audit (Desktop's Project Settings Memory tab reads/writes the wrong (global, device-wide) memory store, not the project-scoped one actually used at send time): MEMORY-001 (audit/parity-2026-08-15, prior CAP-027) turns UI-09's 'no scope separation' into a concrete cross-project leak: ProjectSettingsDialog.tsx:1268-1291 mounts MemoryManager, which reads/writes the flat global useMemoryStore (MemoryManager.tsx:105-131) under copy claiming the memories are project-scoped, while the chat runtime actually injects from a separate genuinely project-scoped pipeline (ChatMemoryHandler / ProjectMemoryManager, memory_handler.rs:80-136, keyed by project folder) whose TS side projectMemoryStore.ts has zero UI callers. A user's 'Create memory' from this tab silently leaks into every other project and every non-project chat. Fix: pass the active project folder into MemoryManager, swap its data source to getProjectMemories(projectFolder), and route Create memory through saveProjectContext.

Also recorded by a later audit (No workspace-level memory scoping/isolation control (project memory is unconditionally account-wide) on Web): PROJ-WS-01 / memory-13-gap / MEMORY-004 (prior CAP-027) give the web half a schema-level root cause: user_memories (apps/web/db/neon/0010_memory.sql) has no project column at all and loadManagedMemoryContext selects purely by user_id (managed-memory-context-service.ts:137-158), so memory is honestly disclosed as fully shared. A decorative single-option scope <select> was already correctly removed from ProjectSettingsDialog.tsx:229-251 and replaced with static copy. Severity raised to HIGH in the competitive pass because all three benchmarked competitors passed a live cross-chat isolation test. Fix: nullable project_id on user_memories, a per-project memoryScope preference, threaded through loadManagedMemoryContext/persistManagedAutoMemoryFacts, then re-add a real (non-decorative) selector and a creation-time selector in CreateProjectDialog (memory-14-gap).

Also recorded by a later audit (Memory must support view/manage, reference-chat search, generated memory and cross-provider import (source-of-truth.md GAP-6)): Confirms UI-09's lifecycle-control list from the P0 gap list and adds two sub-capabilities now tracked separately with concrete evidence: reference-chat search (AI-37) and cross-provider import (AI-47). Preserves GAP-6 as the trail-back id.

**Done when.** A user can see what the product remembers about them, edit or delete any single item, choose its scope, exclude sensitive content, and turn memory off entirely.

**From.** AuditRemediationLedger.md; audit/capability-gaps.csv; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** PP-07: Memory and chat search: no disable/inspect/edit/delete/export controls, Desktop UI unmounted; CAP-006: Suppress an irrelevant memory source; CAP-027: Project-only memory

### AI-18 — allowToolUse and allowMCP documentation contradicts the tier values they document

`LOW` · ai-routing · effort S

**What.** CONTRACTS-TOOL-USE-LADDER-DOC-INVERTED-01, flagged sweep-quarantine with polarity unresolved: the doc comment says 'Free=false, lower tiers' but the free tier actually sets allowToolUse:true; the sibling allowMCP field is likewise documented inconsistently with its actual quantity-typed value. known-flaws.md explicitly warns that sweep-quarantine rows describe code contradicting its own comments and must NOT be closed by rewriting the comment — this needs an owner decision on the intended ladder, not a guess.

**Done when.** An owner decides the intended tool-use and MCP tier ladder, and the catalog values are corrected to match — with the doc comment following the decision rather than being edited to match whatever the code happens to do.

**Where.** `packages/contracts/types/src/model-catalog.ts`

**Blocked by.** Owner decision on the intended free-tier tool-use and MCP ladder

**From.** known-flaws.md

### AI-23 — The web-search honesty guard does not cover native-provider models

`LOW` · ai-routing · effort S

**What.** WEBSEARCH-GUARD-NATIVE-NOSEARCH (not currently reproducible): the 422 honesty guard that fires when web_search:true is silently dropped covers only the generic-fallback plus non-stream case. Zero current catalog models trigger it, so there is no live defect, but the guard should be extended to native-provider models as a latent-defence fix before a model with tools:true/search:false enters the catalog.

**Done when.** The honesty guard covers native-provider models as well as the generic fallback, so a future catalog entry with tools but no search cannot silently drop a requested capability.

**Where.** `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1557`

**From.** known-flaws.md

### AI-33 — Inbound messaging-platform bot presence is undecided and outside current phases

`LOW` · ai-routing · effort XL · **unclear**

**What.** CAP-023 (MessagingBot): inbound Slack, Teams and WhatsApp apps remain outside the current phases. Recorded as unclear rather than dropped because PP-22 separately notes that Slack/Teams delivery is currently not via real app installs, so copy may already imply presence the product does not have.

Also recorded by a later audit (No agent deployment to external messaging platforms as a first-class tier (agentic-modes-gap-13)): Adds the outbound direction to the register's inbound-only framing. Telegram/Slack appear only as inbound connector catalog entries (data sources the agent reads from, apps/web/features/connectors/data/connectors.ts); no outbound 'deploy a branded, persistent agent identity onto this platform' flow exists anywhere. Treated as a roadmap idea — a genuinely new product surface distinct from the existing inbound catalog — reinforcing that AI-33's 'undecided and outside current phases' status still holds.

**Done when.** Either inbound messaging apps are scoped into a phase with real app installs, or every surface stops implying Slack/Teams delivery works through them.

**From.** capability-gaps.csv; AuditRemediationLedger.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

### AI-45 — Provider request-shaping (OpenAI wire-compat, reasoning-effort normalization) is web-only with unverified parity on mobile and extension

`LOW` · ai-routing · effort S · **unclear**

**What.** CROSS-SURFACE-015. packages/ai/provider-protocol provides request-shaping functions consumed by 13 files in apps/web and zero files in desktop/mobile/extension/cli. Whether mobile/extension have independently-built equivalents producing the same wire format, or instead diverge silently, was explicitly flagged as an open question and not established in that audit pass.

**Done when.** Grep apps/mobile and apps/extension for reasoning-effort / cache-boundary / OpenAI-wire-format logic to determine whether an independent equivalent exists; add a parity check or document which case applies.

**Where.** `packages/ai/provider-protocol/AGENTS.md`, `packages/ai/provider-protocol`

**From.** audit/parity-2026-08-15/gaps/domain-cross-surface.json CROSS-SURFACE-015; audit/parity-2026-08-15 CROSS-SURFACE-015

**Folded in.** Provider request-shaping (OpenAI wire-compat, reasoning-effort normalization) is web-only, with unverified parity on mobile and the extensions

### AI-53 — No personalization layer beyond chat memory: no forward-looking brief, no connector-fed personalization, no disclosure of whether memory personalizes outbound tool queries

`LOW` · ai-routing · effort L · **unclear**

**What.** memory-09-gap: ReflectSection.tsx:100-255 is backward-looking usage stats (conversation counts, peak hours), a genuinely different capability from a forward-looking day-ahead brief, which does not exist. memory-11-gap: grepping 'personaliz' across every settings section returns zero relevant hits — the connectors section handles connection/auth only, with no opt-in for connector insights to feed personalization. memory-05-gap: zero hits for any disclosure that memory may personalize search-provider queries, and whether it actually does server-side was not verified either way.

**Done when.** Determine first whether memory currently feeds tool-call query construction server-side and disclose it if so. Build a forward-looking brief as a distinct feature rather than repurposing Reflect; add an opt-in toggle on the Connectors settings page for connector data feeding personalization, separate from the chat-memory toggle.

**Where.** `apps/web/features/settings/sections/ReflectSection.tsx:100-255`, `packages/ui/ui/src/settings-nav.ts:161`

**From.** audit/competitive-gap-2026-08-15/domains/memory-personalization.json memory-09-gap, memory-11-gap, memory-05-gap

**Folded in.** memory-09-gap; memory-11-gap; memory-05-gap

### AI-55 — Internal task-complexity classification is computed for routing but never narrated to the user

`LOW` · ai-routing · effort S

**What.** agentic-modes-gap-05. request-processor.ts:441,450 carries a classifiedTaskType/RoutingTaskType concept used purely for internal model-routing; it never reaches the client as first-person narration, unlike competitor behaviour ('My initial assessment classified the task as simple…').

**Done when.** Surface the existing classifiedTaskType value as a first-person narration line in the agent activity timeline.

**Where.** `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:441,450`

**From.** audit/competitive-gap-2026-08-15/domains/agentic-modes.json agentic-modes-gap-05

### CONN-21 — No product-catalog design/UI skill wired into artifact generation, so named-skill narration can never occur

`LOW` · integrations · effort M

**What.** ART-CANVAS-03. The display mechanism exists (ToolTimeline.tsx:61-104,145-196 has a dedicated icon for any tool name containing 'skill'/'learn') and the real product skill runtime exists (packages/tools/skills, skill-catalog-service.ts), but no product-shipped SKILL.md for design/UI work exists outside dev tooling (.agents/skills is Claude Code environment tooling, not product skills), and nothing evidences artifact generation auto-selecting a named UI-design skill.

**Done when.** Author a product-catalog 'frontend design' skill and have HTML/React artifact generation prefer it when available; the display path already renders whatever name comes through.

**Where.** `apps/web/features/chat/components/messages/ToolTimeline.tsx:61-104,145-196`, `apps/web/lib/services/skill-catalog-service.ts`

**From.** audit/competitive-gap-2026-08-15/domains/artifacts-canvas-generative-ui-objects.json ART-CANVAS-03

### CONN-24 — No self-serve non-MCP 'Custom API' connector authoring path

`LOW` · integrations · effort XL

**What.** CPS-09. Grepped for 'Custom API', customApi, custom_api, 'REST API connector' — one unrelated comment hit, no feature. Every self-serve connector-authoring path requires the target to speak MCP.

**Done when.** Lowest priority — would require a new request-templating / auth-storage / execution subsystem independent of the existing MCP path.

**Where.** `apps/web/features/connectors/pages/ConnectorsPage.tsx`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts`

**From.** audit/competitive-gap-2026-08-15/domains/connectors-plugins-skills-mcp-custom-assista.json CPS-09

### CONN-25 — No plugin provenance reaches the skill autocomplete, so no attribution or skill-load narration is possible

`LOW` · integrations · effort M

**What.** CPS-10: use-skills-list.ts:10's SkillItem carries only a coarse 'source' tag, not a plugin name, and SlashCommandMenu.tsx:118-129's skillSuggestions mapping drops even that field; plugin_registry_entries.declared_skills is never joined into the skill catalog the composer consumes. CPS-11: grepped for 'Loaded.*skill', 'skill.*loaded', 'Using skill' — only unrelated store/loading-state code matched, so no disclosure narration exists for either sourcing path.

**Done when.** Thread plugin_id/plugin_name from plugin_registry_entries.declared_skills through skill-catalog-service.ts into the suggestion row, then add a one-line narration string distinguishing plugin-sourced from standalone skill loads.

**Where.** `apps/web/features/chat/hooks/use-skills-list.ts:10`, `apps/web/lib/services/skill-catalog-service.ts:57-83`, `apps/web/features/chat/components/Composer/SlashCommandMenu.tsx:118-129`

**From.** audit/competitive-gap-2026-08-15/domains/connectors-plugins-skills-mcp-custom-assista.json CPS-10, CPS-11

**Folded in.** CPS-10; CPS-11

### CONN-26 — Connector and plugin catalog browsing gaps: no data-source category, no example prompts, no provider-bundle toggle, no ratings primitive, no storefront category tabs

`LOW` · integrations · effort M

**What.** CPS-12: connectors.ts categories are all sub-filters within one flat 'Connectors' bucket, not a peer top-level 'Data sources' taxonomy entry. CPS-13: grepped connectors.ts and ConnectorsPage.tsx for examplePrompt/'sample prompt'/'Try:' — no matches; cards show name/description/category only. CPS-14: no first-party productivity-suite bundle toggle exists (zero hits for 'Google Workspace', masterToggle, bundleToggle). CPS-15: no custom-assistant-object route or feature exists anywhere in apps/web, so there is nothing for a star rating to attach to. CPS-16: apps/web/app/plugins/page.tsx:159 renders category as plain text per row, not a filterable tab nav, and every row is status='preview'.

**Done when.** Add an optional examplePrompt field to the connector data model and render it on the marketplace card; defer taxonomy rework, bundle toggles, ratings and storefront category tabs until there is real installable inventory (see WEB-31).

**Where.** `apps/web/features/connectors/data/connectors.ts`, `apps/web/features/connectors/pages/ConnectorsPage.tsx`, `apps/web/app/plugins/page.tsx:159`

**Blocked by.** CPS-16 half sequenced after WEB-31 (plugin registry has zero installable entries)

**From.** audit/competitive-gap-2026-08-15/domains/connectors-plugins-skills-mcp-custom-assista.json CPS-12..CPS-16

**Folded in.** CPS-12; CPS-13; CPS-14; CPS-15; CPS-16

### CONN-27 — No context-load control (lazy vs always-loaded) for installed tools; the only such setting was dead and was deleted

`LOW` · integrations · effort M

**What.** CPS-17. Grepped for 'Tool access mode', 'Load tools when needed', toolAccessMode across web and desktop — no shipped control, only a forward-looking comment at apps/desktop/src/features/settings/tabs/Capabilities/index.tsx:30 describing a pass that never landed. A related dead toolAccessMode setter in the shared settingsStore was found and DELETED as unused dead code by the FIXES-APPLIED remediation wave (settings-21-gap), so the setting no longer exists in any form. The parity matrix's 'Tool access mode' row is Partial with 'Desktop capabilities settings has first pass' only.

**Done when.** Only worth prioritizing if context-window pressure from always-loaded tool definitions becomes a measured problem; if built, ship the control and its enforcement in the same change rather than the field alone.

**Where.** `apps/desktop/src/features/settings/tabs/Capabilities/index.tsx:30`

**From.** audit/competitive-gap-2026-08-15/domains/connectors-plugins-skills-mcp-custom-assista.json CPS-17; docs/current/parity-implementation-matrix.md (Tool access mode)

### SEC-78 — No configurable safety fallback (switch model vs pause) when a message is flagged

`LOW` · security · effort M

**What.** settings-29-gap (competitive-gap-2026-08-15). SafetySection.tsx has exactly one toggle ('Reduce sensitive content'); no model-switch-on-flag or pause-on-flag control exists in Safety or Capabilities settings. Distinct from SEC-65 (moderation classifier lacks per-org thresholds, appeal/review state, audit events, eval sets) — that is the moderation backend, this is the per-user fallback behavior choice.

**Done when.** Not urgent ahead of a real per-message safety-flagging mechanism existing; expose the choice once that mechanism ships.

**Where.** `apps/web/features/settings/sections/SafetySection.tsx`

**From.** audit/competitive-gap-2026-08-15/domains/settings (settings-29-gap)
