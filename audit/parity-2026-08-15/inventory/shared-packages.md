# Shared TypeScript Architecture Inventory — `packages/*`

Audit date: 2026-08-15. Scope: `packages/ai/*`, `packages/client/*`, `packages/contracts/*`, `packages/guardian/*`, `packages/platform/*`, `packages/tools/*`, `packages/ui/*`. Consumer counts are `rg -l "@agiworkforce/<pkg>\b"` per `apps/*` surface; every count was spot-checked by opening the matching files, not trusted blind.

---

## 0. Headline verdict — is there ONE chat implementation?

**NO. There are at least four parallel chat implementations, and the shared package is not what the primary web surface actually renders.**

| Surface                                                       | Live/default chat route                                                                                              | What it renders                                                                                                                                                                                                                              | Uses `@agiworkforce/unified-chat`?                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop                                                       | `App.tsx:1976` (unconditional, no flag)                                                                              | `DesktopShellV3` → `ChatInterface`                                                                                                                                                                                                           | **Yes, genuinely.** `apps/desktop/src/features/v3/DesktopShellV3.tsx:7-13` imports `ChatInterface`, `ChatInterfaceProps`, `ChatMessage`, `ChatRuntime` straight from the package.                                                                                                                                                                                                 |
| Web (primary: `/`, `/chat`, `/chat/[sessionId]`)              | `WebChatRoot` (`apps/web/features/chat/components/WebChatRoot.tsx:18`) → `WebChatPage`                               | 4,407-line `WebChatPage.tsx` importing its **own** `ChatMessageList` (1,593 lines), `MessageBubble` (2,254 lines), `ChatComposerNew` (3,621 lines) from `apps/web/features/chat/components/**`                                               | **No, only incidentally** — three named imports (`UsageWarningBanner`, `LocalByokHandoffDialog`, `ChatMessage` type; `WebChatPage.tsx:17,168`) and a `SendPreview`/`useCapability`/`BUILT_IN_SLASH_COMMANDS` import inside the local composer (`ChatComposerNew.tsx:69`). None of the actual message-rendering or input-composing code is shared.                                 |
| Web (secondary: `/agi-work`, `/chat/code`, `/chat/schedules`) | `WebShellV3` (`apps/web/features/chat/v3/WebShellV3.tsx:5-9`)                                                        | `ChatInterface` from the shared package                                                                                                                                                                                                      | Yes — but this is a secondary "Work"/"Code" mode, not the surface most users hit at `/` or `/chat/[sessionId]`.                                                                                                                                                                                                                                                                   |
| Mobile                                                        | `apps/mobile/app/(app)/chat/[id].tsx`                                                                                | Fully independent React Native components: `MessageBubble.tsx` (1,124 lines), `MessageList.tsx` (286), `ChatInput.tsx` (1,249), `Composer/Composer.tsx` (140), all under `apps/mobile/src/features/chat/components/`                         | **No.** The only repo-wide reference to `@agiworkforce/unified-chat` from mobile is a _comment_ in `apps/mobile/src/lib/capabilities.tsx:5-7` explaining mobile can't import it because it pulls `react-dom`. This is architecturally justified (RN can't run web React components) but means zero code-level sharing beyond the pure capability matrix in `@agiworkforce/types`. |
| Chrome extension                                              | `apps/extension/src/side_panel.ts` (10,933 lines, vanilla TS/DOM, no React, no `react` dependency in `package.json`) | Hand-written composer/message DOM manipulation. Comment at `side_panel.ts:9352-9354`: "Mirrors `packages/ui/unified-chat/ChatInput.tsx`..." — i.e. behavior is manually re-derived from reading the shared component's source, not imported. | **No.** Zero import of the package anywhere in `apps/extension`.                                                                                                                                                                                                                                                                                                                  |
| VS Code extension                                             | `apps/extension-vscode/src/features/chat-participant/chatParticipant.ts` + `sidebar-webview/`                        | Uses VS Code's native `vscode.ChatParticipant` API plus a separate webview                                                                                                                                                                   | **No** (architecturally reasonable — it plugs into VS Code's own chat UI rather than shipping one).                                                                                                                                                                                                                                                                               |

**Consequence of the drift:** the web team's local `MessageBubble.tsx` (2,254 lines) is over 2x the shared package's `MessageBubble.tsx` (924 lines, `packages/ui/unified-chat/src/components/MessageBubble.tsx`), and web's local `ChatComposerNew.tsx` (3,621 lines) dwarfs the shared `ChatInput.tsx` (1,422 lines). A fix landed in the shared package (e.g. a markdown-rendering bug, an attachment-cap change, a paste-image handler) does not reach: web's primary chat surface, mobile, or the Chrome extension — only desktop and web's secondary Work/Code mode. The extension explicitly documents that its paste-image logic is a manual mirror of the shared component, which is a standing invitation to drift further.

Note that the shared package itself (`packages/ui/unified-chat`) is real and substantial — not a stub. `ChatInterface.tsx` is 1,063 lines, `MessageList.tsx` 393, `ChatInput.tsx` 1,422, `MessageBubble.tsx` 924, plus ~70 other components (composer toolbar, artifact panel, tool-call cards, command palette, project gallery, settings modal, etc., `packages/ui/unified-chat/src/components/`). Desktop's full adoption proves the abstraction works end-to-end. The problem is adoption, not the package's quality.

