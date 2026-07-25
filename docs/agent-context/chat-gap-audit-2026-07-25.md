# AGI Workforce — Chat Product Gap Audit & Pre-Release Backlog

**Scope:** web chat surface (`apps/web`), shared chat package (`packages/ui/unified-chat`), managed-cloud LLM pipeline (`apps/web/app/api/llm/v1/chat/completions`), billing/quota services, and the sync/persistence layer. Desktop, mobile and extension surfaces are referenced where they diverge from web.

**Method:** six parallel code audits against the working tree at `~/Desktop/agiworkforce`, each instructed to find root causes rather than restate symptoms. Every finding below is anchored to a file/symbol or to a grep-verified absence. Findings already recorded in `docs/agent-context/known-flaws.md` (the extension-side defects) are excluded.

**Result:** 199 findings. 14 Critical, 52 High, 82 Medium, 51 Low.

The 15 issues you supplied resolve into **8 root causes**, most of which produce several of your symptoms at once. Fixing the 8 roots closes roughly 60 of the 199 findings.

---

## How to read this

Each finding carries:

- **ID** — stable, traceable back to the audit pass (`ART` artifacts, `STR` streaming/state, `CMP` composer/tools, `SYS` backend/prompt, `PER` persistence/media, `GOV` tier/a11y/mobile).
- **Severity** — Critical (breaks core functionality) / High (degrades UX significantly) / Medium (noticeable friction) / Low (polish).
- **What / Where / Why** — the defect, its location and trigger, and the user or system impact.

Findings marked **⟵ your list** are the root cause of an issue you reported. Findings marked **↔ ID** are interconnected.

---

# Part 1 — Root-cause clusters

These are the eight structural defects that generate the majority of the symptom list. Fix these first; a large number of individual findings disappear with them.

## Cluster 1 — There is no base system prompt on the managed-cloud chat path

**Findings:** SYS-1, SYS-2, SYS-3, SYS-5, SYS-6, SYS-7 · **Explains:** "system prompt not precise", "AI doesn't know its capabilities", "AI says it has no sandbox/filesystem", "behaves like a basic chat model", and indirectly "web search not used".

`/api/llm/v1/chat/completions` never assembles a default preamble. The only `role: 'system'` injections in the entire web API are conditional: research mode, AGI Work mode, skill catalog, project context, and account memory. On an ordinary chat turn the model receives the raw user message with **no identity, no capability statement, no tool inventory, no date, and no behavioral policy** — so it answers from its provider-default persona.

Compounding it: tools are attached to `resolvedTools` (`web_search`, `url_fetch`, `execute_code`, `write_file`, `create_folder`, `create_office_file`, `skill`, all `mcp__*` connectors) but **no prompt text ever describes them**. The model must infer its entire capability surface from raw JSON schemas. Desktop has a tool-injection preamble (`prompt_tool_injection.rs`); web has no equivalent.

And the fix is structurally blocked: `internalMessages` is snapshotted at `request-processor.ts:2037` *before* `resolvedTools` is computed at `:2048-2133`. Any naive prompt injection after that line is silently dropped.

The data needed to write a truthful preamble **already exists** — `capability-handshake-service.ts` computes an `EffectiveCapabilityDocument` (model ∩ tier ∩ surface) explicitly so the product never claims fabricated capabilities. It is consumed only by `GET /api/me` for the composer UI. The model is the one consumer that never sees it.

> **The fix:** move tool resolution above message assembly, then inject a preamble built from `EffectiveCapabilityDocument` + the resolved tool list + current date. This single change closes SYS-1/2/3/5/6/7 and materially improves SYS-4, SYS-30, SYS-31.

## Cluster 2 — All chat state is global; there is no per-conversation model

**Findings:** STR-1, STR-2, STR-3, STR-4, STR-6, STR-7, STR-8, STR-13, STR-14, STR-15, STR-16, STR-23, GOV-3 · **Explains:** "Stop button persists when switching chats", "parallel chat usage blocked", and a family of data-loss bugs you have not yet reported.

`web-chat-store` models the transcript as one flat `messages: Message[]` implicitly scoped to `activeConversationId`, cleared on every chat switch. There is no `messagesByConversation` map (the sibling `unified-chat` package *has* one). Every stream writer keys by message id against that one array, so a background stream writes into the wrong buffer or silently no-ops.

Layered on top:

- **One shared `AbortController`** in `useChatStream` — sending in chat B aborts chat A's live stream and persists it as `finishReason: 'stopped'` (STR-2).
- **`stopGeneration` has two disagreeing targets** — it aborts the most-recently-started stream but clears streaming flags on the currently-*viewed* chat (STR-3).
- **A page-level `isSendingRef` held for the entire stream duration**, which blocks all sends in all conversations with no error and no toast (STR-6).
- **`isTurnActive = isLoading || isGenerating`** where `isLoading` is a *global* flag that the sidebar conversation fetch and `loadConversation` also set — which is the literal mechanism of your Stop-button-persists report (STR-7).
- **`loadConversation` has no streaming guard and no request sequencing** — returning to a still-streaming chat refetches from the DB and destroys the in-flight assistant message (STR-4, STR-13).
- **Composer draft and follow-up queue are unkeyed component state** — a half-typed private message in chat A appears in chat B and can be sent there by reflex (STR-23, STR-8).

## Cluster 3 — Composer state is destroyed by a layout branch swap on the first message

**Findings:** CMP-1, CMP-2, CMP-4, CMP-5, SYS-8 · **Explains:** "Chat vs AGI-mode unclear", "web search not on by default", "+ menu options may not be wired".

`WebChatPage` renders two *different* `ChatComposerNew` instances in opposite branches of `isEmptyChat ? … : …`. Sending the first message flips the ternary, React unmounts one and mounts the other, and **every piece of composer state resets**: `workMode`, `webSearchEnabled`, `researchEnabled`, `codeExecutionEnabled`, `officeCreationEnabled`, `styleMode`, `imageMode`, `selectedSkill`.

Worse, the Chat | AGI Work toggle renders *only when the `projectPicker` prop is present*, and that prop is passed only to the empty-state instance. So after the first message the mode control **vanishes from the UI entirely** while `work_mode` silently reverts to `'chat'`. A conversation started in AGI Work continues as a plain chat from message 2 onward, with nothing indicating the change.

The code comment in `clearComposerState()` explicitly says these are "PERSISTENT toggles (claude.ai parity) … Do NOT reset them here" — the intent is correct and the host layout defeats it.

## Cluster 4 — Fenced-code extraction regex mis-pairs fences

**Findings:** ART-2, ART-3, ART-4 · **Explains:** "Waiting for artifact… shows when the artifact is already rendered", "generated output not always reflected in the artifact panel".