---

## 1. Package-by-package inventory

### `packages/ai/agent-core` (`@agiworkforce/agent-core`)

- **Provides:** `context.ts` (context-window budget/compaction/summarization: `compactContext`, `computeContextBudget`, `deterministicContextSummary`, token estimators) and `memory.ts` (memory scoring: `boostMemoryImportance`, `decayMemoryImportance`, `memoryRelevanceScore`, embedding cosine similarity). **Two files, no more.**
- **Consumers:** extension-vscode (3), mobile (6), web (2); desktop and cli (0).
- **Verdict on "is there a real agent runtime":** **NO — thin wrapper, mislabeled.** Despite the name, there is no planning loop, tool-call loop, subagent orchestration, checkpoint/resume, or approval-gate code anywhere in this package (`packages/ai/agent-core/src/` contains only `context.ts`, `memory.ts`, `index.ts`, and their tests). A repo-wide grep for `tool.?loop|subagent|checkpoint.*resume|approval.*gate` inside `packages/ai/*` turns up only incidental string matches in provider wire-format/routing code, not an implementation. The real tool-loop scaffolding is described as living in `packages/ai/provider-runtime` per that package's own `AGENTS.md` ("AGI-owned tool-loop scaffolding"), but `provider-runtime/src/` only contains streaming/retry/failover/fallback/gateway/watchdog modules — no loop control flow either. The actual agent loop, approvals, and checkpoint/resume logic (if it exists) live inside each app (Desktop's Rust `src-tauri/src/core/agi/`, CLI's Rust `src/agent/`), not in this shared TS package. **Classification: MISLEADING NAME / PARTIAL** — real, tested utility functions, but not an agent runtime.

### `packages/ai/model-registry` (`@agiworkforce/model-registry`)

- **Provides:** compiled model catalog (`generated/registry.ts`/`.json`) built by `scripts/compile.mjs` from `catalog/models.curation.json` + `catalog/models.synced.json`, plus `catalog/retired-models.json`, `catalog/routing-policies.json`, `catalog/harnesses.json`, `catalog/speech-artifacts.json`.
- **Consumers:** direct TS importers are narrow — `packages/ai/routing` (`task-family-routing.ts`, `auto.ts`), `packages/ai/search` (`web-search-support.ts`), and the provider catalog files (`packages/ai/providers/*/src/catalog.ts`, 10 providers). Desktop's `package.json` lists it but the real consumption path for desktop is the **generated Rust mirror**: `packages/ai/model-registry/scripts/compile.mjs:80` emits `crates/agiworkforce-model-registry/src/generated/model_registry.rs` (`pub const MODEL_REGISTRY_JSON: &str = include_str!(...)`), consumed natively by the CLI/Desktop Rust code. This is a genuine cross-language codegen bridge, not duplication.
- **`packages/contracts/types/src/models.json`** (2,324 lines) is explicitly a **generated compatibility artifact** per `packages/ai/model-registry/AGENTS.md` ("remains a generated compatibility artifact while consumers migrate... Do not edit directly"), fed by `catalog/models.curation.json`. It is the file most consumers (routing, fallback, catalog helpers in `@agiworkforce/types`) actually import from, so the "real" source of truth (`models.curation.json`) is one hop upstream of most call sites.
- **Capabilities:** expressed per-model in the registry (tool support, context window, modalities, pricing) — verified real (not guessed) via a `verificationLog` array at the top of `models.json` recording per-correction provenance (source URL, date, verifier).
- **Routing/fallback:** `packages/ai/provider-runtime/src/fallback.ts` builds an ordered fallback chain (`same-provider-cheaper` / `economy-tier` / `cross-provider` strategies) driven entirely by `getEconomyFallbackModels`/`getModelMetadataById`/`getModelsForProvider` from `@agiworkforce/types` — **model IDs are never hardcoded in the fallback logic**, matching the repo-wide "never hardcode model IDs" rule.
- **Outage handling:** explicitly **reactive, not proactive** — `fallback.ts:53-56` documents: "We do NOT eagerly health-check each model because that would explode the per-attempt latency budget." Fallback triggers on classified failures (consecutive 529s, capacity off-switch, safety refusal, invalid-model-after-redirect) surfaced as `FallbackTriggeredError`, not a circuit breaker or background health prober.
- **Retirement:** `catalog/retired-models.json` lists ~30 explicitly retired model IDs plus a `guardedNonCanonicalModelIds` allowlist of historically-wrong/mock IDs. Its only real consumers are **CI/lint guards** — `scripts/check-model-catalog-integrity.mjs` and `scripts/check-no-hardcoded-model-ids.mjs` — which block reintroduction of retired/fake IDs at commit/CI time. There is **no packages-level runtime function that migrates a persisted conversation's stored `modelId`** when its model retires; that logic (`isModelStillCurrent`-style checks against `deprecated`/`deprecation_date`) is implemented ad hoc inside `apps/web/shared/stores/model-store.ts` rather than as a shared package utility, so desktop/mobile equivalents (present per test files `apps/desktop/src/__tests__/lib/cloudChatPersistence.test.ts`, `apps/mobile/__tests__/model-display-name.test.ts`) are independently implemented rather than sharing one migration function.

### `packages/ai/provider-protocol` (`@agiworkforce/provider-protocol`)

- **Provides:** pure request-shaping functions — OpenAI Responses-API policy, reasoning-effort resolution, system-prompt cache-boundary splitting, `openai-wire-compat.ts` for byte-identical OpenAI wire format. Explicitly no IO, no SDKs (per its `AGENTS.md`).
- **Consumers:** web only (13 files); desktop/extension/mobile/cli 0.
- **Note:** partially ported from OpenClaw (MIT) per its `AGENTS.md`; license-porting attribution guarded by `pnpm check:licenses`.

### `packages/ai/provider-runtime` (`@agiworkforce/provider-runtime`)

- **Provides:** `streamFromProvider`, retry/retry-after, `failover.ts` (`CredentialFailoverState`), `fallback.ts` (model fallback chains — see above), `gateway.ts` (gateway detection), `watchdog.ts`, `history.ts`, `headers.ts`, `base-url.ts`, `errors.ts`.
- **Consumers:** web (8), mobile (3), extension (1); desktop/cli 0. Desktop's equivalent streaming/retry logic is presumably Rust-native (not verified in this scope).

### `packages/ai/providers/*` (14 leaf packages: anthropic, deepseek, factory, google, lmstudio, minimax, moonshot, ollama, openai, openrouter, perplexity, qwen, xai, zhipu)

- No shared root `package.json` — each is an independent workspace package (`@agiworkforce/providers-<name>`). `factory` composes all of them (`packages/ai/providers/factory/package.json` depends on every leaf adapter) and exposes a single dispatch surface with real tests (`index.test.ts`, `live-stream-smoke.test.ts`).
- Each adapter's `catalog.ts` imports from `@agiworkforce/model-registry`'s generated registry — real wiring, not hardcoded model lists.

### `packages/ai/routing` (`@agiworkforce/routing`)