`FENCED_CODE_RE = /```(\w*)?\n([\s\S]*?)```/g` requires the info string to be a bare `\w*` immediately followed by `\n`. Any fence with attributes (` ```html title="x" `, ` ```jsx {1,3} `), a hyphen or dot in the tag (` ```objective-c `), or a CRLF line ending **fails to match as an opening fence** — so the regex starts its next match at that block's *closing* fence and treats it as an opening one, pairing close-with-open for the rest of the message.

Three symptoms from one bug:

1. `removeArtifactBlocks` splices the wrong character ranges out of the transcript — deleting real prose and leaving raw fences behind.
2. `extractTrailingUnclosedBlock` reports a phantom open fence on a complete message, so the "Writing artifact…" chip and pulsing panel tab stay on screen after the artifact has rendered.
3. Ordinals shift, so `computeDerivedArtifactId` produces a different id than the streaming phase did — breaking the streaming→persisted handoff and cross-device dedup.

The regex is **duplicated with the same defect** in three places: `packages/platform/artifacts/src/artifact-derivation.ts:57`, `apps/web/features/chat/stores/artifacts-store.ts:249`, `apps/web/features/chat/components/ArtifactBlock.tsx:48`.

## Cluster 5 — Personalization has three independent failure modes, any one sufficient

**Findings:** PER-1, PER-2, PER-3, PER-7, PER-8, PER-9, PER-10, PER-31 · **Explains:** "Personalization doesn't load on first entry — requires reload".

1. **`useAuthStore.initialize()` runs once at module import and never retries.** It is guarded by `if (get().initialized) return` and sets `initialized: true` on *every* exit path including the signed-out fast path and the 5s timeout. Nothing anywhere calls `fetchUser()` again. If the Clerk `__client_uat` cookie lags module evaluation — which is exactly what happens on post-sign-in client-side navigation — the store permanently latches `user: null` for the whole SPA session. **A hard reload is the only recovery.** This is the literal reported bug.
2. **`useBillingStore.user` is structurally always `null`.** `refreshUser()` fetches `/api/me` and sets `subscription`, `featureFlags`, `isLoading`, `error`, `initialized` — never `user`. The only writer, `_setUser`, has zero call sites (the repo documents this at `AccountSection.tsx:34`).
3. **The profile the user edits is written where nothing reads it.** `GeneralSection` writes `displayName`/`preferredName`/`instructions` to preference namespace `general`; `/api/me` resolves the visible name from `profiles.display_name || clerkName || email-prefix` and never looks at `unsafeMetadata.full_name`. Namespace `general` is also **absent from the cloud-sync allowlist**, so it never leaves the device — while the UI says "Synced to your account."

Two personalization controls are wired to nothing at all: the greeting reads a localStorage key (`agi.profile.preferredName`) that **no code in the repo ever writes** (PER-2), and "Instructions for AGI" ("AGI will keep these in mind across chats") is **never sent to any model** (PER-7 — zero hits for `instructions` across `apps/web/app/api/llm`).

And there's a self-reinforcing corruption: `GeneralSection` persists its own empty first-paint defaults before Clerk loads, and the merge order makes those stored empty strings permanently override the real values (PER-10).

## Cluster 6 — Generated images are inlined as multi-MB data URLs into message metadata

**Findings:** PER-4, PER-5, PER-6, PER-14 · **Explains:** "Couldn't save this response" + images missing after reload.

When R2 is unconfigured, or when `storeMedia`/`insertMediaAsset` throws, the image route returns `b64_json` inline. `useMediaGeneration` converts it to `data:image/png;base64,…` (1.4–4 MB for a 1024×1024 PNG). `WebChatPage` puts that string in `metadata.imageUrl`, and the persistence helper POSTs **the entire thing inside the message metadata** to `/api/chat/conversations/[id]/messages`.

Nothing bounds it: `content` is capped at 100 000 chars but `metadata` is `z.record(z.string(), z.unknown())` with no `.max()`, and the server-side `normalizeMessageMetadata` is a bare type-check passthrough. The write exceeds the serverless body cap, `saveMessageToDb` throws, the toast fires, and the message never lands in `web_messages`.

The R2 failure that causes it is **deliberately silent** — a per-image `try/catch` that only `logger.warn`s, while the response still returns `success: true` and credits were already deducted ten lines earlier. And because the web surface **never pushes to `/api/chat/sync`** (it is pull-only, artifacts-only), there is no retry queue and no reconciliation. The turn is simply lost.

## Cluster 7 — There is no entitlements contract beyond two resources

**Findings:** GOV-3, GOV-4, GOV-5, GOV-7, GOV-8, GOV-9, GOV-13 · **Explains:** "parallel chat usage and sandbox limits are not governed by subscription tier logic".

`BILLING_PLAN_PRODUCT_LIMITS` defines exactly two fields: `projects` and `customMcpServers`. There is **no tier dimension** for chat concurrency, parallel streams, sandbox count/CPU/lifetime, artifact count, upload size, context length, connector count, or scheduled tasks. Each of those is a flat global constant or entirely ungated.

- **Concurrent chats/streams: no limit of any kind.** The only governor is `llm-completion` at 30 req/min per user. Grep for `activeRuns|concurrentRuns|MAX_ACTIVE|maxParallel|max_concurrent` across the server returns one hit — `maxParallelToolCalls`, inside a single turn.
- **Sandboxes: `MAX_SANDBOXES_PER_USER = 5`, flat for every tier** including Free. No CPU/memory/disk caps, no tier-varying lifetime. Paid tiers buy nothing in compute.
- **Sandbox compute is never attributed to the usage ledger at all** — E2B bills by the second, and `reserveManagedUsageRequest` meters LLM provider calls only.
- **Scheduled tasks: no per-user cap, no plan gate**, rate-limited only by a shared per-IP counter.
- **Team quota is per-seat and byte-identical to Pro**, keyed on `user_id` with no org parameter — a 10-seat Team draws 10× Pro's allowance with no org ceiling.

> **The fix:** add `maxConcurrentTurns`, `maxSandboxes`, `sandboxTtlMs`, `maxConnectorTools`, `maxUploadBytes`, `maxScheduledTasks` to `BillingPlanProductLimits` and thread them through. That single abstraction closes six findings.

## Cluster 8 — Silent failure is the default posture

**Findings:** ART-5, ART-15, ART-16, CMP-3, CMP-8, CMP-10, GOV-9, GOV-18, GOV-19, SYS-10, SYS-23, SYS-32, PER-6, PER-20, STR-21

A recurring pattern rather than a single bug: operations that fail, or features that were never wired, present as success.

| Surface | What the user sees | What actually happens |
|---|---|---|
| Artifact preview (default config) | Blank white frame, toolbar enabled | `onRenderError` is only wired on the cross-origin path; the same-origin fallback cannot report failures at all (ART-5) |
| "Retry" button in ArtifactPanel | An enabled button | No `onClick` (ART-15) |
| "Run preview" button | A paused preview | The HTML build already failed and returned `''`; clicking is a no-op (ART-16) |
| "Take a screenshot" in the + menu | A menu item | No handler; doesn't even close the menu (CMP-10) |
| "Temporary chat" toggle | A privacy checkmark | Local Zustand only — never reaches the DB, lost on reload; the server still runs memory extraction (CMP-3) |
| Custom slash commands | Selectable menu rows | `handleSlashSelect`'s switch has no matching case; the only effect is wiping the typed message (CMP-8) |
| Deep Research on a non-search model | An ordinary answer | `applyResearchMode` is skipped entirely — no prompt, no forced search, no error, no header (SYS-10) |
| Connector tools past 32 | "Connected" | `defs.slice(0, 32)` silently drops the rest, logged server-side only (GOV-9) |
| Quota warning header | Nothing, ever | `const quotaWarningHeader: string \| null = null;` — the producer is a hardcoded null (GOV-18) |
| Sidebar usage meter | Nothing on web | Props are never passed; if enabled it would render a confident "0%" (GOV-19) |
| Malformed tool-call JSON | A plausible tool result | Substituted with `{ _raw: … }` and *executed*; the tool coerces missing fields to defaults and returns a no-op success (SYS-23) |
| Mid-stream provider failure | A complete-looking answer | HTTP 200 with the error as an additive SSE marker most clients never read (SYS-32) |
| Sync failure on mobile/desktop | A normal app | Status is written to a store no UI reads; desktop only `console.warn`s (PER-20) |

---

# Part 2 — Findings by category

Severity legend: **[C]** Critical · **[H]** High · **[M]** Medium · **[L]** Low

---

## A. Mode, capability perception & AI self-knowledge

*Your issues: "Chat vs AGI-mode unclear", "system prompt not precise", "AI says it has no sandbox/filesystem", "behaves like a basic chat model".*

### A1 · SYS-1 **[C]** No base system prompt exists on the managed-cloud chat path ⟵ your list
**What.** No unconditional preamble is ever assembled. The only server-side `role:'system'` injections are research mode, AGI Work mode, skill catalog, project context and account memory — all conditional.
**Where.** `request-processor.ts` `processRequest`; grep-verified absence across `apps/web/app/api/llm`. Every ordinary chat turn.
**Why.** Direct root cause of three reported symptoms. With no preamble the model falls back to its provider persona, denies capabilities it has, and behaves like a base chat model. ↔ A2, A3, A5, A6, A7

### A2 · SYS-2 **[C]** Tools are attached to the request but never described in the prompt ⟵ your list
**What.** `web_search`, `web_fetch`/`url_fetch`, `execute_code`, `write_file`, `create_folder`, `create_office_file`, `skill` and every `mcp__*` tool are appended to `resolvedTools` with no corresponding system text.
**Where.** `request-processor.ts:2049-2133`. Every request with any tool enabled.
**Why.** This is exactly "the AI says it has no sandbox or file system even when it does". A model with `write_file`/`execute_code` in its tool array but no prompt statement answers capability questions from its pretrained persona. Desktop has `prompt_tool_injection.rs`; web has no equivalent. ↔ A1, A3, A7

### A3 · SYS-3 **[H]** Message array is snapshotted before tools are resolved — structurally blocks the fix
**What.** `internalMessages` is built at `:2037`; `resolvedTools` is computed at `:2048-2133`. The array a capability preamble would have to mutate has already been copied.
**Why.** Makes the correct fix impossible without reordering, and makes any naive fix silently ineffective. ↔ A2

### A4 · SYS-7 **[H]** A server-authoritative capability document exists and is never shown to the model
**What.** `capability-handshake-service.ts` builds an `EffectiveCapabilityDocument` (model ∩ tier ∩ surface) explicitly to avoid "fabricated capabilities". Grep-verified: zero references from `apps/web/app/api/llm`.
**Why.** The UI and the model disagree about what the product can do, and the data to reconcile them is already computed per-user. ↔ A1, A2

### A5 · SYS-5 **[H]** No current-date or knowledge-cutoff statement is ever injected
**What.** Grep-verified absence across `apps/web`: nothing injects today's date, the training cutoff, or a "search for anything after X" instruction.
**Why.** The model dates itself by its training data, answers stale questions confidently, and has no trigger to reach for `web_search` even when it is attached — compounding the web-search complaint. ↔ A1, F1

### A6 · SYS-6 **[M]** No product identity in any prompt
**What.** The three identity-adjacent strings are "You are in deep research mode.", "AGI Work mode is active.", and "You are working inside the user's project…". A plain chat turn self-identifies as Claude/GPT/Gemini.
**Why.** Brand leakage, and behavior is inconsistent across Auto-router model rotations.

### A7 · CMP-1 **[C]** Chat | AGI Work toggle disappears after the first message; mode silently reverts ⟵ your list
**What.** The toggle renders only when `projectPicker` is present, and that prop is passed only to the empty-state composer. The two composer instances live in opposite branches of `isEmptyChat ? … : …`, so React unmounts one and mounts the other — `workMode` useState resets to `'chat'`.
**Where.** `WebChatPage.tsx:2380` (ternary), `:2400` (prop passed), `:2445-2460` (second instance, no prop); `ChatComposerNew.tsx:323, :1707`. Immediately after the first send in any new chat.
**Why.** Single root cause of "Chat vs AGI-mode distinction is unclear": the mode is unlabeled, unreachable after message 1, and silently lost. `applyWorkMode` (which forces web_search/web_fetch/code_execution + the agentic prompt) therefore applies only to turn 1. ↔ A8, C1

### A8 · CMP-2 **[C]** Every "+" menu toggle silently resets after the first message ⟵ your list
**What.** Eight toggles are plain `useState` in `ChatComposerNew`. `clearComposerState()` deliberately does *not* reset them ("PERSISTENT toggles (claude.ai parity) … Do NOT reset them here") — but the branch swap in A7 unmounts the component entirely, destroying all of it.
**Why.** The user enables Web search, gets one searched answer, and every follow-up silently runs with `web_search: undefined` — reproducing the exact "I can't browse the web" failure a code comment says was already fixed once. ↔ A7, F1

### A9 · SYS-4 **[H]** AGI Work prompt promises tools that may not be attached
**What.** `applyWorkMode` forces `code_execution = true` and instructs the model "do not … claim that tools are unavailable" — but the tool is only actually attached if `e2bCutoverEnabled()` (default OFF) or the provider has a native interpreter. `resolveCodeExecutionTools` returns `[]` for every provider except anthropic/google/openai.
**Why.** On a DeepSeek/Qwen/xAI/Moonshot/Zhipu/MiniMax model with the flag off, a paid Pro+ feature instructs the model to call a tool the request does not carry. ↔ A2, A11

### A10 · SYS-31 **[M]** Implicit tool-intent detection is English-regex-only
**What.** All five implicit-enablement heuristics are English regexes (`/\b(run|execute|test|benchmark)\b/i` etc.), running immediately after `detectIndicScript` — which exists precisely because non-Latin-script users are a known segment.
**Why.** Capability availability silently varies by prompt language. Hindi and Chinese users experience the product as "a basic chat model" while English users don't.

### A11 · SYS-30 **[M]** E2B flag ON without `E2B_API_KEY` offers sandbox tools that always fail
**What.** `e2bCutoverEnabled()` gates tool-*offering* on the flag alone; `routeExecutionTool` then returns "Execution environment unavailable". Combined with A2, the model sees `execute_code`/`write_file` in its array, calls one, gets an unavailability string, and reports to the user that it has no sandbox.
**Why.** A misconfiguration presents as a model capability defect — exactly the reported symptom — with no operator alert. ↔ A2, A9

### A12 · SYS-29 **[L]** `providerRoutesToE2B` is a tautology
**What.** Documented as deciding "whether the given provider routes to E2B under the §8 cost-optimized cut-over plan"; returns `provider.trim().length > 0`.
**Why.** An extensive comment block describes tiering the code does not implement. Any reader (or agent) reasoning from the docstring mis-models the gate.

### A13 · CMP-18 **[M]** `chat-preferences-store` (agentMode / thinkingEnabled / preferWhisperCloud) is entirely orphaned
**What.** One occurrence in all of `apps/web` — its own definition. No importer, no setter call, no reader. It still persists to localStorage with a v2 migration. `AgentMode = 'safe'|'standard'|'autopilot'` exists only here.
**Why.** Dead persisted state that reads as an implemented agent-mode feature. Anyone auditing "does the app have an agent mode?" finds a typed store with setters and a migration and concludes yes. `preferWhisperCloud` is a real `useVoiceTranscription` option no caller ever wires, so the dictation-backend preference is unreachable.

### A14 · CMP-31 **[L]** `FocusModeButtons` and `InputFooter` are exported composer components with no render site
**What.** `FocusModeButtons` implements a Web/Academic/Code/Writing/Deep-Research/All mode row overlapping both work-mode and style. `InputFooter` is referenced only by a `vi.mock` in `ChatComposerNew.test.tsx` — the test mocks a component the component under test does not render.
**Why.** Two more unshipped "modes" surfaces in the composer directory, adding to the Chat-vs-AGI confusion for anyone reading the code. The mock is a false-confidence test artifact.

---

## B. Artifact lifecycle, rendering & panel

*Your issues: "Waiting for artifact…" persists, code-block contrast, output not reflected in the panel, chips misalign.*

### B1 · ART-2 **[C]** Fenced-block regex mis-pairs fences ⟵ your list (see Cluster 4)
**Where.** `packages/platform/artifacts/src/artifact-derivation.ts:57`, duplicated at `artifacts-store.ts:249` and `ArtifactBlock.tsx:48`.
**Why.** Simultaneously causes stale "Writing artifact…", missing/garbled transcript output, and broken streaming→persisted artifact id handoff. ↔ B2, B3

### B2 · ART-3 **[H]** "Writing…" state is cleared only by a mounted effect — a truncated fence leaves it stuck forever ⟵ your list
**What.** The ephemeral streaming entry is cleared exclusively from `useStreamingArtifactSync`'s effect when `!isStreaming || !block`. Grep-verified: no stream-end or abort handler calls `clearStreamingArtifact` anywhere else. No timeout, no TTL, no store-level sweep. `clearStreamingArtifact` also silently no-ops on a messageId mismatch.
**Where.** `use-streaming-artifact.ts:47-77`, `streaming-artifact-store.ts:60-66`.
**Why.** A max-tokens stop, an abort mid-block, or a truncated stream leaves a pulsing "Writing…" tab and chip on screen indefinitely after generation visibly finished. ↔ B1, B3

### B3 · ART-4 **[H]** Artifact scoping keys on `message.sessionId ?? activeConversationId` — both hides artifacts and re-keys their ids ⟵ your list
**What.** The same value is used as the panel filter key *and* as part of the deterministic artifact id (`uuidv5(conversationId:messageId:ordinal)`), and it can differ between the streaming and completed phases.
**Where.** `MessageBubble.tsx:387`; filter at `ArtifactsPanel.tsx:112, :127`.
**Why.** (a) When the two ids differ, the panel force-opens and shows "No artifacts yet" even though the fence was stripped from the transcript — this is "generated output is not always reflected in the artifact panel". (b) In a new chat the first write persists an artifact keyed on `":M:0"`, which then wins over re-derivation forever, defeating cloud dedup and producing a duplicate when desktop re-derives the same message. ↔ B1, B2

### B4 · ART-1 **[C]** React artifacts can never render — code is HTML-escaped before being fed to Babel
**What.** `type: 'react'` passes source through `sanitizeArtifact(content, 'react')`, which returns `<pre><code>${escapeHTML(content)}</code></pre>`. That string is injected verbatim into `<script type="text/babel">` and shipped as `payload.code` to the sandbox. Babel receives `&lt;div&gt;…` and always throws.
**Where.** `ArtifactPreview.tsx:396-417`, `:506`; sanitizer `html-sanitizer.ts:644-667`.
**Why.** Every React artifact is a guaranteed failure. On the same-origin fallback path (`NEXT_PUBLIC_SANDBOX_ORIGIN` unset) `onRenderError` is never wired, so the user gets a permanently blank white iframe with no error at all. ↔ B5, B21

### B5 · ART-5 **[H]** Same-origin sandbox fallback cannot report render errors — silent blank frame
**What.** `SandboxedIframe` fires `onRenderError` only from the cross-origin `postMessage` handler. In the default configuration (no sandbox subdomain provisioned) nothing can observe an in-frame failure, so `ArtifactPreview`'s error state with "View source"/"Retry" is unreachable.
**Where.** `SandboxedIframe.tsx:93-119`, `:187-197`; error UI `ArtifactPreview.tsx:1085-1109`.
**Why.** Broken HTML, a throwing script, the B4 React failure, and an unparseable mermaid diagram all present as an empty white rectangle with the toolbar still showing Copy/Download/Refresh as if everything worked. ↔ B4

### B6 · ART-8 **[H]** Code blocks render near-black text on a hard-coded dark background in light mode (≈1.2:1) ⟵ your list
**What.** `.code-block-body` pins `bg-gray-900 dark:bg-gray-950` in *both* themes plus `background-color:#111827`, and never sets a `color`. The text inherits `--chat-text-primary: #1a1a1a`.
**Where.** `apps/web/app/globals.css:981-1010`; markup `MarkdownContent.tsx:56-60`; token `globals.css:642`.
**Why.** #1a1a1a on #111827 is ~1.2:1 — effectively invisible. Affects every fenced code block in every assistant message and every non-renderable artifact shown inline. This is your reported contrast bug. ↔ B7, B8, B9

### B7 · ART-9 **[M]** `rehype-highlight` runs but no highlight.js theme stylesheet is loaded ⟵ your list
**What.** `rehypeHighlight` emits `hljs-*` class names. No `.hljs*` rules exist anywhere and no `highlight.js/styles/*.css` is imported, even though `highlight.js` is a direct dependency. KaTeX's CSS *is* imported at the adjacent line, so the omission is specific.
**Why.** The Code view advertises syntax highlighting (lang label, dark chrome) and delivers monochrome text. With B6 the light-mode result is uniformly unreadable. ↔ B6

### B8 · ART-10 **[M]** Artifact Code view and panel chrome are hard-coded dark and ignore the theme
**What.** `bg-gray-900 text-gray-100` (both `ArtifactPreview` variants), literal `bg-[#1e1e1e]` (`ArtifactsPanel:264`), `bg-zinc-900` (`ArtifactRenderer:285`), `bg-zinc-950` (`ArtifactBlock:327`). `ArtifactRenderer`'s `isDark` defaults to `false`, so a host that forgets the prop renders `MarkdownArtifact` as `text-zinc-800 bg-white` inside a dark shell. ↔ B6

### B9 · ART-11 **[M]** JSON block colors tokens but not the base — punctuation is invisible in light mode
**What.** `JsonBlock` colors only regex-matched tokens; the `<code>` has no base color, so braces, brackets, commas, colons and indentation inherit near-black on `bg-zinc-950`. JSON structure disappears; only values are readable. ↔ B6

### B10 · ART-28 **[L]** `CodeView` emits one table row per line with no virtualization, and the gutter fails AA
**What.** `content.split('\n').map(→ <tr>)` unconditionally, no windowing, no cap, no truncation notice — and it is the fallback renderer for every non-previewable type. A 20k-line artifact produces 60k DOM nodes on open. The line-number gutter is `--chat-text-muted` (#5c5955) on `--chat-surface-overlay` (#2e2b28) ≈ 2:1. ↔ B6, B14

### B11 · ART-12 **[M]** Suggestion chips use viewport breakpoints while the composer uses max-width centring ⟵ your list
**What.** Chips are laid out `px-4 md:px-12 lg:px-20` on the message column; the composer is `mx-auto w-full max-w-3xl px-4`, widening to `max-w-4xl` when the sidebar collapses. `md:`/`lg:` are *viewport* breakpoints — they do not shrink when the artifact panel takes 480px out of the column.
**Where.** `ChatMessageList.tsx:752` (also `:170, :671, :690, :716`); composer `WebChatPage.tsx:2437-2441`; panel width `ArtifactsPanel.tsx:154`.
**Why.** On a 1440px viewport with sidebar + panel open the column is ~700px but `lg:px-20` still insets chips 80px per side while the composer stays centred at 768px. Collapsing the sidebar changes the composer width and not the chips, so the gap shifts again. ↔ B12, L2

### B12 · ART-13 **[M]** `z-modal` is not a defined utility — fullscreen artifact has no z-index
**What.** `fixed inset-0 z-modal` in Tailwind v4 with no `--z-modal` property and no `zIndex.modal` theme key. Every other component uses `z-[var(--z-modal,300)]`. `z-modal` compiles to nothing.
**Why.** The "fullscreen" overlay gets `z-index: auto` and stacks by DOM order inside a `z-40` context — the header, composer, toasts and any `z-50` mobile drawer paint over it. ↔ B11

### B13 · ART-29 **[L]** Panel auto-opens on every artifact block, is never auto-closed, and never resets on chat switch
**What.** `useStreamingArtifactSync` calls `setPanelOpen(true)` per artifact with no memory of the user closing it. Nothing closes the panel on conversation switch. `panelOpen` is session-scoped while `selectedArtifactId` is persisted *globally across conversations*.
**Why.** Dismissing the panel mid-response is undone by the next fenced block; switching to a chat with no artifacts leaves the panel open showing "No artifacts yet", permanently narrowing the column — which re-triggers B11. ↔ B3, B11, B16

### B14 · ART-18 **[M]** ArtifactPanel cannot preview mermaid, json or code although it labels them
**What.** `canPreview` covers html/react/svg/markdown/document/image; `getTypeLabel` handles mermaid, json, code and research. Those types get a type badge, a permanently disabled Preview toggle at `opacity-40`, and raw `CodeView`. The sibling `ArtifactRenderer` *in the same package* does render mermaid. ↔ B10, B22

### B15 · ART-19 **[M]** Version history is not persisted — the version stepper vanishes on reload
**What.** `partialize` writes only `{artifacts, selectedArtifactId}`; `versionsById` is dropped. Rehydration re-upserts each artifact into an empty store, recreating exactly one version.
**Why.** An artifact revised three times shows v3/3 before reload and no chip after; prior versions are unrecoverable. Cloud-merged artifacts always report zero versions. ↔ B16

### B16 · ART-20 **[M]** Artifacts are never deleted — no UI path, no conversation-delete cleanup, no eviction cap
**What.** `removeArtifact`, `clearArtifacts`, `clearArtifactsForMessage`, `clearConversation` and the `maxArtifacts` option all exist; grep-verified zero non-test callers, and `createArtifactStore()` is constructed with no options.
**Why.** Every artifact ever derived is written to localStorage with full content and never removed — including artifacts of deleted conversations and stale artifacts of regenerated messages, which therefore remain in the panel forever. Unbounded growth against a ~5MB quota; when it's hit the persist write fails and all artifact persistence is silently lost. ↔ B15, G8

### B17 · ART-6 **[H]** Security banner claims unsafe patterns "were removed" on paths that perform no sanitization
**What.** `securityWarning` fires whenever `renderType !== 'html' && hasXSSRisk(content)`, and the banner asserts the content "contained potentially unsafe patterns that were removed before rendering". The `mermaid` and `default` (code/document/text) branches interpolate `content` raw into the srcDoc with no sanitizer, no escaping and no CSP meta.
**Why.** The user is told a mitigation happened that did not, and a code artifact containing `<script>` executes with unrestricted network access. ↔ B18, M1

### B18 · ART-7 **[M]** `securityWarning`, `copied`, `docxHtml`, `docxError` are never reset on artifact change
**What.** The identity-change effect resets `viewedVersionIndex`, `renderError` and `pdfError` only.
**Why.** A benign artifact permanently displays a false security notice; switching from DOCX A to DOCX B renders A's converted HTML until B's async conversion resolves. ↔ B17

### B19 · ART-15 **[M]** ArtifactPanel "Retry" button is wired to nothing — `aria-label="Retry"`, `disabled={!artifact}`, no `onClick`. Live on the desktop v3 surface. When a preview fails this is the one affordance the user reaches for. ↔ B20

### B20 · ART-16 **[M]** "Run preview" shown when the HTML build silently failed
**What.** `sandboxedHtmlSrcDoc` returns `''` on any `buildSandboxedHtml` throw. The branch is `htmlPreviewRunning && sandboxedHtmlSrcDoc ? <iframe/> : <Run preview>`, so a build failure with `htmlPreviewRunning` already true renders an inert "Run preview" button. `ArtifactRenderer:409-452` has the same shape but renders *nothing at all*. There is no error state anywhere in ArtifactPanel. ↔ B19, B5

### B21 · ART-14 **[M]** Three renderers of the same artifact HTML ship three different CSP postures; the primary web path ships none
**What.** `SANDBOX_CSP_META` is the empty string (`html-sanitizer.ts:555`), so the web HTML path emits no CSP meta. `artifact-sandbox.ts` sets `connect-src 'none'`; `ArtifactBlock` sets `connect-src 'none'`; the react branch sets `default-src 'self' 'unsafe-inline' 'unsafe-eval' https:` — inheriting `https:` for `connect-src` and permitting arbitrary outbound fetch.
**Why.** The null-origin sandbox blocks parent access, not egress. A model-generated artifact can exfiltrate its own content, the user's IP/UA and timing data, and pull remote script. The doc comments still describe CSP injection that no longer happens. ↔ B17, M1

### B22 · ART-17 **[M]** ArtifactPanel SVG preview throws on any non-Latin-1 character
**What.** `btoa(artifact.content)` inline during render, no try/catch, no `TextEncoder` pre-pass. Any CJK, Cyrillic, em-dash, curly quote or emoji in a `<text>` label throws `InvalidCharacterError` and takes down the panel subtree. This path is also unsanitized, unlike the sibling `SvgArtifact`. ↔ B14

### B23 · ART-22 **[M]** Artifacts panel has no Escape handler, no focus trap, no dialog semantics on the mobile overlay
**What.** Below `sm` the panel is a `fixed inset-0` overlay with a click-catching backdrop but no `role="dialog"`, `aria-modal`, `aria-label`, focus move, focus restore, focus containment or Escape-to-close (grep-verified).
**Why.** Keyboard and screen-reader users land in a full-screen overlay they cannot dismiss without tabbing blindly to the X, and focus still reaches the chat behind it. ↔ K5, L3

### B24 · ART-23 **[L]** Panel width is fixed with no resize handle, and the store field for one is never written
`sm:w-full md:w-1/2 lg:w-[480px]` on web; `artifactPanelWidth` and `setPanelWidth` exist in unified-chat with no caller and no drag handle. An HTML artifact wider than 480px is cropped with no recourse. ↔ B11

### B25 · ART-30 **[L]** No deep link to an artifact — panel state is unaddressable
**What.** The chat route reads `highlightMessage`, `search` and `projectId` but nothing artifact-related; no `?artifact=<id>`, no URL sync, no restore.
**Why.** Artifacts cannot be linked or shared by URL, back/forward doesn't restore selection, and reload always lands on `artifacts[0]` because the `?? artifacts[0]` fallback overrides the persisted `selectedArtifactId` whenever it belongs to another conversation. ↔ B15

### B26 · ART-21 **[L]** Large parts of the artifact store's public API are dead, including the whole share surface
`extractArtifactsFromContent` (with a forked `parseCodeBlocks` that contradicts the module's own "do NOT reimplement derivation here" doc and drifts from it), `addVersion`, `setCurrentVersion`, `shareArtifact` — no non-test callers. `ArtifactPreview`'s `onShare`/`onVersionChange` are never passed by `ArtifactsPanel`, so `/api/artifacts/publish` has no reachable client. ↔ B15, B16

### B27 · ART-27 **[M]** Cloud publish is still waitlist-gated in code, contradicting the recorded public-alpha decision
**What.** `publishArtifact` returns `{kind:'waitlist', shareUrl:null}` for `byok`/`managed` privacy modes; the UI renders "Cloud publish is coming" + a "Join waitlist" link to a non-product domain.
**Why.** `CLAUDE.md` records that the waitlist gate was removed by founder decision on 2026-06-27 and that `AGI_MANAGED_COMPUTE_PRIVATE_BETA` survives only as an incident kill-switch. This gate is not that env var — it is an unconditional `privacyMode` check, so public-alpha users see a waitlist CTA for a product they already have.

### B28 · ART-24 / GOV-40 **[L]** Clipboard writes have no error handling on the web artifact and message paths
`ArtifactPreview.handleCopy`, `MessageBubble.handleCopy`, `ArtifactBlock.CopyButton` all `await navigator.clipboard.writeText(...)` with no try/catch. `MessageBubble` fires `toast.success('Copied to clipboard')` on the next line, so a rejection suppresses the toast without showing an error. The unified-chat versions and `use-export-conversation.ts` are guarded correctly.

### B29 · ART-25 **[L]** ArtifactPanel download revokes the object URL synchronously and never attaches the anchor — unreliable in Firefox and racy against the blob fetch. The sibling `ArtifactRenderer` does it correctly.

### B30 · ART-26 **[L]** "Download as HTML" writes the preview scaffold with a `text/plain` MIME under a `.html` name; for React it exports the broken escaped payload from B4.

### B31 · GOV-40 **[L]** Artifact code view has no horizontal overflow handling — `<pre>` with no `overflow-x-auto`, inside a `ScrollArea` that never mounts a horizontal bar, while `StreamingArtifactView.tsx:69` renders the *same content* with `whitespace-pre-wrap break-words`. Long lines are readable while streaming and unreachable once settled.

---

## C. Composer, "+" menu, style & model selection

*Your issues: "+ menu not properly wired", "no active indicator", "style/tone defaults missing".*

### C1 · CMP-3 **[C]** "Temporary chat" is a privacy control that never reaches the server or the database
**What.** `handleIncognitoToggle` calls `updateConversation`, a purely local Zustand map update with no network call. `is_temporary` is written to the DB only at conversation-creation time. The server reads `conversationIsTemporary` from the DB row to decide auto-memory extraction and persistence. `conversations` is also excluded from `partialize`, so the flag is lost on reload.
**Why.** The UI shows a checkmark claiming the chat is ephemeral. Already-saved messages stay in the DB, the server still runs `prepareManagedAutoMemoryFacts` with `isTemporary: false`, and the flag evaporates on refresh. A privacy affordance that lies is worse than none.

### C2 · CMP-10 **[M]** "Take a screenshot" menu item has no `onClick` ⟵ your list
A `<button type="button">` with icon and label, no handler, no TODO. Clicking does nothing and doesn't close the menu. The shared `AttachmentMenu` implements it correctly, so the web composer is the drifted copy. Renders whenever `useCapability('canTakeScreenshot')` is true. ↔ C3

### C3 · CMP-8 **[H]** Custom slash commands are rendered and are pure no-ops that also destroy the typed message ⟵ your list
**What.** `SlashCommandMenu` appends `customCommands` from the settings store; selecting one calls `handleSlashSelect(cmd.id)`, whose `switch` has cases only for `search|think|image|code` and no default. The only observable effect is the unconditional `setMessage('')`. The command's `template` field is never read by any composer code.
**Why.** A first-class settings feature (`CustomCommandsSettings.tsx`) produces menu entries that do nothing and wipe the input.

### C4 · CMP-9 **[M]** `/search`, `/think`, `/code` discard the typed argument and two can be instantly reverted
`handleSlashSelect` unconditionally clears the message; the menu closes as soon as a space is typed, so the registry's own documented form (`/search latest AI news`) is unreachable. `/think` and `/code` set flags that the capability effects immediately clear for unsupported models — a silent no-op that also wiped the input. `/code` is described as "Write or explain code" but arms sandboxed code *execution*. ↔ C3

### C5 · CMP-13 **[M]** The "+" active indicator omits Extended thinking and Temporary chat ⟵ your list
`hasOverflowActive` covers skill, webSearch, research, codeExecution, officeCreation and styleMode — not `thinkingEnabled`, not `isIncognito`. The two highest-consequence toggles (the one that multiplies token spend and the one that claims to be a privacy mode) are the two with no collapsed-state signal. ↔ C6, C7, K7

### C6 · GOV-35 **[M]** The "features active" indicator is color-only with a static accessible name ⟵ your list
`hasOverflowActive` is expressed solely as an amber tint. No count badge, no text, no `aria-pressed`; `aria-label` is the constant "More options". The button is also disabled while a turn streams, so during generation the user cannot even open the menu to check which toggles are on. Fails WCAG 1.4.1, and even for sighted users the tint says "something is on" without saying what — so a user can silently send with Deep Research still enabled from three messages ago. ↔ C5, C7

### C7 · CMP-23 **[M]** The shared composer's "+" shows no indicator at all for active tools
`ChatInput`'s trigger tints only on `attachedFiles.length > 0 || attachmentMenuOpen` — it ignores webSearch, research, codeExecution and activeStyle, all of which live in the menu behind it. On desktop/mobile there is no collapsed-state signal whatsoever. ↔ C5, C6

### C8 · CMP-14 **[M]** The "+" menu has no ARIA menu semantics and never moves focus
A bare `<div>` with no `role="menu"`; `MenuToggleRow` renders `<button>` with a decorative `<Check>` and no `role="menuitemcheckbox"`/`aria-checked`; the trigger has `aria-expanded` but no `aria-haspopup`/`aria-controls`. Nothing calls `.focus()` on open — contradicting the code comment asserting "focus moves into the popover". Screen readers announce "Web search, button" with no on/off state, so for AT users the indicator problem is total. ↔ C5, K7

### C9 · CMP-6 **[H]** Three mutually incompatible style vocabularies; the "+" style is silently ignored ⟵ your list
**What.** (a) `StyleMode = normal|concise|formal|explanatory` → `styleMode`; (b) footer `PresetStyle = default|concise|detailed|technical|creative|custom` → `styleInstruction`; (c) unified-chat `WritingStyle = formal|casual|concise|detailed`. In `sendMessage`, `styleInstruction` wins and `styleMode` is dropped entirely — while both controls render simultaneously in the same composer row for paid users, each showing its own checkmark. "concise" has three different instruction texts across the three systems. ↔ C10

### C10 · CMP-7 **[H]** No concise default and no "long answer" option; every style system defaults to an empty instruction ⟵ your list
**What.** `useState<StyleMode>('normal')` maps to `undefined` at send; `style: 'default'` has instruction `''`; `useState<WritingStyle|null>(null)`. `STYLE_SYSTEM_INSTRUCTIONS` has no `normal` key. Grep-verified: no `verbosity`, no `responseLength`, no length control anywhere. The closest to "long answer" are `detailed` (footer only) and `explanatory` (+ menu only) — never offered alongside `concise` in the same menu, and never paired with a length notion.
**Why.** Out of the box **zero style guidance is sent**, so the model defaults to its own verbose behavior. This is your "verbose output is common". A "concise by default" product decision is currently unimplementable without new code. ↔ C9, A1

### C11 · CMP-5 **[H]** Tool toggles are global to the composer instance and leak across chat switches
The in-conversation composer is not keyed by conversation id, and there is no per-chat tool state anywhere — `tool-store.ts`, the only store named for tools, holds execution history, approvals and plans, and has **no enablement fields at all**. Switching from chat A (Deep Research + Run code on) to chat B keeps them armed. Deep Research is expensive and Pro-gated; silently carrying it into an unrelated chat burns quota and changes answer shape with no visible cause. ↔ A8

### C12 · CMP-4 / SYS-8 **[H]** Web search default is OFF with no user preference and no persistence anywhere ⟵ your list
**What.** Web is `useState(false)` with zero persistence — not localStorage, not per-chat, not server-synced, and no settings-level "search by default" preference exists. Server-side, the only implicit enablement is `applyImplicitManagedToolIntent` when the local classifier returns `taskType === 'research'`.
**Why.** There is **no code path by which a default-on preference could ever take effect.** Combined with A5 (no date in the prompt) and A2 (no prompt telling the model search exists), the model answers stale questions from memory instead of searching. ↔ A5, A8, C13

### C13 · CMP-19 **[M]** Two persisted `webSearchEnabled` booleans in the same package with opposite defaults
`settingsStore.webSearchEnabled: true` (persisted, grep-verified zero readers) vs `chatStore.webSearchEnabled: false` (the live one `ChatInput` reads, with a comment explaining that a previous local copy "diverged from the send path"). The dead one is the one a reader finds first when asking "why isn't web search on by default?" — and it says it is. ↔ C12

### C14 · SYS-9 **[M]** `web_fetch` has no independent control — it is slaved to the web-search toggle
`WebChatPage` passes `webFetch: options.meta?.webSearchEnabled`. A user who wants a URL read but not a search cannot express it, so "read this link" fails with an unexplained refusal whenever search is off. ↔ C12

### C15 · CMP-20 **[H]** Deployment capability flags are persisted to localStorage, so a stale "available" state rehydrates
`settingsStore`'s persist config has no `partialize`, so `codeExecutionDeploymentEnabled` and `genericWebSearchDeploymentEnabled` — documented as "NOT a user preference", server-owned, overwritten by hosts at runtime — are written to disk. The comment claims "the persisted default is the safe 'unavailable' state", but persistence means a previously-`true` value rehydrates as `true`. Before `/api/me` resolves, the composer renders "Run code" and "Web search" as available based on a stale cached deployment flag — exactly the cosmetic dead control the surrounding 20 lines of comments try to prevent.

### C16 · CMP-16 **[M]** "+" and mic are hard-disabled during streaming while the textarea stays enabled for type-ahead
`handleSubmit` snapshots the toggle meta into `pendingQueueRef` at queue time, so a user composing a follow-up during a stream can type but cannot enable Web search for it, cannot dictate it, and cannot see or edit the tool set the queued message will carry. The feature explicitly designed for type-ahead disables the controls that make the typed-ahead message useful. ↔ D8

### C17 · CMP-17 **[M]** SendPreview — the "what will be sent" disclosure, including the active tools list — is fully built and never rendered
`WebChatPage` computes a complete `SendPreviewPresentation` (`toolsLabel`, `contextLabel`, `systemPromptLabel`, `attachmentLabel`) and uses only `.privacyShortLabel`. `<SendPreview>` is exported from the package index with zero render sites in `apps/web`, while a comment at the call site claims "Composer + Send Preview disclosure". The single UI element that would answer "which tools are active for this send" is built every render and thrown away. ↔ C5, C6

### C18 · CMP-11 / GOV-14 **[H]** "Create image" is ungated client-side and Pro-gated server-side
The "+" menu entry and the natural-language image interception have no tier check; `/api/media/image/generate` rejects non-Pro with 403 `plan_upgrade_required`. Deep Research one row below *is* gated with an "Upgrade to use Deep Research" tooltip. A free/basic user gets the whole footer swapped into image mode, composes a prompt, and fails after a round trip with no in-composer upgrade CTA — while `onUpgradeRequest` is available in the component and not called. ↔ C19, I11

### C19 · CMP-12 **[H]** AGI Work is gated against the free trial, not against the Pro entitlement the server enforces
Client: `!isFreeTrial` where `isFreeTrial === (tier === 'free')`. Server: `agi_work` requires `pro|max|max_15x|team|enterprise`. A **basic**-tier user gets a fully enabled AGI Work toggle and a hard `agi_work_plan_required` error with no upgrade path from the control that caused it. ↔ C18, I11

### C20 · CMP-15 **[M]** Web composer cannot attach pasted images; the shared composer can
No `onPaste` handler and no `clipboardData` reference anywhere in `apps/web/features/chat/components/Composer/` (grep-verified). The textarea silently ignores an image paste. `unified-chat/ChatInput` implements a full `handlePaste`. Paste-to-attach is table stakes and is the most common way users share screenshots; drag-drop works, so the gap is silent and confusing. ↔ C2

### C21 · CMP-27 **[M]** Attachment capability check covers images only — documents are unguarded
`hasAttachmentConflict` is computed solely from `type.startsWith('image/')` against `modelCanAcceptImages`, while the file input's `accept` is the full allowlist (PDFs, office docs, code). The image path gets a full remediation banner; the document path gets nothing and fails at the provider. The hook's own doc comment still claims the composer keeps `accept="image/*"` — stale. ↔ C22

### C22 · CMP-28 **[L]** "Choose a compatible model" can open an empty box with no message
For a free/basic user whose allowed roster contains no vision model, `compatibleModels` is empty and the expanded panel renders an empty bordered box — no "no compatible models on your plan", no upgrade CTA. The other two remediation options work, so it reads as a rendering bug. ↔ C21

### C23 · CMP-29 **[L]** Attachment validation surfaces only the last error and never auto-dismisses
`useAttachments` calls `onError` per rejected file; the handler is `setLocalNotice(message)`, a single string. A five-file drop with three different failures shows only the last. `localNotice` clears only on the next add or `clearComposerState`, and the banner has no dismiss control.

### C24 · CMP-24 **[M]** Selecting any model force-enables extended thinking, overriding the user's explicit choice
`applyModelSelection` unconditionally returns `thinkingEnabled: supportsThinking`, applied on every `setSelectedModelId`/`setSelectedModel`/`selectModel`. A user who deliberately turned thinking off gets it silently turned back on by switching models — a silent latency and spend increase. (The composer reads `useThinkingStore`, not this store, so `model-store` is additionally a duplicate source of truth for the same concept, persisted separately.)

### C25 · CMP-21 **[M]** ModelSelector hardcodes `'auto'` / `'auto-balanced'` and classifies auto models by id prefix
`bestAutoId` resolves by literal id lookup then `m.id.startsWith('auto')`. The catalog exposes `getAutoRoutingProfiles()` / `getBestAutoModeForTier()` for exactly this (web's model-store uses them), and `auto-balanced` is marked `selectable: false` in `routing-policies.json` — so the hardcoded fallback names an alias the catalog deliberately excludes. Violates the repo rule that model IDs come from the catalog. ↔ C26, C27

### C26 · CMP-25 **[L]** Opus usage-rate warning is decided by `model.name.toLowerCase().includes('opus')` — a cost warning keyed to a marketing string that silently stops working on rename, in a file that otherwise takes care to avoid hardcoded IDs.

### C27 · CMP-26 **[L]** Image-model picker falls back to the hardcoded label `'Gemini 3.1 Flash Image'` while submitting `modelId: ''`, contradicting the file's own comment that image models are "derived entirely from the canonical models.json catalog … never hardcoded".

### C28 · CMP-30 **[L]** Model search is implemented in ComposerFooter and never enabled on the chat composer
`showModelSearch` defaults false and `ChatComposerNew` doesn't pass it, so the search input and the entire `isSearching` flat-list branch are unreachable. Model rows also carry no capability badges, so with the full max-tier roster rendered the list is long, unsearchable, and offers no signal about whether the model can read the image already attached.

### C29 · CMP-22 **[M]** `ChatInput` accepts `onPlusClick` and `onVoiceClick` from hosts and never calls them — both destructured to `_`-prefixed aliases and never referenced. `onPlusClick` is a **required** prop, so every host must supply a handler guaranteed to be dead.

### C30 · CMP-32 **[L]** Composer has no character or token limit and no length feedback — no `maxLength`, no counter, no context-budget warning; an oversized paste is accepted, sent, and fails at the provider or is silently truncated. `summarizeSendPreview` already computes `bodyCharLabel` and `contextLabel` and discards them (C17), so this is display-only work.

---

## D. Streaming lifecycle, chat state & parallel sessions

*Your issues: "Stop button persists across chats", "parallel chat usage not governed".*

### D1 · STR-1 **[C]** One flat `messages` array for the active chat only — background streams have nowhere to write (see Cluster 2)
`web-chat-store.ts:306`, `:464-479`, `:505-523`. The sibling `unified-chat/chatStore.ts:62` *does* have `messagesByConversation`. ↔ D2, D4, D5, D9

### D2 · STR-2 **[C]** Single shared `AbortController` — sending in chat B kills chat A's live stream
`useChatStream.ts:1573`, aborted unconditionally at `:1619-1622` with no conversation check; `continueGeneration` and `resolveToolApproval` share the same ref. Chat A's response is silently truncated and persisted as `finishReason: 'stopped'` as if the user pressed Stop. ↔ D3, D6

### D3 · STR-3 **[C]** `stopGeneration` aborts the last-started stream but clears state on the currently-viewed chat
Two disagreeing targets: `abortControllerRef.current` (whichever turn started most recently, any conversation) and `stopStreaming()`/`setLoading(false)` with no conversationId, which the store resolves against `activeConversationId`. `activeRunRef` (cloud cancel) is likewise a single slot. Pressing Stop while viewing chat B cancels chat A's generation *and* its server-side Cloud run, while clearing B's UI flags. ↔ D2, D7

### D4 · STR-4 **[C]** Switching back into a still-streaming chat refetches from the DB and destroys the live message
`loadConversation` unconditionally replaces the transcript via `setActiveConversationWithMessages` with no streaming guard and no cached-messages short-circuit. Remaining tokens go to a message id that no longer exists; the user sees the old transcript with no reply while `isStreaming` is true, so Stop sits over an apparently idle chat. `unified-chat/ChatInterface.tsx:426-437` has **both** guards; web has neither. ↔ D1, D5, D13

### D5 · STR-5 **[C]** Assistant turns are persisted only by the browser at `[DONE]`
The server never writes the assistant message — `onSuccessfulTurn` is wired only to `recordManagedAutoMemoryTurn`, and billing settlement writes usage rows, not transcript rows. The only writer is the client's `persistAssistant`. There is **no `beforeunload`/`visibilitychange` handler anywhere in the chat feature** (grep-verified across `apps/web/features/chat`, `apps/web/lib/hooks`, `packages/ui/unified-chat`).
**Why.** The user message *is* saved fire-and-forget at send time, so a tab close or crash mid-stream leaves the question with no answer and no error — while the turn was fully generated and billed server-side. ↔ D4, G6

### D6 · STR-6 **[C]** The page-level send guard blocks all sends in every chat for the whole stream, silently
`sendContent` sets `isSendingRef.current = true`, then `await doSend()` → `await sendMessage(...)` → `await consumeAssistantStream`. The guard is held for the entire turn, not the submit window, and any send in any other conversation hits `if (isSendingRef.current) return;` with no error, no toast, no state change. The doc comment calls it a "double-submit guard"; its actual scope is turn-lifetime and global. ↔ D11, D16, I1

### D7 · STR-7 **[H]** Stop button is driven by a global `isLoading` that sidebar and conversation fetches also set ⟵ your list
`isTurnActive = isLoading || isGenerating`. `isGenerating` is correctly scoped; `isLoading` is the raw global, and `setLoading(true)` is unscoped by design (the store only scopes `false` writes). The conversation-list fetch, `createConversation` and `loadConversation` all write it.
**Why.** This is the exact mechanism of your report: clicking a sidebar chat calls `loadConversation` → `setLoading(true)` for the whole fetch, during which `activeConversationId` is still the *old* chat, so `isGenerating` is also still true. The user sees a blank transcript with an armed Stop button; clicking it aborts the previous chat (D3). Every composer control (`disabled={isTurnActive}`) locks up at the same time. ↔ D3, D8, D13

### D8 · STR-8 **[H]** Queued follow-up message is delivered to the wrong conversation on chat switch
The follow-up queue is local component state in `ChatComposerNew`, not keyed by conversation and not remounted on switch. The flush effect fires on any `isTurnActive` true→false edge — *including the edge caused by navigating away* — and calls `onSend(...pending)`, which resolves the target as the now-current `urlConversationId`. A message composed for chat A is sent into chat B: cross-conversation content leak plus an unrequested turn. The "Queued · sends when the current response finishes" chip also persists across the switch. ↔ D7, D12

### D9 · STR-9 **[H]** Reasoning content is silently dropped when the user leaves the chat mid-stream
`buildAssistantMetadata` reads `thinkingContent`/`thinkingSegments` back off the store rather than from local accumulators (unlike tools, generatedFiles, searchResults, research, which use closure variables). If the message is no longer in `state.messages` (chat switched → D1's `messages: []`), the lookup returns undefined and the reasoning is omitted from the saved metadata. Asymmetric with every other metadata channel in the same function. ↔ D1, D4

### D10 · STR-10 **[H]** Stopping mid-tool-call leaves tool cards stuck at 'running' forever — and persists them that way
Every terminal path calls `finishRunningTools()` — `[DONE]`, stream-end-without-DONE, durable replay, research-abort. The ordinary user-abort branch does not; it flushes content, marks `finishReason: 'stopped'`, and persists with `toolTimeline` entries still `status: 'running'`. `handleStreamError`'s abort branch also returns early before the failed-tool sweep. The phantom spinner survives reload. ↔ D3, D17

### D11 · STR-11 **[H]** No client-side stall detection — a hung stream pins the UI indefinitely
`while (true) { await reader.read() }` with no idle timer, no watchdog, no `AbortSignal.timeout`, and no `navigator.onLine`/`offline` listener anywhere in the chat feature (grep-verified). The server emits a 15s `: keepalive` comment; the client never checks whether keepalives are still arriving. On a sleep/resume, captive portal, or proxy black-hole, `isStreaming` stays true forever — and with D6 the user cannot send in *any* chat again until reload. The only escape is Stop, which is exactly what D3 makes unreliable. ↔ D6, D12

### D12 · STR-12 **[H]** Resume-after-disconnect exists only for Cloud runs and is never retried
`replayDurableRun()` is gated on a `runHandle` present only for managed Cloud agent runs. Plain chat completions fall through to `handleStreamError`, which **replaces the partial content with an error string** (`updateMessage(..., { content: errorContent })`). A Wi-Fi blip mid-answer destroys everything already streamed. The Deep Research path has a bespoke keep-the-partial branch, proving the team knows this is wrong; ordinary chat did not get it. The replay itself is attempted exactly once with no backoff. ↔ D11, D5

### D13 · STR-13 **[H]** `loadConversation` has no request sequencing — rapid chat switching lands the wrong transcript
Each call fires an unabortable fetch and writes `setActiveConversationWithMessages(id, messages)` on resolve, with no check that `id` is still current and no cancellation of a prior load. Last-resolving response wins, so the user can view chat C's URL with chat B's messages and `activeConversationId === B` — after which every downstream scoping decision is computed against the wrong id. The `cancelled` flag pattern is used correctly elsewhere in the same page. ↔ D4, D7

### D14 · STR-14 **[H]** unified-chat has a single global `isStreaming` boolean and global streaming buffers
`isStreaming`, `streamingContent`, `streamingReasoning` are top-level singletons; `assistantMessageIdRef` is one slot; `useChat` gates sends on `isStreamingRef.current` and drops the send with no toast and no queue. The `streamConvIdRef` comment states outright: "There is still only one in-flight turn at a time … it does not add concurrent-turn support." ↔ D6, D15

### D15 · STR-15 **[H]** unified-chat blocks loading any conversation's messages while *any* conversation streams
The message-load effect early-returns on the global `isStreaming`. Opening a chat during an unrelated stream shows an empty transcript with no spinner and no error, until that other stream finishes. ↔ D14

### D16 · STR-16 **[H]** `activeRunRef` is a single slot — Stop cancels only the newest Cloud run
Each new stream's `onRunHandle` overwrites it. An earlier Cloud agent run keeps executing (and billing) server-side with no client able to cancel it; the `finally` blocks only clear the ref on id match, so the earlier handle is lost rather than cancelled. ↔ D2, D3

### D17 · STR-17 **[H]** Message-list memo comparators ignore most streaming metadata
Both `ChatMessageList`'s and `MessageGroupRow`'s custom comparators enumerate a fixed field list. **Not compared:** `agentActivity`, `generatedFiles`, `searchResults` (beyond the first `isSearching` flip), `codeExecutionResult` (beyond `isExecutingCode`), `research`, `cloudApproval`, `isPinned`, and individual tool entries' `approved`/`result`/mid-list `status` — tool status is sampled only at index 0 and index -1.
**Why.** Content accumulates and never renders: (a) a tool-only AGI Work turn with no text deltas leaves the activity spine frozen for the whole run; (b) with 3+ parallel tools, middle cards never leave 'running'; (c) clicking Approve/Reject gives **zero visual feedback** until the whole batch resolves; (d) the pin badge never appears. ↔ D10, D18

### D18 · STR-21 **[M]** SSE parse failures are swallowed by a bare `catch {}` with no counter
The per-line handler wraps ~330 lines — including `x_tool_result`, `x_generated_files`, `x_agent_event`, `x_stream_error` and `CloudToolApprovalProjectionSchema.parse` — in one `try` whose `catch` discards everything with the comment "Ignore parse errors for incomplete chunks." A genuine schema throw is indistinguishable from a partial chunk: the approval card, file chip or agent event silently doesn't appear, with nothing logged. The final `buffer` remainder after the read loop is also never parsed, so a terminal event not followed by a newline is lost. ↔ D17

### D19 · STR-18 **[M]** No virtualization anywhere in the transcript
`groups.map(...)` renders everything; grep for `react-window|react-virtual|virtua|VirtualList|windowing` across the chat feature and unified-chat returns zero. Every streaming delta re-runs the comparator over the full array (`prev.messages.every(...)`) and React reconciles the whole tree, with markdown/highlighting cost per bubble. No cap, no pagination, no "load earlier messages". ↔ D20

### D20 · STR-19 **[M]** Auto-scroll fires a smooth `scrollIntoView` on every token
The effect depends on `${id}-${content.length}`, which changes on every delta, queuing a new smooth-scroll animation per token on a container that also has CSS `scroll-smooth`. Fighting animations produce visible jitter and make it hard to scroll up at all — each token yanks the user back until `handleScroll` registers >120px. No `overflow-anchor`. ↔ D19, D21

### D21 · STR-20 **[M]** `userScrolledUp` is not reset on conversation switch
`ChatMessageList` is not remounted per chat (no `key` prop). Scroll up in chat A, switch to B → B opens with auto-scroll disabled and the scroll-to-bottom FAB already showing, newest messages off-screen. Inversely, bottoming out a short chat re-arms auto-scroll for a long one. ↔ D20

### D22 · STR-22 **[M]** Regenerate/edit leave the old turn's DB rows alive for the entire replacement stream
`sendReplacingMessages` removes the old turn locally immediately but defers `deleteServer(ids)` until `send()` resolves — which is stream end (D6). A reload during regeneration shows a duplicated user message and the stale assistant answer. The `restore` rollback also writes back a whole-array snapshot taken before the send, so a conversation switch in between would inject the other chat's transcript. ↔ D1, D6

### D23 · STR-23 **[M]** Composer draft text follows the user across chat switches
Input is local `useState('')` that never reads or writes the store's draft fields; `clearSignal` is bumped only by `handleNewChat` and the BYOK fork, not by selecting a different conversation. A half-typed private message in chat A appears in chat B's composer and can be sent there by reflex. `web-chat-store.draftContent` is unused and unified-chat's `draftsByConversation` is fully implemented and simply not wired here. ↔ D8

### D24 · STR-24 **[M]** unified-chat's `.finally()` safety net can clear the streaming flag for a turn still running
`if (useChatStore.getState().isStreaming) stopStreaming()` — checking a *global* flag, not the turn whose promise settled, while `runtime.sendMessage` may resolve as soon as the request is accepted. The composer flips back to Send mid-generation, so Stop disappears and a second turn can be fired into the same bubble. ↔ D14

### D25 · STR-25 **[M]** Per-turn token usage is billed server-side and never returned to the client
The server accumulates input/output/reasoning/cache-read/cache-write and settles billing from it; grep for `usage|prompt_tokens|completion_tokens|stream_options` in `useChatStream.ts` returns zero, and `MessageMetadata` has no usage field. Metered managed-cloud users have no per-turn cost visibility and no way to reconcile charges. The composer's `BudgetTrackerDisplay` cannot be fed by actual turn usage. ↔ I13

### D26 · STR-26 **[M]** `handleGenerateImage` shares `isSendingRef` with `sendContent` and releases it out of band
Both write the same page-level ref with no ownership check. An image generation finishing while a chat send is still streaming clears the guard early, re-opening the double-submit window the ref exists to close — and re-arming the stale-active reconciler that can null `activeConversationId` mid-send. ↔ D6

### D27 · STR-27 **[M]** `useChatStream`'s unmount cleanup is deliberately empty, so route changes leak controllers
The comment explains the controller is preserved on purpose so the first-message `/chat` → `/chat/[id]` navigation doesn't kill the stream — but nothing else ever reclaims it. A real teardown (leaving the chat feature, sign-out) leaves the fetch running, `streamingConversationIds` populated, and the controller unreferenced, so `isStreaming` can stay true in a store that outlives the page while the abandoned request keeps consuming tokens. ↔ D2, D16

### D28 · STR-28 **[L]** Legacy `buildStreamResponse` has no `cancel()` handler, so billing settlement never runs on abort
Settlement is in `flush()`, which the Streams spec does not invoke on cancel; the sibling `buildAdapterStreamResponse` was given an explicit `async cancel()` that settles with `outcome: 'failed'`. Low today only because the function has no production caller — a live footgun for anyone re-enabling it. Delete it or port the handler.

---

## E. Tool orchestration & invocation feedback

### E1 · SYS-23 **[H]** Malformed tool-call JSON is not rejected — it is executed with a synthetic `_raw` argument
`catch { args = { _raw: tc.argsJson } }`, then dispatched. The tool coerces missing fields to defaults (`routeExecutionTool` runs `language:'python', code:''`), producing a silent no-op success instead of an error the model can correct — so the model reasons on a plausible result for a call that never happened. Common on smaller open-weight models. ↔ E2

### E2 · SYS-24 **[H]** Tool arguments are never validated against the declared JSON Schema
Every tool ships `parameters` with `required` fields; nothing validates before dispatch. `runMcpTool` forwards `toolCall.args` verbatim to connectors and MCP servers; `routeExecutionTool` does ad-hoc `typeof` coercion with silent defaults (`path: typeof args['path'] === 'string' ? … : ''` — an empty path silently becomes a write to `''`). Grep-verified: no `safeParse`, no `ajv`, no schema check on tool args anywhere in `tool-loop.ts`. **Violates the repo's own LLM-failure rule against unvalidated tool inputs**, and unvalidated model-generated objects reach user connectors (GitHub `post_issue_comment`) and the sandbox filesystem. ↔ E1

### E3 · SYS-25 **[M]** Parallel tool execution is dead code — no real tool name matches the read-only prefix list
`isReadOnlyTool` prefix-matches `['read_file','list_directory','search_files','get_file_info','list_allowed_directories','fetch','get','search','query','list','describe']`. Actual tool names are `web_search`, `url_fetch`, `execute_code`, `write_file`, `create_folder`, `create_office_file`, and `mcp__<server>__<tool>` — **none of which start with any prefix**. Every real tool is classified as mutating and runs serially; `MAX_PARALLEL_TOOL_CALLS = 4` and `mapWithConcurrency` never do any work. A model issuing 4 parallel `web_search` calls serializes them at 120s each — up to 8 minutes for one step. ↔ E4

### E4 · SYS-26 **[H]** Ordinary chat tool loop has no wall-clock budget and can exceed the route's 300s hard limit
`maxDurationMs` is set only for AGI Work (240s); ordinary chat gets `undefined` while allowing 10 steps × 120s serialized tools (E3). `export const maxDuration = 300` is the platform kill, and the loop's `finally` (E2B pause/dispose, billing settlement) is skipped on SIGKILL — which the code itself identifies as a sandbox-billing leak. The turn dies with no terminal SSE event, no `[DONE]`, no file harvest, and a leaked billing sandbox. ↔ E3, I5

### E5 · SYS-27 **[M]** Tool-result context budget is a fixed 200k chars regardless of the model's context window
`MAX_TOOL_RESULT_HISTORY_CHARS = 200_000` applied identically to every model, while the resolved `contextWindow` is available on `ProcessedRequest` and never consulted. On a small-context model the budget alone overflows (unhandled — see J2); on a 1M-context model it needlessly discards evidence. ↔ J2

### E6 · SYS-28 **[M]** One connected connector forces manual approval for every tool, including read-only built-ins
`approvalMode: hasMcpTools ? 'manual' : 'auto'`, where `mcpTools` includes the user's connected connectors (loaded unconditionally). A user who has connected GitHub gets an approval card for `web_search` and `url_fetch` too — tools the code elsewhere justifies as auto-approvable. The route's own comments acknowledge E2B calls "stall on approval" in this mix. The mode is global to the turn rather than per-tool, and no prompt tells the model approvals will be requested. ↔ A2

### E7 · STR-17 **[H]** Tool approval clicks give zero visual feedback until the whole batch resolves — see D17.

### E8 · GOV-9 **[M]** Connector tools past 32 are silently truncated with the connector still reading "Connected" — see I9.

---

## F. Backend pipeline, providers & prompt assembly

### F1 · SYS-13 **[H]** System-message placement diverges across providers
Anthropic, Google and OpenAI-Responses all `filter(m => m.role === 'system')` and join into a single top-level `system`/`systemInstruction`/`instructions` field regardless of original position. OpenAI chat-completions emits each system message **in place** in the messages array. With Auto routing rotating providers mid-conversation, identical inputs yield different instruction precedence and different truncation behavior — a mid-history system message is a hard instruction on Anthropic/Google and a positional aside on OpenAI. ↔ F2

### F2 · SYS-14 **[M]** Up to five system blocks stacked with inconsistent merge-vs-unshift semantics
`applyProjectContext` and `applyManagedMemoryContext` **merge** into `messages[0]` if it is a system message; `applyWorkMode` and `applyManagedSkillSelection` **unshift a new** one; `applyResearchMode` merges. Net effect: work mode creates a second system block that then absorbs the research prompt, pushing memory + project context into a *later* block. The documented intent ("research stays first … project context follows") holds only when work mode is off, and on OpenAI chat-completions (F1) the blocks stay separated at different depths. ↔ F1

### F3 · SYS-15 **[M]** Server-injected context is billed against the user's message-length limit
`MAX_MESSAGE_LENGTH` (100k) and `MAX_TOTAL_LENGTH` (1M) are enforced *after* project context, attachment hydration, memory, work mode, research and skill catalog have all been injected. A project with large knowledge files can push a server-generated block past 100k and 400 the user's own short message: "Message content exceeds maximum length of 100000 characters" for content they never wrote and cannot shorten. ↔ F2, J2

### F4 · SYS-10 **[H]** Deep Research silently no-ops when the model lacks the `search` capability
`researchMode = chatRequest.research === true && (resolvedModelCaps?.search ?? false)`. When false, `applyResearchMode` is skipped entirely — no research prompt, no forced `web_search`/`web_fetch`, no error, no header, no client notice. The comment states this is intentional. The user toggles a paid feature and receives an ordinary single-turn reply with no citations and no indication anything was dropped. ↔ F5, F6

### F5 · SYS-11 **[M]** Unknown-model capability defaults are inconsistent (deny in one place, allow in another)
Research uses `?? false` (fail-closed, silently); `appendWebSearchTool` uses `?? true` (fail-open); the url_fetch/E2B gates use `tools ?? true`. The same unknown model gets web search injected but Deep Research silently disabled. ↔ F4, F13

### F6 · SYS-12 **[M]** Deep Research is two different products under one toggle
The multi-turn `runResearchLoop` (plan → search rounds → cited synthesis, up to 6 iterations / 12 searches) is gated to **non-Anthropic**, non-free-trial. Anthropic requests get the single-turn `RESEARCH_SYSTEM_PROMPT` + forced native `web_search` instead. Same UI toggle, materially different output depth, and nothing in the response tells the user which they got. The loop's citation/source events never fire for Anthropic users. ↔ F4

### F7 · SYS-21 **[H]** The agentic tool-loop path has no provider failover
`createFailoverPlan` is wired only into the two single-turn branches. The `runToolLoop` and `runResearchLoop` branches never construct one, so a `server_overload`/`connection`/`api_timeout` on step 1 terminates the whole turn. The requests most likely to be long and expensive get the *least* resilience. ↔ F8

### F8 · SYS-22 **[M]** Research loop's provider errors are terminal and unclassified
Up to 6 provider turns over a 4-minute budget with no failover and no per-turn retry; a transient 429 on the synthesis turn discards all gathered sources and notes. ↔ F7

### F9 · SYS-34 **[M]** Unknown model IDs silently dispatch to OpenAI with platform credentials
`resolveProviderFromModel` falls through a substring heuristic chain and ends `return 'openai'` — no error, no catalog check, no capability metadata, so every permissive `?? true` default in F5 applies. Managed spend on an unintended provider. **Violates the repo rule that model identity must come from `models.json`.** ↔ F5

### F10 · SYS-36 **[L]** `messages` has no element cap
`z.array(...)` unbounded, while `tools` is `.max(64)` and `tool_calls` `.max(32)`. A 2MB body of tiny messages yields tens of thousands of elements, each walked by `extractTextContent`, `hydrateChatAttachments`, `collectManagedPromptMaterials` and the per-provider translators — all before any length check. ↔ F3

---

## G. Persistence, sync & state hydration

### G1 · PER-1 **[C]** Auth store initializes once at import and never retries ⟵ your list (see Cluster 5)
`authentication-store.ts:182-190, :431`. Grep-verified: `fetchUser` appears only in the store and its test.

### G2 · PER-3 **[C]** `useBillingStore.user` is structurally always null ⟵ your list
`refreshUser()` never writes `user`; the only writer `_setUser` has zero call sites, documented at `AccountSection.tsx:34`. The sidebar account row falls back to `'Account'`, initials collapse to a fallback letter, and `GeneralSection`'s `userMeta` is permanently `{}`. ↔ G1, G4

### G3 · PER-2 **[H]** Greeting reads a localStorage key nothing in the repo ever writes ⟵ your list
`agi.profile.preferredName` — grep across `apps packages` returns exactly one hit, this read. No `setItem` exists. The comment claims a feature that does not exist, and the "What should AGI call you?" setting can never reach the greeting through this path. ↔ G4

### G4 · PER-8 **[H]** Profile is split across three stores that never reconcile ⟵ your list
`GeneralSection` → namespace `general` + Clerk `unsafeMetadata`; `user-preferences.ts` → `profiles.display_name` via `PATCH /api/me` + namespace `profile`; `/api/me` resolves `name` from `display_name || clerkName || email-prefix`, and `clerkName` reads `fullName/firstName/lastName/username` — **never** `unsafeMetadata.full_name`. So "Full name" in Settings → General cannot change the greeting, header, or sidebar, while the UI says "Synced to your account." ↔ G2, G3, G5

### G5 · PER-9 **[H]** Namespace `general` is absent from the cloud-safe sync allowlist
The allowlist is `appearance, personalization, profile, notifications, language, accessibility, chat, editor`. `general` — the namespace `GeneralSection` actually writes — is not in it, so `filterCloudSafeSettings` silently drops it on both pull and push. Display name, preferred name, work description and instructions are permanently device-local. Fail-closed is the right design; the allowlist just doesn't match the writer. ↔ G4, G6

### G6 · PER-7 **[C]** "Instructions for AGI" is stored and never sent to any model ⟵ your list
UI copy: "AGI will keep these in mind across chats. They help tailor tone, format, and explanations to how you work best." Grep-verified: zero non-comment hits for `instructions` across `apps/web/app/api/llm`; zero hits for `personalization|customInstructions|user_instructions|preferred_name` across `apps/web/app/api/llm` and `apps/web/lib`. Nothing reads namespace `general` back except `GeneralSection` itself. A prominently advertised personalization feature does nothing — indistinguishable from a silent save failure. ↔ A1, G4

### G7 · PER-10 **[H]** GeneralSection persists its own empty first-paint defaults, which then permanently win
On mount `clerkUser` is `undefined` (no `isLoaded` check), so the fields default to `''`; the load effect gets `{}` from a first-time server, applies the empty defaults, sets `preferencesLoaded = true`, and the 400ms autosave PUTs `{displayName:'', preferredName:'', …}`. Later loads do `{...fallback, ...serverSettings}`, so the stored empty strings override the now-correct defaults. Self-reinforcing corruption; nothing distinguishes "user cleared this" from "not loaded yet". ↔ G1, G4

### G8 · PER-31 **[M]** `/api/me` caps the Clerk profile lookup at 1500ms and falls back to the email prefix
Its own comment acknowledges "the real name resolves on a later load" — but per G1 there is no later load short of a reload. The mitigation for "name did not load until reload" itself requires a reload, converting a transient upstream slowdown into a session-long wrong name. ↔ G1

### G9 · PER-11 **[C]** Sign-out localStorage cleanup targets 6 keys that don't exist and misses 14 that do
Comparing the hardcoded list against every `persist({name})`: only `agi-notification-store` and `agi-user-profile-store` match. `agi-artifact-store` ≠ actual `agi-artifacts-store`; `agi-layout-store` ≠ actual `agi-ui-store`; `agi-settings-store` ≠ actual `agiworkforce-web-settings`; three others don't exist at all. **Left behind:** `agi-artifacts-store` (full artifact bodies), `agiworkforce-web-chat`, `agi-web-chat`, `agi-memory-store-v1`, `agi-company-hub-store`, `agi-model-store`, `agi-thinking-store`, `chat-*`, `agiworkforce-web-media`. On a shared browser the next user inherits the previous user's artifact contents, memory facts, media job history and chat preferences. The function's stated purpose — "Prevents data leaks between user sessions" — is unmet. ↔ G10, G11

### G10 · PER-12 **[C]** `cleanupAllStores` never resets the chat store or the memory store; the comment claims ten and six run
The `tasks` array has 6 entries while the comment says "the other nine". `useChatStore` (conversations + messages in memory) is never reset. `useMemoryStore` is cleared only in `web-auth-store.signOut()`, whose own comment says to keep the two paths in sync. Two divergent sign-out paths: the `useAuthStore.logout()` path (used by ChatHeader) leaves the previous user's conversation list and message bodies live in memory and their memory facts on disk. ↔ G9

### G11 · PER-13 **[H]** Full artifact bodies persist to localStorage with no size guard or quota handling
`createJSONStorage(() => localStorage)` over the entire `artifacts` array; grep for `QuotaExceeded` handling around any persist store returns nothing outside a browser-capability probe. Once quota is hit, zustand's `setItem` throws inside the persist middleware and **every subsequent persisted-store write in the origin can fail silently** — taking down model selection, preferences and sidebar state with no user-visible signal. With G9 this content also survives sign-out. ↔ B16, G9

### G12 · PER-14 **[H]** The web surface never pushes to `/api/chat/sync` — it is pull-only, artifacts-only
Grep across `apps/web` matches only the route itself and the artifact-sync client, all GET. The elaborate protocol-v2 push handler (compare-and-swap, conflicts, tombstones) has no web client; web durability rides entirely on per-message `POST /api/chat/conversations/[id]/messages`. Any message whose direct save fails (G14) has **no second chance** — no queue, no retry-on-next-sync, no reconciliation. ↔ G14, D5

### G13 · PER-15 **[H]** Web artifact sync restarts from cursor `0` on every mount and hard-fails past 100 pages
`let cursor = '0'` with no persistence. Every mount of every tab re-pages the account's entire sync history (up to 500 conversations + 1000 messages + 500 artifacts per page) just to extract artifacts, then throws at the 100-page guard. O(history) bandwidth per reload × open tabs, and a hard ceiling past which artifacts stop syncing forever for large accounts. ↔ G16

### G14 · PER-4 **[C]** Generated image inlined as a multi-MB base64 data URL into message metadata ⟵ your list (see Cluster 6)
`useMediaGeneration.ts:119-120` → `WebChatPage.tsx:1062-1073` → `imageGenerationPersistence.ts:74-89` → the toast at `useChatStream.ts:298`. ↔ G15, G17, G12

### G15 · PER-5 **[H]** Message metadata has no size cap at any layer — schema, normalizer or DB write
`content` is `.max(100_000)`; `metadata` is `z.record(z.string(), z.unknown())` with no `.max()`, and `normalizeMessageMetadata` is a bare type-check passthrough with zero key filtering or size bound. Nothing rejects a 4MB data URL early with an actionable error; the failure surfaces as an opaque body-size/500 and a generic toast. Also lets one row balloon the table and every subsequent history fetch. ↔ G14, G20

### G16 · PER-16 **[M]** No multi-tab coordination anywhere
Grep for `BroadcastChannel|navigator.locks|leaderElection|SharedWorker` across `apps/web` returns zero. N tabs run N independent sync loops and N `/api/me` bootstraps, and write the same persist keys with last-writer-wins — model selection, preferences and artifacts silently clobbering each other, with no way to keep two tabs consistent short of reloading. ↔ G13

### G17 · PER-6 **[H]** Image persistence to R2 + `media_assets` is best-effort; failure is a `logger.warn` while the user is already billed
Three invisible outcomes: `storeMedia` succeeds but `insertMediaAsset` throws → orphaned R2 object with no DB row; `insertMediaAsset` returns null → image never appears in the Library and can never be deleted; either fails → base64 falls through to G14. The response is still `success: true` and credits were deducted ten lines earlier. The failure that causes the reported bug is deliberately made silent. ↔ G14

### G18 · PER-17 **[H]** A message conflict with `current: null` wedges the dirty queue forever (mobile + desktop)
The server emits `{id, current: null}` when the row isn't visible (parent conversation tombstoned elsewhere). Mobile `continue`s without adding to `resolvedMessageIds`, so `clearDirty` never runs; the desktop Rust resolver has no `None` arm at all. The conversation and artifact resolvers both handle `None` correctly — messages are the outlier. The queue is MMKV/SQLite-persisted, so the same doomed message is re-pushed every 30s forever across app restarts. ↔ G19, G20

### G19 · PER-18 **[H]** Conflict "resolution" is silent server-wins; the local edit is discarded with no record
The rebase branch fires only when the local row changed *while the request was in flight*. In the ordinary case (user edits, pushes, loses the CAS) execution falls through to `applyMessageDeltas([conflict.current])`, overwriting local content and marking it resolved. The server's careful compare-and-swap exists to detect conflicts and the client throws the signal away — data loss with no undo, no toast, no conflict marker. ↔ G18

### G20 · PER-19 **[H]** A failing push blocks every subsequent pull and every other sync domain
The tick awaits `push()`, `pull()`, `pushMemory()`, `pullMemory()` sequentially in one try. Any push rejection skips the pull and all memory/project/settings sync — this cycle and every cycle after, as long as the poisoned row stays dirty. One unpushable local row silently stops all inbound sync while the device appears healthy. ↔ G18, G21

### G21 · PER-20 **[H]** Sync status and errors are write-only — no UI reads them
Mobile writes `setStatus('error', …)` to `cloudSyncStateStore`; grep across `apps/mobile/**/*.tsx` returns zero renderers. Desktop's trigger is a bare `.catch(err => console.warn(...))`. Neither client has retry or backoff (fixed 30s interval). A user whose pushes have failed for days sees a completely normal app; with G20 this is undetectable data divergence. ↔ G20, G22

### G22 · PER-21 **[M]** `SYNC_PROTOCOL_UPGRADE_REQUIRED` (409) is emitted by the server and handled by no client
Two hits repo-wide, both server-side. Mobile collapses it into a generic Error; desktop returns `Err("Push failed with status 409…")`. Neither branches on the code or prompts an update, and both retry the identical legacy body every 30s — and per G20 also stop pulling. The server built an actionable upgrade signal and it is discarded. ↔ G20, G21

### G23 · PER-22 **[M]** No client-side batch chunking; the persisted dirty queue can exceed the server's caps and become unrecoverable
`push()` builds one array from the entire dirty queue; grep for `truncat|byteLength|maxBytes|payloadSize` in the sync engine and `packages/client/sync` returns nothing. The server caps `messages` at 2000 with a whole-payload Zod parse. Accumulate >2000 dirty messages offline (MMKV-persisted, survives restarts) and every push is a total-batch 400 with no way to drain it — and G20 kills pull along with it. ↔ G20

### G24 · PER-23 **[M]** `metadata` is unbounded on the sync wire, and desktop drops it entirely
`z.record(z.string(), z.unknown()).nullable().optional()` with no `.max()`, unlike every sibling field; mobile forwards full tool-call arguments verbatim. Separately the desktop `PushMessage` struct has **no `metadata` field at all**, so desktop-inserted rows land with `metadata = '{}'` — reactions, approval cards, tool timelines, reasoning and image metadata written on web are dropped on the desktop mirror. ↔ G15

### G25 · PER-27 **[H]** One deleted attachment permanently bricks every future turn in its conversation
Every turn re-sends the full history and re-emits `{type:'file', file:{asset_id}}` for every historical attachment. Server-side hydration is all-or-nothing: a missing or soft-deleted asset **throws** rather than degrading to a text placeholder. The conversation returns 404 `attachment_not_found` on every subsequent message forever, with no UI recovery path — the only fix is deleting the message. The same mechanism makes the 18 MiB attachment budget cumulative over the conversation's whole lifetime. ↔ M3

### G26 · PER-28 **[H]** Composer clears text and files before the upload resolves
`onSend` returns `undefined` (never `false`), so the `if (result === false) return;` guard never fires and `clearComposerState()` always runs synchronously — while the actual `await uploadChatAttachments(...)` happens later, its failure landing in a catch that only sets an error and toasts. Typed text and selected files are gone with no retry and no restore. Aggravated by a limit mismatch: the composer validates 12 MiB *per file* while the contract rejects 12 MiB *total per message*, so a valid-looking selection fails only after the composer is already cleared. ↔ G27

### G27 · PER-29 **[H]** In-place image regeneration has no error handling and destroys the original
`handleRegenerateImageInPlace` clears `metadata.imageUrl` and sets `isStreaming: true` *before* awaiting `generateImage`, with no try/catch; the caller's catch only sets local component state, lost on unmount. The store message keeps `isStreaming: true` with `imageUrl: undefined` forever — navigate away and back and the card spins indefinitely with the previous image gone, and nothing was persisted so a reload loses it too. ↔ G28

### G28 · PER-30 **[M]** Image-generation failure wipes the metadata needed to retry
`applyImageError` passes `metadata: undefined` and `updateMessage` is a shallow merge, so `undefined` *replaces* the metadata object — discarding `imageGenPrompt`, `imageGenAspect`, `imageGenModel`. The result is a plain text bubble with a raw error string and no retry affordance, because the prompt required to retry has been deleted. ↔ G27

### G29 · PER-33 **[L]** Reload hydration casts message metadata with no validation
`(m.metadata ?? undefined) as Message['metadata']`. Attachments get a real runtime validator; `toolType`, `imageUrl`, `tools`, `research` and `cloudApproval` are trusted unvalidated. Given G15 lets arbitrary shapes into the column, there is no boundary where bad metadata is caught. ↔ G15

### G30 · PER-32 **[L]** Image generation sends `Authorization: Bearer ` when the token provider returns empty
`getAuthToken()` coerces a failed Clerk `getToken()` to `''` and the header interpolates unconditionally, producing a malformed empty Bearer instead of failing fast. Surfaces as an opaque 401 and still consumes a rate-limit slot. The message-save path correctly throws `'Not authenticated'`.

---

## H. Media & file lifecycle

### H1 · PER-26 **[H]** Generated images are permanently world-readable at their R2 public URL, bypassing the authorization boundary
`putObject` returns `publicUrlForKey(key)`, stored in `media_assets.storage_url` and handed to the client as `metadata.imageUrl`. `/api/files/[id]` correctly enforces ownership and `deletedAt` — and is irrelevant to anyone holding the R2 URL, which never expires and is never revoked on delete. Two inconsistent access models for the same bytes: attachments use `assetId` + an authenticated same-origin route; generated images embed a raw permanent public URL in message metadata. ↔ H2, H3

### H2 · PER-25 **[H]** Deleting a conversation, an asset, or an entire account never removes the underlying R2 bytes
Conversation delete is a pure `deleted_at` tombstone (grep for `media_assets` in `apps/web/app/api/chat/` returns nothing). `/api/media` DELETE only sets `deleted_at`; `storage_pathname` is documented in the migration as "used for deletion" and no code ever uses it that way. Account deletion touches only profile rows. The `purge-temporary-chats` cron hard-deletes conversations while leaving their attachments behind. With H1 the bytes remain **publicly fetchable** — a GDPR/erasure gap, not just a storage leak. ↔ H1, H3

### H3 · PER-24 **[H]** No cleanup, TTL or orphan reaper for R2 objects or `media_assets`; `deleteStoredMedia` is dead code
One hit repo-wide: its own definition. `deleteObject(` has three non-test call sites, none touching `media/` or `chat-attachments/` keys. `vercel.json` crons are `reset-credits`, `purge-temporary-chats`, `reconcile-credits`, `run-schedules` — no media reaper. Every failed upload, orphaned generation (G17) and soft-deleted asset accumulates permanently, with unbounded cost and no path to erasure. ↔ H1, H2

---

## I. Tier, quota, permissions & governance

### I1 · GOV-1 **[C]** A plan cap of `0` means "unlimited", not "denied", in the only durable usage gate
The rolling 5-hour / weekly / flagship SQL enforces a cap only when it is strictly `> 0`. `getPlanSessionUsageBudgetCents` / `getPlanWeeklyUsageBudgetCents` return 0 for `enterprise` (all-zero `MANAGED_USAGE_LIMITS` row) and for `byok`/`local-only`. The exact inversion of a fail-closed policy: an Enterprise or misconfigured account has **no rolling spend ceiling at all**. ↔ I2

### I2 · GOV-2 **[H]** Enterprise tier is allocated zero credits, so every Enterprise chat 402s
`getPlanUsageBudgetCents('enterprise') → 0` → `allocateCreditsForPeriod` returns `''` without creating a credit account → `CreditService.checkAvailable` fails → 402 "Usage budget exhausted". The highest-paying tier is hard-blocked with a message telling them to upgrade, contradicting `BILLING_PLAN_CAPABILITY_TIERS` which grants Enterprise everything. ↔ I1

### I3 · GOV-3 **[H]** No tier dimension — and no limit of any kind — on concurrent chats or parallel streams ⟵ your list
The only governor is `llm-completion` at 30 req/min per user. Grep for `activeRuns|concurrentRuns|MAX_ACTIVE|maxParallel|max_concurrent` across `apps/web/lib`, `apps/web/app/api` and `services` returns exactly one hit — `maxParallelToolCalls`, *inside* a single turn. 30 simultaneous agentic turns (`DEFAULT_AGI_WORK_MAX_STEPS = 100` provider round-trips each) can be opened by one Free-plan account within a minute. ↔ I4, I7, D6

### I4 · GOV-4 **[H]** Sandbox concurrency cap is a flat constant, not a plan entitlement ⟵ your list
`MAX_SANDBOXES_PER_USER = 5` for every tier — Free, Basic, Pro, Max 15x, Team, Enterprise identical. No CPU, memory or disk caps in code (E2B template defaults only). Lifetimes are flat too (60s ephemeral / 10min conversation-scoped). Paid tiers buy nothing in compute, and the free tier is the cheapest way to consume the team's 100-sandbox E2B budget. ↔ I3, I5, I6

### I5 · GOV-5 **[H]** Sandbox compute cost is never attributed to the usage ledger
`reserveManagedUsageRequest`/`reserveManagedUsageProviderStep` meter LLM provider calls only; E2B runtime is billed by the second and never reserved, settled or deducted (grep-verified: no cost/reserve/meter references in the sandbox path). A user can burn unbounded compute-seconds inside their 5 sandboxes while their meter and rolling caps stay flat. ↔ I4, I6, E4

### I6 · GOV-6 **[M]** No idle-reclaim job for paused sandboxes; the Redis mapping expires before the sandbox does
Conversation-scoped sandboxes are paused (not killed) at turn end with a 24h Redis TTL on the mapping. `killE2BSession` is called only on explicit conversation delete, and there is no reclaim cron. Once the key expires the paused sandbox is unreachable by the app but still exists in the E2B account — counting against the 100-per-team cap *and* against the user's 5-slot budget (which counts `['running','paused']`) forever. ↔ I4, I5

### I7 · GOV-7 **[H]** The enforceable plan-limits contract covers 2 of ~10 governed resources
`BillingPlanProductLimits` = `{ projects, customMcpServers }`. No tier dimension for chat concurrency, parallel streams, sandbox count/CPU/time, artifact count, upload size, context length, OAuth connector count, connector tool count, or scheduled tasks. A Free account and a Max 15x account get byte-identical upload size, context length, connector tools and sandbox concurrency. ↔ I3, I4, I8, I9

### I8 · GOV-8 **[H]** Scheduled tasks have no per-user cap and no plan gate
`POST /api/schedules` creates a row with no count limit and no capability check; the only governor is `withRateLimit(request,'chat-conversation')` — 60/min and **IP-keyed** because no identifier is passed. Each firing runs through `reserveManagedUsageRequest`, so this is a durable, unattended path for a Free user to consume provider spend. ↔ I7, I15

### I9 · GOV-9 **[M]** Connector tool budget is a flat 32 and silently truncates enabled connectors
`MAX_CONNECTOR_TOOLS_PER_USER = 32`, tier-independent; excess defs are dropped with `defs.slice(0, 32)` and logged server-side only. The connector still reads "Connected" and simply never works. Also: `customMcpServers` is capped by plan while **first-party OAuth connectors are not capped at all**. ↔ I7, C6

### I10 · GOV-13 **[M]** Team-plan quota is per-seat, not per-organization, and equals Pro
`MANAGED_USAGE_LIMITS.team` is byte-identical to `pro`, and every reservation is keyed on `user_id` — `reserve_managed_usage_request_with_limits` takes no org parameter. No org pool, no org cap, no aggregate admin view. A 10-seat Team at $25/seat draws 10× Pro's allowance with no ceiling. ↔ I1

### I11 · GOV-10 **[H]** Managed-cloud surface capability is decided from a client-declared header
`resolveCloudChatSurface` reads `x-agi-surface` (or `x-client`) straight from the request: web/mobile/desktop → `managed_chat` (all tiers), chrome/vscode/cli → `developer_surfaces` (Pro+), api → `managed_api` (Pro+). A Free or Basic user with a valid Clerk token sends `x-agi-surface: web` from a CLI and receives the Pro-only developer surface. The module's own comment concedes the residual risk. ↔ I12

### I12 · GOV-11 **[M]** In-thread provider switch is gated on four clients and zero servers
`canSwitchProviderInThread` (max/max_15x/enterprise) is reimplemented in unified-chat's tierStore, mobile's `tierGuard.ts`, the VS Code extension's `providerSwitchGuard.ts`, and consumed by ComposerFooter. Grep-verified: no server route calls it. The completions route checks only `canAccessModel(model, tier)` — per-model, not per-thread-continuity. A headline Max differentiator is enforced only by UI, in four drifting copies. ↔ I11

### I13 · GOV-12 **[M]** `tierStore` defaults to `'byok'`, so a billing-fetch failure silently downgrades a paying user
`useTierBridge` calls `setTier` only when `billing.data` is truthy, with no error or loading branch. A transient `/api/billing` failure leaves a Max subscriber on tier `'byok'` for the session — shown upgrade prompts and locked model rows for features they already own, with no retry and no error surface. ↔ I12

### I14 · GOV-14 **[M]** Image-generation mode is offered to every tier client-side and rejected server-side — see C18.

### I15 · GOV-16 **[C]** ~60 authenticated endpoints rate-limit per IP while their configs document "per user"
`withRateLimit(request, key)` falls back to an IP bucket whenever no identifier is passed. Only `auth-gate.ts:136` passes `user:${userId}`. `rateLimitConfigs['2fa-verify']` is commented "5 verify/validate attempts per 15 minutes **per user**" and is actually 5 per 15 minutes **per IP**.
**Why.** Two-directional failure: (a) an attacker rotating source IPs gets unlimited 6-digit TOTP guesses — the brute-force control the config claims does not exist; (b) legitimate users behind one corporate NAT share a 5-per-15-minute 2FA budget and lock each other out. Quota is neither per-user nor per-org for most of the API. ↔ I16, I8

### I16 · GOV-17 **[H]** Rate-limit identity prefers a client-settable `x-real-ip` header
`x-real-ip` is read first, then the rightmost `x-forwarded-for`. `x-real-ip` is trustworthy only when a proxy overwrites it, and the same file's comments scope this deployment to "AWS / GCP / Fly / bare Node" as well as Vercel. On any of those without a header-scrubbing edge, one header grants a fresh bucket per request — total bypass of every IP-keyed control including the 5-per-15-min login limiter and the 1500/min pre-auth LLM ceiling. ↔ I15

### I17 · GOV-23 **[M]** Rate-limit audit records attribute a userId parsed from an unverified JWT
The same file that removed unverified-JWT parsing from the rate-limit *key* still base64-decodes the Bearer payload without signature verification to attach a userId to the security-audit row, four lines later. An attacker crafts an unsigned token with any `sub` and poisons another user's abuse record — data used for fraud decisions is attacker-writable. ↔ I15

### I18 · GOV-24 **[L]** Sandbox concurrency check is a TOCTOU count with no lock
`countUserSandboxes` then create, nothing serialising. Two concurrent requests both observe `live=4` and both create. The only compute ceiling in the product is defeated by the parallelism the product does not otherwise limit. ↔ I3, I4

### I19 · GOV-22 **[M]** The `llm-streaming` limit (20/min, "more intensive") is defined and never applied
Grep-verified: only the definition matches. Streaming turns are governed solely by `llm-completion` (30/min). Cost-control policy that reads as implemented and is not; a reviewer auditing the config table concludes streaming is capped at 20/min when it is 30. ↔ I3

---

## J. Error handling, quota UX & observability

### J1 · SYS-17 **[H]** Error taxonomy covers 4 statuses; everything else is a generic 500 `server_error`
`buildUpstreamErrorResponse` maps only 401/402/404/429. **Context-length-exceeded, content-filter/safety stops, provider 400, timeouts and 5xx all collapse to `server_error` at status 500.** Clients cannot distinguish "your prompt is too long", "the model refused on policy", and "the provider is down" — four differently-recoverable conditions, one "Something went wrong". ↔ J2, J3, J4

### J2 · SYS-16 **[H]** No conversation-history truncation and no context-length-exceeded handling
The request path enforces only absolute char caps and never trims history to the resolved model's `contextWindow`. `trimToolResultHistory` bounds tool results inside the tool loop only. When the provider rejects, J1 has no branch, so it becomes an opaque 500 with the raw provider text. Long chats die with no actionable code and nothing offers to summarize or trim. This is one of the most common real-world chat failures and it is entirely unhandled. ↔ J1, E5, F3

### J3 · SYS-19 **[M]** HTTP status is derived by substring-sniffing an English error message
`.includes('not found')`, `.includes('rate limit')`, etc. — and `adapter-errors.ts` exists solely to reproduce those substrings. A 500 whose body says "route not found" is reported to the client as 404. The structured `error.status` is set at `adapter-errors.ts:27` and then **never read**. Misclassified statuses drive wrong retry, upgrade and refund behavior. ↔ J1

### J4 · SYS-18 **[M]** Raw provider error text is returned to the client as `publicMessage`
Initialized to the raw `error.message` and overwritten only in the 429 branch. Every unmapped failure returns the upstream provider's own string — prefixed with the provider label per `adapter-errors.ts` (e.g. `"OpenAI API error (500): …"`) — leaking the managed-cloud provider identity and unbounded internal detail to the browser. ↔ J1, J5

### J5 · SYS-20 **[H]** Tool loop writes the raw provider error into the assistant's visible message content
On a provider failure mid tool-loop, `err.message` is emitted as an assistant content **delta**, so it renders inside the chat bubble as if the model said it — and is persisted into the transcript. The HTTP response is already 200, so there is no status code at all. Affects every agentic path (MCP/connector/E2B/url_fetch/web_search/skill/office). ↔ J4, J6

### J6 · SYS-32 **[M]** Mid-stream provider failure returns HTTP 200 with the error buried in the SSE body
A warn log plus an additive `x_stream_error` delta; the stream still terminates with a normal `[DONE]`, and billing settlement proceeds on the success path. The code notes `assembler.lastError` "had zero production readers before this fix" — clients must opt into `hasStreamError()`. Any client not checking renders a silently truncated answer as complete. ↔ J5, D18

### J7 · SYS-33 **[L]** Unparseable provider SSE lines are forwarded verbatim to the client
`catch { lines.push({ line: raw + '\n' }) }` on the assumption it is an incomplete chunk. Genuinely malformed upstream payloads are relayed to the browser unfiltered, corrupting the OpenAI-compat contract callers rely on. ↔ J6

### J8 · SYS-35 **[L]** Zod validation errors are returned verbatim — `validationResult.error.message`, the full serialized issue array, in the client-facing `error.message`. Exposes internal schema shape and can be arbitrarily large; the structured `param` beside it already carries the actionable part. ↔ J4

### J9 · GOV-18 **[H]** The pre-limit quota warning header is hardcoded to null
The whole plumbing exists — `ProcessedRequest.quotaWarningHeader` and three emit sites setting `X-Quota-Warning`. The producer is `const quotaWarningHeader: string | null = null;`. The header is never sent under any condition. ↔ J10, J11

### J10 · GOV-19 **[H]** The sidebar usage meter is dead code on web
The shared `Sidebar` exposes `showUsageWidget` (default false) and `budgetPercent` (default 0) and renders a threshold progress bar. Grep-verified: no call site in `apps/` or `packages/` passes `budgetPercent`, `onOpenUsage` or `showUsageWidget` — only `apps/desktop`'s separate Sidebar computes them. Remaining quota is invisible in the web chat surface; the only display is buried in Settings → Usage. If the widget were switched on with props still unwired it would render a confident, permanent **"0%"** presented as live data. ↔ J9, J11

### J11 · GOV-20 **[H]** Paid-tier limit errors get no upgrade CTA and no reset time — only free-trial codes do
`handleStreamError` renders the inline paywall card only for three free-trial literals. Every paid code — `rolling_five_hour_limit_reached`, `rolling_weekly_limit_reached`, `flagship_weekly_limit_reached`, `insufficient_credits`, `monthly_limit_exceeded`, `RATE_LIMIT_EXCEEDED` — falls through to a plain dismissible banner with no upgrade link and no rendered reset timestamp. **The users most likely to convert — those actively hitting a paid ceiling — are the only ones shown no upgrade path**, while the server supplies actionable copy ("Wait for earlier usage to leave the window or upgrade") the client never pairs with a control. ↔ J9, J10, J12

### J12 · GOV-21 **[M]** The 429 body shows a raw ISO timestamp and the client discards every rate-limit header
`Please try again after 2026-07-25T15:12:33.000Z`. The response carries `X-RateLimit-Limit/Remaining/Reset` and `Retry-After`; grep-verified the client reads none of them. The one actionable thing the server computes is formatted for machines and then thrown away — no countdown, no remaining count, no localized time. ↔ J11

### J13 · GOV-15 **[M]** Image paywall is detected by substring-matching `'403'` in the error text
`raw.includes('403')`. Any unrelated error containing "403" renders as a paywall, and any wording change that drops the literal token silently degrades the paywall into a raw failure string. `requiredTier:'pro'` is hardcoded client-side rather than read from the server's `required_plans`. The revenue path is bound to a fragile string match with no test coverage against catalog drift. ↔ C18

### J14 · GOV-25 **[H]** The chat route segment has no error boundary and no loading fallback
`apps/web/app/chat/` has no `error.tsx`, `loading.tsx` or `not-found.tsx`, while 24 marketing/auth segments have both. No `<ErrorBoundary>` wraps the chat surface (the 5 in the codebase are in Connectors, UserSettings, GlobalSearch, Billing, Analytics). The chat bundle is additionally `ssr: false` dynamic **with no `loading` option**. A single render exception in the primary surface unwinds to the global error page and loses conversation state; a cold load paints a blank screen until the chunk resolves. ↔ J15

### J15 · GOV-26 **[M]** Loading an existing conversation renders an empty container; the skeletons built for it are dead code
`ChatMessageList`'s empty-state branch is gated on `!isLoading`, so `messages.length === 0 && isLoading` falls through to the main render with zero groups; the typing indicator can't cover it (it requires `messages.length > 0`). `MessageBubbleSkeleton.tsx` and `ChatLoadingState.tsx` exist, are unit-tested, and are never mounted. The user sees a blank area indistinguishable from an empty conversation and from a permission error (J16). `apps/mobile` mounts its skeleton — web is the regression. ↔ J14, J16

### J16 · GOV-27 **[H]** 403 and 404 on conversation load are swallowed and rendered as an empty chat
`WebChatRuntime` returns `[]` for any non-ok response; the API collapses not-found, soft-deleted and other-user's-conversation into one 404; the client never inspects status (grep for 404/403 in the chat store returns zero). Delete and rename **don't check `res.ok` at all**, so a failed mutation is optimistically applied and reported as success — the conversation disappears from the sidebar and reappears on reload. ↔ J15, J17

### J17 · GOV-28 **[M]** Expired and nonexistent share links are conflated, and the API disagrees with the SSR page
`/api/share/[token]` folds expiry into the WHERE clause and returns one 404 whose own message admits the conflation; `app/share/[token]/page.tsx` queries *without* the expiry filter and renders a dedicated `<ExpiredShareBanner>`. Depending on which path serves the request, the recipient either learns the link expired (recoverable) or is told it does not exist (dead end). ↔ J16

---

## K. Accessibility

### K1 · GOV-29 **[H]** Streaming assistant output is not announced; the one live region is scoped to the whole transcript
`ChatMessageList` declares `role="log" aria-live="polite"` on the **entire scroll container**, so every streaming re-render re-announces unrelated content rather than the delta, and `aria-busy` is never toggled to mark generation start/end. `ToolTimeline` has zero live-region markup (grep-verified 0 hits for `aria-live`/`role="status"`/`role="alert"`). Web's `MessageBubble` has none; the unified-chat streaming caret is `aria-hidden` with no live region.
**Why.** A screen-reader user cannot follow a streaming response, cannot tell when generation starts or finishes, and gets no signal for tool execution or tool failure. The correct pattern already exists in the repo at `AgentActivityTimeline.tsx:479`. ↔ K2

### K2 · GOV-30 **[H]** Hover-revealed message and conversation actions are invisible to keyboard users
`opacity-0 group-hover:opacity-100` with no `focus-within`/`focus-visible` counterpart. Repo-wide: **23 `group-hover:opacity` sites vs 3 focus counterparts — 20 are keyboard-invisible.** Copy, edit, delete, rename and per-conversation actions are unusable without a mouse. WCAG 2.4.7 failure on the product's core interactions. ↔ K1, K3

### K3 · GOV-31 **[M]** Sidebar arrow-key navigation never moves DOM focus and has no roving tabindex
A global window keydown listener drives a visual `focusedIndex`; the file contains **zero `.focus()` and zero `tabIndex`** and no Escape handler. The highlight is invisible to assistive tech and diverges from real Tab focus, so pressing Enter can act on a different conversation than the one highlighted. ↔ K2, K4

### K4 · GOV-32 **[M]** The chat shell exposes no landmarks and no headings; two chat dialogs are not modals
`WebChatPage.tsx` contains zero `<main>/<nav>/<aside>/<h1>/<h2>` (grep-verified). The shared `Sidebar` is a `<div>` (the newer `v3/WebSidebar.tsx:202` does use `<aside>`). `CreateProjectDialog` and `UpgradePlanDialog` render an overlay and an `<h2>` with no `role="dialog"`, no `aria-modal`, and do not use the repo's own `trapFocus` helper. The upgrade dialog — the conversion moment — does not trap focus or announce itself as a modal. ↔ K3, B23

### K5 · ART-22 **[M]** Artifacts panel mobile overlay has no Escape, focus trap or dialog semantics — see B23.

### K6 · GOV-33 **[M]** framer-motion animations bypass the global `prefers-reduced-motion` reset
`globals.css:1663-1672` correctly neutralizes CSS animations, but framer-motion drives inline JS transforms the CSS reset cannot reach. Every message entry animates a staggered slide, the scroll-to-bottom button scales, and the tool list animates height — unconditionally. Grep-verified: `useReducedMotion` has **0 hits** across `apps/web/features/chat`. Users with vestibular disorders get continuous unavoidable motion in the highest-frequency surface, in an app that appears to honour the preference. ↔ K7

### K7 · GOV-34 **[M]** Muted text tokens fail WCAG AA, and dark-theme muted is darker than secondary
Dark: `--chat-text-muted (#5c5955)` is *darker* than `--chat-text-secondary (#8b8680)`, inverting the hierarchy; against `--chat-bg #1a1915` ≈ **2.5:1**. Light warm: #8b8680 on #faf9f7 ≈ 3.5:1; placeholder #9b9590 on #ffffff ≈ 3.0:1. Cool themes use one #8e8e8e for both muted and placeholder ≈ 3.3:1. All at 11–12px where AA requires 4.5:1. Timestamps, model labels, token counts and composer placeholder are below legibility threshold, and the dark theme actively de-emphasizes the wrong tier. ↔ B6, K8

### K8 · CMP-14 / GOV-35 **[M]** "+" menu has no ARIA menu semantics and its active state is color-only — see C6, C8.

---

## L. Responsive & mobile

### L1 · GOV-36 **[H]** The shared sidebar has zero breakpoints and discards its `isMobile` prop
`packages/ui/ui/src/sidebar/Sidebar.tsx` (1262 lines) contains **no `sm:`/`md:`/`lg:`/`xl:` classes at all**, and accepts `isMobile` only to immediately discard it (`isMobile: _isMobile = false`). The chat shell's only breakpoint is a single 768px `matchMedia`; `WebChatPage.tsx` (2524 lines) has exactly one responsive utility in the entire file. A 375px phone and a 767px tablet receive byte-identical layout — there is effectively no phone-specific layout in the web chat surface, only a binary drawer switch at 768px. ↔ L2

### L2 · GOV-37 **[H]** Between 640px and 767px the artifact panel collapses the conversation to zero width
`ArtifactsPanel` is `sm:w-full md:w-1/2 lg:w-[480px] sm:shrink-0` inside the same flex row as the chat column (`flex-1 min-w-0`). In the sm→md band the panel takes 100%, `shrink-0` prevents it yielding, and `min-w-0` lets the chat column shrink to nothing. Separately the sidebar drawer and the artifact overlay have **no mutual exclusion**, so both can be open at once over the same content. The conversation disappears entirely with no way back except closing the panel — possibly behind two stacked overlays. ↔ L1, L3, B11

### L3 · GOV-38 **[M]** Touch targets are 28–32px, and the chat drawer lacks dialog semantics
Message action buttons are `h-7 w-7` (28px) with 14px icons across eight sites; the Send button is ~32px; the mobile hamburger — the only route to navigation on a phone — is `h-8 w-8` (32px). All below the 44px minimum. The chat page's mobile drawer is a plain `<div>` with no `role="dialog"`, `aria-modal`, focus trap or Escape handler, **while `WebAppShell.tsx:390-397` implements the same drawer correctly** — two divergent a11y contracts for the same pattern in the same app. ↔ L2, L4, K4

### L4 · GOV-39 **[M]** Web composer has no safe-area inset and no virtual-keyboard handling
The sticky mobile composer has no safe-area padding — repo-wide the only `env(safe-area-inset-bottom)` in `apps/web` is on a marketing header drawer. The viewport export omits `interactive-widget`, and `visualViewport` appears nowhere in `apps/web`. `viewportFit: 'cover'` **is** set, which makes the missing inset worse rather than neutral. The send button sits under the iOS home indicator and the composer is occluded by the keyboard — on the platform where most chat happens. `apps/mobile` handles this correctly with `KeyboardAvoidingView` in 8+ screens, so this is a web-only regression. ↔ L3

---

## M. Security & privacy

### M1 · ART-14 **[M]** No CSP on the primary web artifact path; three renderers, three postures — see B21. A model-generated artifact can exfiltrate content and pull remote script.
### M2 · ART-6 **[H]** Security banner claims sanitization that did not happen — see B17.
### M3 · PER-26 **[H]** Permanent world-readable R2 URLs bypass the authorization boundary — see H1.
### M4 · PER-25 **[H]** Delete never removes bytes; erasure gap — see H2.
### M5 · PER-11/12 **[C]** Sign-out leaves the previous user's artifacts, memory facts and conversations in the same browser — see G9, G10.
### M6 · CMP-3 **[C]** "Temporary chat" is a privacy control that never reaches the server — see C1.
### M7 · GOV-10 **[H]** Pro-tier surface entitlement enforced by a client-declared header — see I11.
### M8 · GOV-17 **[H]** IP-keyed limits bypassable with one header — see I16.
### M9 · GOV-16 **[C]** Unlimited TOTP guesses by IP rotation — see I15.
### M10 · GOV-23 **[M]** Audit records attributed from an unverified JWT — see I17.
### M11 · SYS-24 **[H]** Unvalidated model-generated arguments reach user connectors and the sandbox filesystem — see E2.
### M12 · SYS-18 / SYS-20 **[M–H]** Provider identity and internal error detail leak to the browser and into the persisted transcript — see J4, J5.

---

# Part 3 — Prioritized backlog

## P0 — Ship blockers (14 Critical)

| # | ID | Title | Cluster |
|---|---|---|---|
| 1 | SYS-1 | No base system prompt on the chat path | 1 |
| 2 | SYS-2 | Tools attached but never described in the prompt | 1 |
| 3 | STR-1 | One flat `messages` array; no per-conversation model | 2 |
| 4 | STR-2 | Single shared AbortController across all chats | 2 |
| 5 | STR-3 | Stop targets two different chats | 2 |
| 6 | STR-4 | Chat switch destroys the in-flight assistant message | 2 |
| 7 | STR-5 | Assistant turns persisted only by the browser at `[DONE]` | 2 |
| 8 | STR-6 | Global send guard held for the whole stream | 2 |
| 9 | CMP-1 | AGI Work toggle disappears; mode silently reverts | 3 |
| 10 | CMP-2 | All "+" toggles reset after the first message | 3 |
| 11 | CMP-3 | "Temporary chat" never reaches the server | 8 |
| 12 | ART-1 | React artifacts can never render | — |
| 13 | ART-2 | Fenced-block regex mis-pairs fences | 4 |
| 14 | PER-1 / PER-3 / PER-7 | Personalization: auth latch, dead `user`, inert instructions | 5 |
| 15 | PER-4 | Image inlined as multi-MB data URL into metadata | 6 |
| 16 | PER-11 / PER-12 | Sign-out leaves the previous user's data | 8 |
| 17 | GOV-1 | Cap of `0` means unlimited in the usage gate | 7 |
| 18 | GOV-16 | ~60 endpoints rate-limit per IP, not per user | 7 |

*(18 rows: PER and GOV criticals are grouped where they share one fix.)*

## P1 — High (52) — grouped by fix

**Prompt & capability (1 fix each):** SYS-3, SYS-4, SYS-5, SYS-7, SYS-8, SYS-10
**Streaming & state:** STR-7, STR-8, STR-9, STR-10, STR-11, STR-12, STR-13, STR-14, STR-15, STR-16, STR-17
**Composer:** CMP-4, CMP-5, CMP-6, CMP-7, CMP-8, CMP-11, CMP-12, CMP-20
**Artifacts:** ART-3, ART-4, ART-5, ART-6, ART-8
**Persistence & media:** PER-2, PER-5, PER-6, PER-8, PER-9, PER-10, PER-13, PER-14, PER-15, PER-17, PER-18, PER-19, PER-20, PER-24, PER-25, PER-26, PER-27, PER-28, PER-29
**Backend & errors:** SYS-16, SYS-17, SYS-20, SYS-21, SYS-23, SYS-24, SYS-26
**Governance:** GOV-2, GOV-3, GOV-4, GOV-5, GOV-7, GOV-8, GOV-10, GOV-17, GOV-18, GOV-19, GOV-20, GOV-25, GOV-27
**A11y & responsive:** GOV-29, GOV-30, GOV-36, GOV-37

## P2 — Medium (82)
All findings marked **[M]** above. Highest-value subsets: the trust cluster (dead controls, fake success — ART-15/16, CMP-10, GOV-9, GOV-19), the contrast cluster (ART-9/10/11, GOV-34), and the error-taxonomy cluster (SYS-19, SYS-32, GOV-21, GOV-26).

## P3 — Low (51)
Polish, dead code removal, and hardening. Worth batching into a single cleanup PR: ART-21, ART-23/24/25/26, CMP-25/26/28/29/30/31/32, SYS-29/33/35/36, PER-32/33, GOV-24/40, STR-28.

---

# Part 4 — Suggested sequencing

**Sprint 1 — make the model honest.** Cluster 1 (SYS-1/2/3/7 + SYS-5) is one architectural change with the highest perceived-quality return: reorder tool resolution above message assembly, then build the preamble from `EffectiveCapabilityDocument` + resolved tools + date. Ship alongside SYS-8/CMP-4 (a real web-search default) and CMP-7 (a concise default with a length axis). This alone fixes five of your fifteen items.

**Sprint 2 — make state per-conversation.** Cluster 2. Port `messagesByConversation` from unified-chat, key the AbortController and `activeRunRef` by conversation, scope `isLoading`, add the streaming guard and request sequencing to `loadConversation`, and add a `beforeunload` persist. This is the largest single refactor in the list and it closes 13 findings plus the entire parallel-chat story.

**Sprint 3 — composer identity and the artifact regex.** Cluster 3 (hoist composer state out of the branch swap, or key both instances to the conversation and always pass `projectPicker`) and Cluster 4 (one correct fence parser, deleted from the two forks). Add the missing active-state indicators (CMP-13, GOV-35) and wire or remove every dead menu item.

**Sprint 4 — persistence integrity.** Cluster 5 (auth retry + one profile source of truth + `general` in the sync allowlist + wire `instructions` into the prompt) and Cluster 6 (upload before persist; cap `metadata`; surface R2 failures; add a retry queue). Then the sign-out cleanup (PER-11/12) and the localStorage quota guard (PER-13).

**Sprint 5 — governance and trust.** Cluster 7 (extend `BillingPlanProductLimits` and thread it) plus GOV-1 (make `0` mean denied) and GOV-16/17 (per-user rate-limit identity). Then the quota-visibility trio — GOV-18/19/20 — which is small work with direct conversion impact.

**Continuous:** the a11y set (GOV-29/30/31/32/33/34) and the responsive set (GOV-36/37/38/39) are independent of everything above and can run in parallel with any sprint.

---

## What is already done well

Worth protecting during the cleanup: `work_mode: 'agiwork'` is honored end-to-end once it reaches the server; model-store and `IMAGE_MODELS` derive correctly from `models.json`; the code-execution three-signal availability formula is mirrored honestly across surfaces; Enter/Shift+Enter and IME composition are handled correctly in both composers; attachment size/MIME validation is centralized; the sync server's compare-and-swap protocol is well designed (the clients just discard its signal); `AgentActivityTimeline`'s sr-only live region and the assistant action row's aria labelling are the correct patterns to copy elsewhere; the skip link, `SendButton`, the global reduced-motion CSS reset, `LibraryView`'s three-state handling and the sidebar's loading/empty states are all solid; and `apps/mobile` is ahead of web on skeletons, empty states and keyboard handling — several web gaps are regressions against a mobile implementation that already works.

Verified as **non**-defects, to save re-investigation: `user-scalable=no` is absent everywhere; markdown code blocks and tables do have overflow handling; the offline indicator is mounted globally (though the chat send path has no offline pre-empt).