- **Provides:** `auto.ts` (Auto-mode model selection), `classify.ts`/`task-family.ts`/`task-family-routing.ts` (prompt→task-family classification feeding `routing-policies.json`'s `autoProfileByTask`), `task-family-continuity.ts`, `model-switch-cache.ts`, `pricing.ts`, `indic.ts`.
- **Routing policy is data-driven:** `packages/ai/model-registry/catalog/routing-policies.json` defines `tierAllowedSlots` (free/pro/max/enterprise/byok), `tierMaximumProfiles`, and `autoProfileByTask` mapping task families (simple_chat, coding, reasoning, agentic, computer-use) to economy/balanced/premium profiles — a real per-plan routing matrix, not ad hoc if/else.
- **Consumers:** genuinely cross-surface — web (18), extension (4), mobile (3), desktop (2), extension-vscode (2).

### `packages/ai/search` (`@agiworkforce/search`)

- **Provides:** `web-search-support.ts` and related — web-search capability gating tied to model registry entries.
- **Consumers:** web (4), mobile (2); desktop/extension/cli 0.

### `packages/client/client-runtime` (`@agiworkforce/client-runtime`)

- **Provides:** `command.ts`/`desktop-command.ts` (typed command dispatch), `detect.ts`, `mode.ts` (app-mode detection — local/BYOK/cloud), `deviceAuthorization.ts`, `agentActivity.ts`, `events.ts`, `http.ts`, `registry.ts`, plus Node/browser split entry points.
- **Consumers:** genuinely cross-surface — desktop (13), web (9), mobile (6), extension (5), extension-vscode (3).

### `packages/client/desktop-command-client` (`@agiworkforce/desktop-command-client`)

- **Provides:** typed wrappers for "1,062+ Tauri commands" per its own doc comment (`src/index.ts:1-8`), one module per Rust command domain.
- **Consumers:** desktop only (30) — correctly single-consumer since it is a 1:1 typed bridge to Desktop's own Tauri backend; not a "should be shared more" case.

### `packages/client/sync` (`@agiworkforce/sync`)

- **Provides:** pure, cross-surface delta-sync **apply logic** — `cursor.ts` (bigint cursor comparison, `maxCursor`, safe-frontier advancement), `conversations.ts`, `messages.ts` (merge-by-id + ordering), `memory.ts`, `projects.ts`, `settings.ts` (three-way JSON merge: `mergeCloudSafeSettings`, `mergeJsonObjects`, prototype-pollution-safe key filtering via `UNSAFE_OBJECT_KEYS`).
- **What syncs, between which surfaces:** per `src/index.ts:1-14`, this "de-triplicates the apply rules that used to be hand-copied across mobile's `cloudSyncEngine.ts` (TS/Zustand) and desktop's `cloud_sync.rs` (Rust/SQLite)." **Rust cannot import this TS module** — desktop's Rust code re-implements the same rules natively and parity is enforced by replaying shared golden fixtures (`src/__fixtures__/cursor-compare.json`, `pull-apply.json`, `push-body.json`) against both the TS tests and `cloud_sync.rs`'s `#[cfg(test)]` fixture-replay module. Web only consumes cursor mechanics for a pull-only artifact overlay; conversation/message persistence stays server-owned for web.
- **Conflict resolution:** cursor-based, server-authoritative (bigint `server_version` comparisons, never a raw lexicographic string compare — explicitly guarded against the "9" vs "10" bug). Settings use a three-way JSON merge with server-revision tiebreaking (`settings.ts:121-143`, "conflict resolution uses the last observed server revision"). This is last-writer-wins-by-revision, not a CRDT.
- **Real, well-tested cross-language contract**, though the Rust side is a separate implementation kept honest by fixture replay rather than one shared binary.
- **Consumers:** desktop (3), mobile (4), web (2).

### `packages/contracts/cloud-contracts` (`@agiworkforce/cloud-contracts`)

- **Provides:** canonical managed-cloud wire contracts (Zod schemas, endpoint paths, stream deltas, typed clients) across a guard-enforced module list (generated-files, library, managed-media, me, sync, settings, projects, conversations, tool-events, tool-approval-resume, connectors, capability-handshake — enforced by `scripts/check-cloud-contract-ownership.mjs`).
- **Consumers:** the widest-adopted contracts package by far — web (109), desktop (40), mobile (28), extension (18), extension-vscode (2). This is real, load-bearing shared infrastructure, not a passthrough shell.

### `packages/contracts/compliance` (`@agiworkforce/compliance`)

- **Provides:** EU AI Act Article 50 transparency primitives — `article50-disclosure.ts` (first-run AI-interaction disclosure), `article50-marker.ts` (C2PA-2.1-style machine-readable provenance marker for generated media), `article50-text.ts` (verbatim legal text + source URL), `llm-gate.ts` (pre-first-call HTTP gate), `provider-jurisdiction.ts` (Chinese-HQ provider default-off registry, PRD V5 R-023).
- **Consumers:** mobile (11) — mobile genuinely imports and uses this package, including a dedicated `/legal/article-50` screen. **Web (1 file) does NOT actually import it** — desktop (0) doesn't either.
- **CONFIRMED BUG — cross-surface interoperability broken:** `apps/web/lib/compliance/ai-act.ts` is a **hand-restated duplicate** of the package's marker shape, explicitly because "`@agiworkforce/compliance` is not a declared dependency of `@agiworkforce/web`; adding one is a manifest + lockfile change that has to land on its own" (`ai-act.ts:35-38`). The same file documents a real, acknowledged serialization bug in the shared package: `packages/contracts/compliance/src/article50-marker.ts:138` — `serialiseClaim` does `JSON.stringify(claim, Object.keys(claim).sort())`, using an **array replacer as a global key allowlist applied at every nesting depth**, not just the top level. Since nested `assertions[].label`/`.action` keys aren't in the top-level claim's key list, they get stripped, so mobile's real emitted sidecar serializes `assertions` as `[{}]`. Web's `hasAiGeneratedProvenance()` (`ai-act.ts:192-201`) would therefore **reject mobile's own output** were the two ever compared, despite the file's claim that "field names mirror `@agiworkforce/compliance`... so the two surfaces are wire-compatible by type. **They are NOT interoperable in practice today.**" (`ai-act.ts:26-33`, verbatim). This is a genuine, source-confirmed BROKEN classification on `article50-marker.ts`'s `serialiseClaim`.
- Web's file also self-documents a **known compliance gap**: "Streamed chat text is NOT marked on any surface and there is no web audio-generation route — both are open gaps, not something this module quietly handles" (`ai-act.ts:16-18`), and that the Article 50(1) explicit-disclosure sentence was deliberately removed from web's composer on 2026-08-14 based on an unreviewed legal carve-out argument (tracked in `DPDP_PROGRESS.md` per the comment), while mobile keeps its explicit disclosure screen. **Classification: PARTIAL / BROKEN (web duplicate) with a real known drift risk.**

### `packages/contracts/licensing` (`@agiworkforce/licensing`)

- **Provides:** offline-verifiable enterprise licensing primitives — `EditionSchema`/`LicenseClaimsSchema`, `verifySignedContainer`, `verifyLicense`, org-policy schema + `checkPolicyTightening`/`verifyOrgPolicy`. Self-documented (`src/index.ts:9-11`) as "NOT wired into any app runtime, UI, or enforcement path — that is a later, separately-scoped step."
- **Consumers: ZERO** across every app (`cli/desktop/extension/extension-vscode/mobile/web` all show 0). The only repo-wide references outside the package's own source/tests are: `scripts/check-cloud-contract-ownership.mjs` (a string mention, not an import) and a **separate Rust crate** `crates/agiworkforce-licensing/src/lib.rs`, whose doc comment (`lib.rs:6`) says it mirrors "`@agiworkforce/licensing` package... including its" (design), but is its own independent Rust implementation, not a code-sharing bridge like model-registry's codegen. **Classification: HIDDEN/DEAD by design** — a real, tested primitive with a documented "not enforced anywhere yet" status. Not a bug per se (it says so itself), but worth flagging: two independent, unverified-parity implementations (TS package + Rust crate) of enterprise licensing exist, with no fixture-replay contract test between them (unlike `sync`'s Rust/TS parity harness).

### `packages/contracts/trust-boundaries` (`@agiworkforce/trust-boundaries`)

- **Provides:** exactly one module, `egress-policy.ts` (92 lines) — `OUR_CLOUD_HOSTS` allowlist + `matchesCloudHost` boundary-safe suffix matcher.
- **Is the boundary "encoded in types and enforced at runtime, or just documented"? — Genuinely enforced at runtime, and this package exists specifically because prior per-surface enforcement had already drifted.** Its own header comment is the single best piece of evidence for the audit's "duplicated implementations that drifted" ask: "desktop and mobile each defined their own copy and the allowlists DRIFTED — desktop blocked `vercel.app` (mobile didn't); mobile blocked `clerk.dev` + `clerk.services` (desktop didn't). Each surface therefore failed to block some of our-cloud hosts the other blocked — **a potential Local-mode leak**." (`egress-policy.ts:10-16`). The fix reconciled both into a safe union.
- **Consumers:** `apps/desktop/src/lib/egressGuard.ts` and `apps/mobile/lib/egressGuard.ts` both import this package directly and are each used from ~20-30 call sites (auth, streaming, attachments, billing, cloud persistence) confirmed via grep — this is real, wired, widely-invoked runtime enforcement, not documentation-only. Web is correctly absent as a consumer (web IS the cloud; it has no local/cloud egress boundary to guard).
- Deliberately excludes BYOK provider hosts (`api.anthropic.com`, `api.openai.com`, etc.) so direct BYOK streaming is never blocked — correct per the repo's trust-boundary rules.
- **Classification: COMPLETE**, and a good historical case study in exactly the class of drift this audit is looking for (this package is the fix, not the bug).

### `packages/contracts/types` (`@agiworkforce/types`)

- **Provides:** the widest-shared package in the repo — 566 consumer files across every surface. 57 top-level source files plus subdirectories for `capability-handshake`, `design-system`, `enterprise`, `generated`, `sessions`. Houses `models.json` (the generated model-catalog compatibility artifact), `capabilities.ts` (platform capability matrix consumed by both web's `unified-chat` React layer and mobile's non-React `capabilities.tsx` adapter), `model-catalog.ts` (catalog helper functions used by fallback/routing).
- Correctly the base of the dependency graph — no evidence of it being a passthrough shell; it carries real schema/logic (`model-catalog.ts` helpers, capability matrix).

### `packages/guardian/core` + `packages/guardian/github` (`@agiworkforce/guardian-core`, `@agiworkforce/guardian-github`)

- **Provides:** a CI code-review bot — versioned finding schema (Zod), fingerprinting, `.agi-guardian.yml` policy parsing, verification gate (path/line existence, diff relevance, dedup, no-speculative-LLM-findings rule), scanner adapters (eslint, knip, gitleaks with secret stripping, semgrep, generic repo-check), GitHub webhook HMAC verification, event normalization, Check-Run builders, PR summary builder, and a `scan` CLI.
- **Consumers across `apps/*`: ZERO** (expected — this is CI infrastructure, not app code). **Real consumer confirmed:** `.github/workflows/guardian.yml` runs `pnpm --filter @agiworkforce/guardian-github scan` on push/PR events (`.github/workflows/guardian.yml:73`), publishing 4 category Check Runs plus a "Final Policy" check on every PR. Per `docs/guardian/IMPLEMENTATION_STATUS.md`, this has already produced a live scan against the repo with 67+40 tests green and one real advisory finding. **Classification: COMPLETE, correctly zero-app-consumer by design** (a CI tool, not a product package) — flagging it in the "zero consumers" list would be a false positive if evaluated only against `apps/*` imports.

### `packages/platform/artifacts` (`@agiworkforce/artifacts`)

- **Provides:** cross-surface artifact mechanics — `artifact-derivation.ts`, `artifact-store.ts`, `artifact-sync.ts`, `artifacts.ts`. Pure TS; hosts inject I/O.
- **Consumers:** web (13), desktop (6), mobile (5) — genuinely cross-surface.

### `packages/platform/data-layer` (`@agiworkforce/data-layer`)

- **Provides:** swappable backend adapters — `adapters/clerk.ts` (auth), `adapters/neon.ts`/`postgres.ts` (DB), driven by env vars (`AGI_DATABASE_PROVIDER`, `AGI_AUTH_PROVIDER`, etc.) via `factory.ts`'s `create*Client()` functions.
- **Consumers:** web only (96) — this is _correctly_ single-consumer, not a "should be shared more" case: it is a server-side backend-infrastructure abstraction (Neon Postgres + Clerk auth) that only web's Next.js API routes talk to directly; desktop/mobile/extension reach the same backend through web's HTTP API (`cloud-contracts`), not this package. Labeling this a gap would be a false positive.

### `packages/platform/local-llm` (`@agiworkforce/local-llm`)

- **Provides:** on-device inference tier selector — Tier 1 (OS-resident Apple/Google runtimes), Tier 2 (`react-native-executorch`), Tier 3 (`llama.rn` universal fallback), multimodal artifact resolution with checksum verification (`ChecksumMismatchError`).
- **Consumers:** mobile only (36) — **correctly platform-specific**, not an architecture smell. Desktop's on-device LLM handling is implemented entirely in Rust (`apps/desktop/src-tauri/src/core/llm/`, `llm_router.rs`, `llm_executor.rs`) since Desktop is a Tauri app; there is no shared abstraction between mobile's TS local-LLM stack and desktop's Rust one, but that is inherent to the two runtimes (RN modules vs. native Rust), not an unforced duplication.

### `packages/platform/utils` (`@agiworkforce/utils`)

- **Provides:** genuinely broad utility grab-bag — `async.ts`, `crypto.ts`, `debounce.ts`, `errors.ts`, `fence.ts` (prompt-injection fencing), `logger.ts`, `managedChatIdempotency.ts`, `managedMediaIdempotency.ts`, `pathContainment.ts`, `privacyHandoff.ts`, `reasoning.ts`, `retry.ts`, `sensitiveFiles.ts`, `signaling.ts`, `uuidv7.ts`, `validation.ts`.
- **Consumers:** the second-most cross-surface package after `types`/`cloud-contracts` — desktop (22), mobile (33), web (20), extension (7), extension-vscode (3). Real shared abstraction.

### `packages/tools/apply-patch` (`@agiworkforce/apply-patch`)

- **Provides:** `apply-update.ts`, `parse.ts`, `node-fs-bridge.ts`, `types.ts` — a patch-application tool with a Node-fs bridge for I/O injection.
- **Consumers:** desktop (2), web (1); mobile/extension/cli 0. CLI (the surface most likely to need patch-apply) is Rust and does not use this.

### `packages/tools/browser-tool` (`@agiworkforce/browser-tool`)

- **Provides:** Playwright-core-backed browser automation primitives — `snapshot.ts` (accessibility-tree/AI-role element snapshotting with stable `ref` ids for click/type targeting, modeled on OpenClaw's snapshot modes), `profile.ts`, `types.ts`.
- **Consumers: ZERO, confirmed by the package's own README.** `packages/tools/browser-tool/README.md` states outright: "**Consumers: None today.** No file in the repository imports this package... `apps/extension/package.json` still lists `"@agiworkforce/browser-tool": "workspace:*"`, but that entry is now stale. The extension's only importer was a type-only import..., and that file was deleted with its bridge in `bfce749b3` (2026-08-09) because the bridge had no caller." Also confirms: "Desktop browser automation is a separate Rust/CDP stack under `apps/desktop/src-tauri/src/automation/browser`, and Web does not use this package at all. Neither has ever depended on it." **Classification: DEAD** — real, tested code with a real, coherent invocation contract, but currently reachable from nowhere. Its own README recommends dropping the stale `apps/extension/package.json` dependency entry next time a lockfile change is safe to land.

### `packages/tools/mcp` (`@agiworkforce/mcp`)

- **Provides:** thin, well-documented wrapper over the official `@modelcontextprotocol/client` SDK v2 — `resolveMcpTransport` (stdio / sse-deprecated / streamable-http), `connectMcpServer`, `buildMcpToolCatalog`. Protocol-era auto-negotiation (`server/discover` probe → 2026-07-28 semantics, else fallback to 2025 `initialize` handshake). `McpServerConfig` shape intentionally mirrors OpenClaw's config type for ecosystem compatibility.
- **Invocation contract:** real and wired. Web genuinely calls it from `apps/web/lib/mcp-tool-executor.ts`, `apps/web/lib/user-connector-tools.ts`, and `apps/web/app/api/mcp/route.ts`/`apps/web/app/api/connectors/custom/route.ts`, backed by contract tests (`mcp.security.test.ts`, `oauth-connector-lifecycle.contract.test.ts`).
- **Consumers:** web (12), desktop (3); mobile/extension/cli 0. **Classification: COMPLETE for web**, unreached from mobile/extension/CLI (which may be intentional given MCP servers are typically desktop/server-side tools, not verified further in this scope).

### `packages/tools/skills` (`@agiworkforce/skills`)

- **Provides:** `loader.ts`, `frontmatter.ts`, `format.ts`, `integrity.ts` (checksum verification), `merge.ts`, `tool.ts`, `types.ts` — a skill-file loading/validation/execution pipeline.
- **Consumers:** web (8), desktop (2); mobile/extension/cli 0.

### `packages/ui/design-tokens` (`@agiworkforce/design-tokens`)

- **Provides:** `index.ts` (437 lines — CSS variable definitions, `agiExtensionCssVars`, `cssVarsToString`) and `chat.css` (196 lines).
- **Consumers:** genuinely cross-surface but thin — desktop (3), mobile (6), extension (2), extension-vscode (2), web (2). Extension's usage is real, not decorative: `apps/extension/src/tokens.ts` calls `cssVarsToString(agiExtensionCssVars[...])` to emit `:root`/`:host` CSS variable blocks for both dark and light (`prefers-color-scheme`) — real token consumption from a non-React, non-Tailwind surface, including a fixed 2026-related bug note in its own comments about a light-mode-appearing-as-dark-slab regression.
- **Ad-hoc bypass is common in the two heaviest consumers:** a rough hex-literal grep found **294 hardcoded `#rrggbb` occurrences in `apps/desktop/src`** and **119 in `apps/web/features` + `apps/web/shared`** (excluding tests) — i.e. both of the two surfaces that most heavily use the design system also routinely bypass it with inline hex colors rather than tokens.

### `packages/ui/i18n` (`@agiworkforce/i18n`)

- **Consumers:** desktop (6), mobile (5), web (4); extension/extension-vscode/cli 0.

### `packages/ui/ui` (`@agiworkforce/ui`)

- **Provides:** a real shadcn/Radix-style primitive library — 55 components in `src/primitives/` (`Button`, `Dialog`, `DropdownMenu`, `Command`, `DataTable`, `Sheet`, `Toast`, `Tabs`, `Select`, `Calendar`, `Carousel`, etc.), plus `settings-modal/` and `sidebar/` composite directories, `ProviderMark`/`AgiMark` brand components, `useUiTranslation` i18n hook, `cn` classnames helper.
- **Consumers:** web (114), desktop (55). **Zero for extension, extension-vscode, mobile, cli.** Extension and VS Code are non-React-component-tree surfaces (vanilla DOM / webview HTML strings) so React-primitive reuse isn't directly applicable there without a porting layer; mobile is React Native, which cannot render these DOM/Radix-based primitives at all — same constraint as `unified-chat`.
- **Classification: COMPLETE and real for web+desktop**; correctly unreachable (not a gap) for RN/non-React surfaces without a parallel RN primitive set (which does not exist — mobile has its own local UI primitives, not audited in this pass).

### `packages/ui/unified-chat` (`@agiworkforce/unified-chat`)

- Covered in depth in §0 above. **Provides:** the full surface-neutral chat UI system (~75 components + stores/hooks/lib under `src/`), real and substantial, not a shell.
- **Consumers:** desktop (64), web (63, but concentrated in the secondary WebShellV3/Work/Code surface plus a handful of type-only imports from the primary surface), mobile (1, a comment only — zero real usage); extension/extension-vscode/cli 0.

---

## 2. Packages with ZERO real app consumers

| Package                                                                                | Status                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@agiworkforce/licensing` (`packages/contracts/licensing`)                             | Self-documented as intentionally unwired ("NOT wired into any app runtime, UI, or enforcement path"). A parallel, unverified-parity Rust crate (`crates/agiworkforce-licensing`) exists with no fixture-replay contract test between the two, unlike `sync`. |
| `@agiworkforce/browser-tool` (`packages/tools/browser-tool`)                           | Confirmed dead by its own README. Stale dependency entry still sits in `apps/extension/package.json` after its only importer was deleted 2026-08-09.                                                                                                         |
| `@agiworkforce/guardian-core`, `@agiworkforce/guardian-github` (`packages/guardian/*`) | Zero app consumers, but this is _correct_ — real, live consumer is `.github/workflows/guardian.yml`, not `apps/*`. Not a gap.                                                                                                                                |

## 3. Packages consumed by only one surface that plausibly should be shared wider

- `@agiworkforce/provider-protocol` — web-only (13 files); desktop/mobile/extension all talk to LLM providers too and would presumably benefit from the same OpenAI-wire-compat/reasoning-effort normalization, unless they each have independent equivalents not covered in this scope.
- `@agiworkforce/mcp` — web (12) + desktop (3) only; if mobile or the extension ever need MCP connector execution, no shared client exists for them yet.
- `@agiworkforce/skills` — web (8) + desktop (2); mobile/extension have no skills pipeline via this package.
- `@agiworkforce/search` — web (4) + mobile (2); desktop/extension absent.

(`@agiworkforce/data-layer` and `@agiworkforce/local-llm` are single-surface but _correctly_ so per §1 — excluded from this list.)

---

## 4. Summary of duplicated/drifted implementations found

1. **Chat UI (the headline finding, §0):** unified-chat (desktop + web-secondary) vs. web's legacy `WebChatPage`/`ChatComposerNew`/`MessageBubble`/`ChatMessageList` vs. mobile's independent RN components vs. the extension's vanilla-DOM `side_panel.ts` that manually mirrors the shared composer via comments rather than imports.
2. **Article 50 AI-generated-content marker (`packages/contracts/compliance`):** web hand-restates the shape in `apps/web/lib/compliance/ai-act.ts` instead of depending on the package, and the package's own `serialiseClaim` has a confirmed nested-object serialization bug that would silently strip `assertions` from mobile's real output if the two were ever compared — self-documented as "NOT interoperable in practice today."
3. **Trust-boundary egress allowlist (`packages/contracts/trust-boundaries`):** historical case, already fixed — desktop and mobile each had their own `OUR_CLOUD_HOSTS`-equivalent list that had drifted (desktop missing `clerk.dev`/`clerk.services`, mobile missing `vercel.app`), reconciled into this shared package. Cited here as evidence of the exact drift pattern the audit is looking for, now remediated.
4. **Cross-device sync apply logic (`packages/client/sync`):** not drifted today, but structurally at risk — the canonical implementation is TS-only; Rust (desktop) maintains an independent reimplementation kept honest solely by golden-fixture replay tests, not a single shared binary. A change to `packages/client/sync` that isn't mirrored into `cloud_sync.rs` (and vice versa) would only be caught if the fixture suite is exercised on both sides in CI — worth confirming that gate actually runs both suites on every change (not verified in this pass, out of scope).
5. **Enterprise licensing (`packages/contracts/licensing` vs. `crates/agiworkforce-licensing`):** two independent implementations of the same signed-container/claims verification logic in two languages, with no fixture-replay parity test analogous to `sync`'s, and the TS side is unwired into any runtime.
6. **Model retirement/migration:** the retirement list (`retired-models.json`) is enforced only as a CI/authoring-time guard; the runtime "this conversation's model was retired, here's what to show/do" logic is reimplemented per-surface (web's `model-store.ts` at minimum) rather than centralized in `@agiworkforce/model-registry` or `@agiworkforce/types`.

---

## 5. Architecture-question answers (condensed)

- **`unified-chat`: ONE implementation or drifted parallels?** Drifted parallels — see §0. Desktop is the only surface where the shared package is unambiguously the live, default, unconditional chat UI.
- **`model-registry` + `models.json`:** Curated JSON (`models.curation.json`) → compiled TS registry + generated Rust mirror (`crates/agiworkforce-model-registry`) → `models.json` as a generated compatibility artifact most consumers still import. Capabilities are metadata-driven and provenance-logged. Routing/fallback is data-driven (`routing-policies.json`) and hardcode-free by construction (guarded by `scripts/check-no-hardcoded-model-ids.mjs`). Outage handling is reactive per-attempt fallback, not health-checked. Retirement is a CI-time guard; runtime migration of old conversations' stored model IDs is per-surface, not shared.
- **`agent-core`: real runtime or thin wrapper?** Thin wrapper — two files (context budgeting, memory scoring). No planning/tool-loop/subagent/checkpoint/approval code exists anywhere in `packages/ai/*`; that logic (if centralized at all) lives in each app's native layer, not in this shared package.
- **`tools/*`:** `apply-patch` (desktop+web), `browser-tool` (dead, zero consumers, confirmed by its own README), `mcp` (real, wired, web-primary), `skills` (real, web+desktop). CLI (Rust) uses none of them — it has its own Rust-native `src/agent`, `src/mcp`, `src/routing`, `src/models`, `src/safety` modules, bridged to the TS model registry only via generated codegen, not via these tool packages.
- **`trust-boundaries`:** Genuinely enforced at runtime (desktop + mobile `egressGuard.ts`, ~20-30 call sites each), not just documented — and the package exists specifically because prior undocumented, per-surface enforcement had already drifted and under-blocked in both directions.
- **`design-tokens` + `ui`:** Real design system (55 Radix-style primitives). Web (114 files) and desktop (55 files) are the real adopters; both surfaces also carry hundreds of ad-hoc hardcoded hex colors alongside it (294 in desktop, 119 in web, rough grep). Mobile/extension/VS Code cannot consume the React-based `ui` package at all (RN / non-React DOM surfaces) and have no parallel primitive set audited in this pass; `design-tokens` (CSS-variable level, framework-agnostic) does reach the extension for real.
- **`client/sync`:** Cursor-based delta sync between mobile (TS) and desktop (Rust, independently reimplemented, parity enforced by shared golden-fixture replay), plus a pull-only artifact-cursor consumer on web. Settings conflict resolution is a three-way JSON merge with last-observed-server-revision tiebreaking; conversation/message sync is merge-by-id with append/delete-list application, not a general CRDT.

---

## Evidence file index (primary files opened during this audit)

- `packages/ui/unified-chat/src/components/{ChatInterface,MessageList,MessageBubble,ChatInput}.tsx`
- `apps/desktop/src/features/v3/DesktopShellV3.tsx`, `apps/desktop/src/App.tsx:1976`
- `apps/web/features/chat/components/WebChatRoot.tsx`, `apps/web/features/chat/pages/WebChatPage.tsx`, `apps/web/features/chat/components/messages/{ChatMessageList,MessageBubble}.tsx`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- `apps/web/features/chat/v3/WebShellV3.tsx`, `apps/web/features/chat/pages/UnifiedChatPage.tsx`, `apps/web/app/chat/{page,[sessionId]/page,projects/page,projects/[id]/page,code/page}.tsx`
- `apps/mobile/src/features/chat/components/{MessageBubble,MessageList,ChatInput}.tsx`, `apps/mobile/src/features/chat/components/Composer/Composer.tsx`, `apps/mobile/src/lib/capabilities.tsx`
- `apps/extension/src/side_panel.ts:9340-9365`
- `packages/ai/agent-core/src/{index,context,memory}.ts`
- `packages/ai/provider-runtime/src/fallback.ts`
- `packages/ai/model-registry/{AGENTS.md,scripts/compile.mjs,catalog/retired-models.json,catalog/routing-policies.json}`
- `packages/contracts/types/src/models.json` (head/verificationLog)
- `packages/contracts/compliance/src/article50-marker.ts:137-138`
- `apps/web/lib/compliance/ai-act.ts` (full file)
- `packages/contracts/trust-boundaries/src/egress-policy.ts`
- `packages/contracts/licensing/src/index.ts`, `crates/agiworkforce-licensing/src/lib.rs:6`
- `packages/tools/browser-tool/README.md`, `apps/extension/package.json:41`
- `packages/tools/mcp/src/index.ts`, `apps/web/lib/mcp-tool-executor.ts`
- `packages/client/sync/src/{index,cursor,settings}.ts`
- `packages/ui/design-tokens/src/index.ts`, `apps/extension/src/tokens.ts`
- `docs/guardian/IMPLEMENTATION_STATUS.md`, `.github/workflows/guardian.yml`
