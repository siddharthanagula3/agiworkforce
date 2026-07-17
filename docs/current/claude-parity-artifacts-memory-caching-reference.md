# Claude-Parity Reference: Artifacts, Memory, Knowledge, and Prompt Caching

Status: Reference (grounded)
Owner: Lead architect
Last updated: 2026-06-21
Scope: Shared components + request layer for a Claude-like multi-model app (web/desktop/mobile). Providers in scope: anthropic, openai, google, deepseek, qwen, mistral, moonshot, zhipu, xai, groq, perplexity, open_router, nvidia_nim.

How to read this doc: every load-bearing number is traced to a primary source URL inline. Where the fact-check could not confirm a number from a live primary page, it is labeled **UNVERIFIED** and must not be hardcoded without re-checking. Model IDs are illustrative of the source pricing tables; per repo policy, read actual model IDs from `packages/contracts/types/src/models.json`, never from this doc.

---

## 1. Artifacts & Inline Rendering

Two distinct artifact systems exist and must not be conflated: **claude.ai conversation artifacts** (the primary parity target) and **Claude Code artifacts** (stricter, static-only). Our shared components target the claude.ai behavior.

### 1.1 What triggers an artifact (claude.ai)

Claude creates an artifact when content is (verbatim, [support 9487310](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them)):

- "significant and self-contained, typically over **15 lines**"
- "something you're likely to want to edit, iterate on, or reuse outside the conversation"
- "a complex piece of content that stands on its own without requiring extra conversation context"
- "content you're likely to want to refer back to or use later"

Creation is automatic (model-decided) or explicit (user asks). There is also a sidebar Artifacts entry where Claude interviews the user to clarify before building.

### 1.2 Supported artifact types (primary-confirmed)

From [support 9487310](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them): Documents (Markdown / plain text); Code snippets; Single-page HTML websites; SVG images; Diagrams and flowcharts; Interactive React components.

- **Mermaid is UNVERIFIED** as a current primary-named type. The current help center says "Diagrams and flowcharts"; the "six types incl. Mermaid" enumeration traces only to secondary sources. Build a diagram renderer but do not market "Mermaid" as a Claude-confirmed type.

### 1.3 Rendering behaviors our components must match

- **Split-view side panel**: artifacts render "in a dedicated window to the right of the main chat" ([support 9487310](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them); [artifacts GA](https://claude.com/blog/artifacts)).
- **Live preview**: HTML renders as a live page; React components are live-rendered; SVG renders as an image; Markdown renders as styled HTML.
- **Sandboxed iframe origin**: claude.ai loads each artifact from a sandboxed `*.claudeusercontent.com` origin (stated verbatim in [Claude Code artifacts doc](https://code.claude.com/docs/en/artifacts), which notes it is "the same family used for artifacts created in claude.ai conversations"). Our preview must run untrusted generated HTML/JS in a cross-origin sandboxed iframe, never same-origin.
- **Versioning**: a version selector lets users "Switch between different versions"; editing a prior chat message creates a different version ([support 9487310](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them)). Each Claude edit produces a new navigable version.
- **Publish / share / remix** ([support 9547008](https://support.claude.com/en/articles/9547008-publish-and-share-artifacts)): Publish (Free/Pro/Max) makes it public via link; Share (Team/Enterprise) is org-only; Remix creates a new conversation with a private copy. Note the constraint: "Once you unpublish an artifact, you cannot publish that same artifact again."

### 1.4 AI-powered artifacts (artifacts that call the model from inside)

From [claude-powered-artifacts](https://claude.com/blog/claude-powered-artifacts) (launched 2025-07-25): artifacts can call Claude through an API, turning them into apps. **Usage attribution**: "Their API usage counts against _their_ subscription, not yours." Limits: "No external API calls (yet), No persistent storage, Limited to a text-based completion API." The exact JS symbol `window.claude.complete` is **UNVERIFIED** — primary docs say only "a text-based completion API."

### 1.5 Inline (ephemeral) visuals vs persistent artifacts

This contrast is a required product distinction ([support 13979539](https://support.claude.com/en/articles/13979539-custom-visuals-in-chat-and-cowork), dated 2026-04-22; [claude-builds-visuals](https://claude.com/blog/claude-builds-visuals), 2026-03-12):

- **Inline custom visuals are ephemeral**: "They appear in-line, rather than in a side panel, and they're temporary... aren't saved separately when the conversation moves on."
- **Artifacts are persistent and shareable from the start.** To persist an inline visual: copy as image, download `.svg`/`.html`, or convert to an artifact.
- Implication: our renderer needs an inline (transient, lives in the message) mode AND a panel (persistent, versioned) mode, plus a "convert to artifact" action.

### 1.6 Inline tool-output rendering (chat)

- **Web search**: responses include "Direct citations to sources, Source links..., Relevant quotes when appropriate"; image results appear inline with source links; citation fields (`cited_text`, `title`, `url`) do not count toward token usage ([support 10684626](https://support.claude.com/en/articles/10684626-enable-and-use-web-search); [web-search API](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool)). **Favicons in result cards are UNVERIFIED** (product UI, no primary text).
- **Code execution**: sandboxed Python/bash container; generates downloadable files and visualizations; only code output reaches the model's context. The legacy "analysis tool" (JS sandbox) is superseded by code execution ([analysis tool](https://claude.com/blog/analysis-tool); [code-execution API](https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool)).
- **Extended thinking**: a "Thinking" indicator with a timer and an expandable "Thinking" section above the response; click to view the summary ([support 8664678](https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings)).
- **Collapsing tool-call cards** ("Used X" / "Ran N commands"): **observed-but-UNVERIFIED** — product UI, not documented verbatim. Build the collapse/expand card pattern, but do not treat specific strings as a spec.

### 1.7 Claude Code artifacts (DIFFERENT system — do not apply these limits to chat artifacts)

From [code.claude.com/docs/en/artifacts](https://code.claude.com/docs/en/artifacts): static page only; CSP blocks all external requests; no backend; single page; source must be `.html/.htm/.md`; rendered size <= 16 MiB; Team/Enterprise beta; `*.claudeusercontent.com` origin. **Do not** apply "no React / no external libs" to claude.ai chat artifacts, which DO support live React.

---

## 2. Memory

Two unrelated systems share the name. Keep them separate in our architecture.

### 2.1 Consumer chat-history memory (the parity target)

Two independently-toggled features under Settings > Capabilities ([support 11817273](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context)):

- **Search and reference chats (on-demand / retrieval)**: "prompt Claude to search through your previous conversations to find relevant information across sessions." Runs as a tool call ("you will see this reflected in your current chat as a tool call"). Nothing is preloaded; pulled only when relevant or asked.
- **Memory summary (always-available / generate-from-history)**: "Claude will automatically summarize your conversations and create a synthesis of key insights across your chat history." "This synthesis is updated **every 24 hours** and provides context for **every new standalone conversation**." Stored in one editable place ([memory blog](https://claude.com/blog/memory)).

Note: the "on-demand vs always-available" framing maps the mechanics; the literal mobile-screen toggle labels are **UNVERIFIED** (mapped, not seen verbatim).

- **Project-scoped memory**: "Each project has its own separate memory space and dedicated project summary" — isolated from standalone-chat memory and other projects.
- **Controls**: View/edit memory; Pause memory (keep, stop using/creating); Reset memory (irreversible). Temporary/Incognito chat writes nothing. Import/export is plain-text, flagged "experimental" ([support 12123587](https://support.claude.com/en/articles/12123587-import-and-export-your-memory-from-claude)).
- **Availability**: now all plans (Free/Pro/Max/Team/Enterprise) on web/Desktop/Mobile; import/export listed for Free/Pro/Max/Team only. This was a rollout timeline, not a flat fact.

### 2.2 API `memory` tool (developer primitive — different)

From [memory-tool API](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool): client-side `/memories` file directory; tool type `{"type":"memory_20250818","name":"memory"}`; commands `view/create/str_replace/insert/delete/rename`; just-in-time retrieval ("pull it back on demand"); pairs with context editing + compaction; ZDR-eligible.

### 2.3 Requirements for our shared memory

1. Two distinct subsystems: (a) an always-on generated summary refreshed on a cadence (default to 24h parity), injected into every new standalone conversation; (b) an on-demand chat-search tool surfaced as a visible tool call.
2. Per-project isolated memory spaces; standalone memory separate from project memory.
3. User-editable single store; Pause and Reset (irreversible) controls; incognito mode that writes nothing.
4. Trust-boundary rule (repo CLAUDE.md): memory is per trust boundary. Never let Local memory leak into BYOK/Managed-Cloud silently.
5. A separate developer-facing client-side `/memories` file primitive for agentic sessions, kept distinct from consumer memory.

---

## 3. Knowledge Base / Project Files

### 3.1 Mechanism: full-context below threshold, RAG above

From [RAG for projects](https://support.claude.com/en/articles/11473015-retrieval-augmented-generation-rag-for-projects):

- Below the limit, all project knowledge loads into the context window (full-context).
- **RAG auto-activates** "when your project approaches or exceeds the context window limits," using "a project knowledge search tool" to retrieve only the most relevant content.
- **Capacity gain**: "Store up to 10x more content" while maintaining quality.
- **Reversible & automatic**: converts back to full-context if knowledge drops below threshold; no manual toggle.
- **RAG is paid-only** (Pro/Max/Team/Enterprise). Free users: max 5 projects ([what-are-projects](https://support.claude.com/en/articles/9517075-what-are-projects)).

### 3.2 Context window numbers (the RAG threshold keys off these)

From [context window](https://support.claude.com/en/articles/8606394-how-large-is-the-context-window-on-paid-claude-plans): standard 200K tokens; 500K for certain Opus/Sonnet on paid plans; up to 1M via Claude Code on some models. Which window applies in Projects depends on the selected model; there is no separate published "Projects window."

### 3.3 Context + cache interaction (the cost lever)

From [usage limit best practices](https://support.claude.com/en/articles/9797557-usage-limit-best-practices): "Content in projects is cached and doesn't count against your limits when reused"; "Every time you reference that content, only new/uncached portions count against your limits." Guidance: upload core/reference docs at project start so reuse maximizes caching.

### 3.4 Requirements

1. Two-mode knowledge retrieval: full-context when small, automatic RAG (project knowledge search tool) when large, reversible, no manual toggle.
2. Treat the knowledge base as a stable cacheable prefix (see Sections 4-5) so repeated references hit cache.
3. Per-file size / total capacity / supported file types / pre-RAG baseline are **UNVERIFIED** in Anthropic's docs (only "up to 10x" is published). Define our own documented limits; do not copy a fabricated Claude number.

---

## 4. Prompt/Token Caching — Per-Provider Matrix

Use the fact-checked numbers below. All figures current as of fetch 2026-06-21; pricing is fast-moving, re-verify before hardcoding. "Discount" = cached input billed as a fraction of standard input. Anthropic rows are CONFIRMED by an independent re-fetch of both Anthropic docs.

| Provider                     | Auto / Explicit                                                                                                            | Cached-input (read) discount                                                                                                                                         | Cache write cost                                                                      | TTL                                                                           | Min cacheable tokens                                                                                                         | Source                                                                                                                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **anthropic**                | Both (single top-level `cache_control` = auto; per-block = explicit; max 4 breakpoints)                                    | **0.1x** base input (90% off)                                                                                                                                        | 5-min: **1.25x**; 1-hour: **2x** base input                                           | 5 min default; 1 hour optional (`"ttl":"1h"`)                                 | Per-model: Opus 4.8 1,024; Opus 4.7 2,048; Opus 4.6/4.5 4,096; Sonnet 4.6/4.5 1,024; Haiku 4.5 4,096; Fable 5 / Mythos 5 512 | [prompt-caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching), [pricing](https://platform.claude.com/docs/en/about-claude/pricing)                                   |
| **openai**                   | Automatic (optional `prompt_cache_key` for routing)                                                                        | **0.1x** on current GPT-5.x (90% off); was 0.5x at 2024 launch                                                                                                       | **None** (no write/storage charge)                                                    | 5-10 min inactivity, max ~1 h; extended up to 24 h                            | **1,024** (grows in 128-token increments)                                                                                    | [guide](https://developers.openai.com/api/docs/guides/prompt-caching), [pricing](https://developers.openai.com/api/docs/pricing), [2024 launch](https://openai.com/index/api-prompt-caching/) |
| **google** (Gemini)          | Both: implicit (auto, no storage fee) + explicit `CachedContent` API                                                       | **0.1x** (2.5+ = 90% off); **0.25x** (2.0 = 75% off)                                                                                                                 | Implicit: none. Explicit: storage fee $1.00/M/hr (Flash) / $4.50/M/hr (Pro), prorated | Explicit default **1 h**, custom (no min/max bound). Implicit: not guaranteed | Implicit/explicit: 2.5 Flash/Pro **2,048**; 3.5 Flash / 3.1 Pro Preview **4,096**                                            | [caching docs](https://ai.google.dev/gemini-api/docs/caching), [pricing](https://ai.google.dev/gemini-api/docs/pricing)                                                                       |
| **deepseek**                 | Automatic (on disk)                                                                                                        | cache-hit $0.07/M (chat), $0.14/M (reasoner) vs miss $0.27 / $0.55 (~74% off)                                                                                        | No separate write charge (pay miss rate)                                              | No fixed TTL ("hours to days")                                                | 64-token unit (2024 announce; **UNVERIFIED** on current guide)                                                               | [pricing](https://api-docs.deepseek.com/quick_start/pricing-details-usd), [kv_cache](https://api-docs.deepseek.com/guides/kv_cache)                                                           |
| **qwen** (Alibaba/DashScope) | Both: implicit (auto, cannot disable) + explicit (`"cache_control":{"type":"ephemeral"}`)                                  | implicit **0.2x**; explicit **0.1x** of standard input                                                                                                               | implicit creation 1.0x; explicit creation **1.25x**                                   | implicit: not guaranteed; explicit: **5 min** (resets on hit)                 | implicit **256**; explicit **1,024** (max 4 markers/request)                                                                 | [context-cache](https://www.alibabacloud.com/help/en/model-studio/context-cache) (dated 2026-03-31)                                                                                           |
| **mistral**                  | **Explicit** — requires `prompt_cache_key`                                                                                 | **0.1x** of standard input (90% off)                                                                                                                                 | Not separately stated                                                                 | **UNVERIFIED** (no expiration on page)                                        | 64-token blocks (prompts <64 get no hit)                                                                                     | [prompt-caching](https://docs.mistral.ai/studio-api/conversations/advanced/prompt-caching)                                                                                                    |
| **moonshot** (Kimi)          | Automatic                                                                                                                  | K2.5 cache-hit $0.10/M vs miss $0.60 (~83% off)                                                                                                                      | No separate write charge stated                                                       | **UNVERIFIED** (3600s claim is secondary, not primary)                        | **UNVERIFIED**                                                                                                               | [K2.5 pricing](https://platform.kimi.ai/docs/pricing/chat-k25)                                                                                                                                |
| **zhipu** (GLM / Z.ai)       | Automatic (implicit; "similarity" matching)                                                                                | GLM-5.2 $0.26/M vs $1.40 (~81% off); GLM-5 $0.20 vs $1.00 (80% off). NOTE: cache guide's "usually 50%" is generic; **the per-model pricing column is authoritative** | Not separately stated                                                                 | **UNVERIFIED** ("reasonable time limits")                                     | **UNVERIFIED**                                                                                                               | [pricing](https://docs.z.ai/guides/overview/pricing), [cache guide](https://docs.z.ai/guides/capabilities/cache)                                                                              |
| **xai** (Grok)               | Automatic (set `x-grok-conv-id` / `prompt_cache_key` to improve hits)                                                      | reduced rate; **exact figure UNVERIFIED** (regular grok-4.3 $1.25/M input confirmed; no cached column on pricing page)                                               | Not stated                                                                            | No fixed TTL (eviction on memory pressure)                                    | **UNVERIFIED**                                                                                                               | [prompt-caching](https://docs.x.ai/developers/advanced-api-usage/prompt-caching), [how-it-works](https://docs.x.ai/developers/advanced-api-usage/prompt-caching/how-it-works)                 |
| **groq**                     | Automatic (cannot disable, no extra fee)                                                                                   | **0.5x** (50% off)                                                                                                                                                   | None                                                                                  | ~2 hours without use                                                          | 128-1,024 (model-dependent)                                                                                                  | [docs](https://console.groq.com/docs/prompt-caching)                                                                                                                                          |
| **perplexity** (Sonar)       | **No native caching documented**                                                                                           | n/a                                                                                                                                                                  | n/a                                                                                   | n/a                                                                           | n/a                                                                                                                          | [pricing](https://docs.perplexity.ai/getting-started/pricing) (absence of evidence)                                                                                                           |
| **open_router**              | Pass-through. Auto: OpenAI/Grok/Moonshot/Groq/DeepSeek. Explicit (`cache_control`): Anthropic/Gemini/Qwen                  | Passes through provider pricing; surfaces OpenAI as 0.25x/0.50x                                                                                                      | Per underlying provider                                                               | Per underlying provider                                                       | Per underlying provider                                                                                                      | [prompt-caching](https://openrouter.ai/docs/guides/best-practices/prompt-caching) (per-provider multipliers JS-rendered, **UNVERIFIED**)                                                      |
| **nvidia_nim**               | **Explicit env var** `NIM_ENABLE_KV_CACHE_REUSE=1` (TensorRT-LLM only); self-hosted KV reuse, **not a billed cached tier** | **N/A** (no per-token cached discount)                                                                                                                               | N/A                                                                                   | runtime-managed                                                               | n/a                                                                                                                          | [KV-cache-reuse](https://docs.nvidia.com/nim/large-language-models/latest/kv-cache-reuse.html)                                                                                                |

Anthropic per-model absolute prices ($/MTok), CONFIRMED ([pricing](https://platform.claude.com/docs/en/about-claude/pricing)): Opus 4.8/4.7/4.6/4.5 = $5 in / $6.25 (5m write) / $10 (1h write) / $0.50 read / $25 out. Sonnet 4.6/4.5 = $3 / $3.75 / $6 / $0.30 / $15. Haiku 4.5 = $1 / $1.25 / $2 / $0.10 / $5. Fable 5 + Mythos 5 = $10 / $12.50 / $20 / $1.00 / $50.

Tokenizer caveat affecting effective cost: "Opus 4.7 and later use a new tokenizer... may use up to **35% more tokens** for the same fixed text" ([pricing](https://platform.claude.com/docs/en/about-claude/pricing)).

UNVERIFIED items not to hardcode: OpenAI legacy (GPT-4.1/4o/o-series) cached rates (rows gone from live pricing); xAI exact cached price; Kimi TTL + min tokens; GLM min tokens + TTL; Mistral TTL; OpenRouter per-provider numeric multipliers; DeepSeek 64-token unit currency; Perplexity native caching support.

---

## 5. What Breaks a Cache

Universal rule across providers: **caching is keyed on (account/org + model + exact token prefix)**, computed from the start of the prefix. Any change to the prefix, or to the model, produces a cache miss.

Primary-sourced statements:

- xAI: "the system checks how many messages at the beginning match a previous request **exactly**"; "any edit, removal, or reorder breaks the cache" ([how-it-works](https://docs.x.ai/developers/advanced-api-usage/prompt-caching/how-it-works)).
- Groq: "Cache hits are only possible for **exact prefix matches**... Even minor changes prevent cache hits" ([docs](https://console.groq.com/docs/prompt-caching)).
- DeepSeek: "Only requests with **identical prefixes** (starting from the 0th token) are considered duplicates" ([announcement](https://api-docs.deepseek.com/news/news0802)).
- Anthropic hierarchy: caches follow `tools` -> `system` -> `messages`; "Changes at each level invalidate that level and all subsequent levels" ([prompt-caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)). The prefix is a cumulative hash; changing any block at or before a breakpoint changes the hash.

Specific Anthropic invalidators ([prompt-caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)): changing tool definitions invalidates the entire cache; toggling web search / citations / speed setting modifies the system prompt (invalidates system + messages); `tool_choice` and image add/remove and thinking-param changes invalidate messages. Thinking-block preservation is model-dependent (preserved by default on Opus 4.5+/Sonnet 4.6+; stripped on earlier/Haiku). Opus 4.8 special case: append a `{"role":"system"}` message instead of editing top-level `system` to avoid invalidation.

**Model switching mid-chat = cache miss.** This is true in practice but is an architectural inference, not a verbatim Anthropic rule (fact-check upholds this caveat). The cache entry is a model-specific prefix hash; different models tokenize identical text differently (Opus 4.7+ new tokenizer), and caches are per-model/per-workspace with no documented cross-model sharing. Treat "separate cache per model" as the operating assumption for every provider.

### Engineering rules to keep caches warm

1. **Pin the model** for the life of a conversation. Switching models = full cache miss (and on Anthropic, retokenization). Make model a conversation-level decision, not a per-message one.
2. **Stable system prompt.** No timestamps, request IDs, or per-request strings in the system prefix. Put all volatile content after the last cache breakpoint / at the end of the prompt.
3. **Stable, ordered tool list.** Do not add/remove/reorder tools or edit tool descriptions mid-conversation (invalidates the entire Anthropic cache; breaks exact-prefix on others). Decide the tool set up front.
4. **Append-only history.** Never edit or reorder earlier messages. Editing message N invalidates everything from N onward. Place `cache_control` on the last block that stays stable across requests, not on a per-request block (Anthropic lookback is at most 20 positions per breakpoint).
5. **Static prefix first, variable content last** (OpenAI/Gemini explicitly reward this; universally safe).
6. **Stable knowledge-base / project prefix** so the RAG/full-context block stays cacheable across turns.
7. **Don't flip request-level toggles** (web search, citations, thinking, speed) mid-conversation if you want the Anthropic cache to survive.
8. **Provider-specific keys**: set `prompt_cache_key` (OpenAI, Mistral-required, xAI Responses) / `x-grok-conv-id` (xAI) per stable conversation/session id to improve routing/hit rate.
9. **Agentic loops are the prime cache-amortization case.** Appending `tool_result` blocks to a cached conversation preserves the cached prefix and only charges for new tokens; the cache breakpoint moves forward as the conversation grows. Pre-warm large system prompts / tool schemas with `max_tokens: 0` (write the cache without generating output) on cold start, then reuse across many tool calls ([prompt-caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)).

---

## 6. Billing/UX Model for Cached Inputs

### 6.1 Pass the provider discount through to the user

Principle: meter the actual cache-read vs cache-write vs uncached tokens the provider reports, and bill the user at the provider's reduced cached rate (plus our markup applied uniformly). Never bill cached input at the full input rate when the provider gave us a discount.

The math (per request), using provider-reported usage fields:

```
billable_input_cost =
    cache_read_tokens     * base_input_price * read_multiplier
  + cache_write_tokens    * base_input_price * write_multiplier
  + uncached_input_tokens * base_input_price
  + output_tokens         * base_output_price
```

Anthropic multipliers: `read_multiplier = 0.1`; `write_multiplier = 1.25` (5m) or `2.0` (1h). Break-even: a 5-min cache (1.25x write) pays off after **one** read; a 1-hour cache (2x write) after **two** reads (verbatim, [pricing](https://platform.claude.com/docs/en/about-claude/pricing)). OpenAI/most others: write_multiplier = 1.0 (no write charge), read_multiplier ~= 0.1 (provider/model-specific). Gemini explicit adds a separate per-hour storage charge that must be metered against TTL.

### 6.2 Meter reads vs writes from provider usage fields

Read the per-provider usage fields and never estimate:

- Anthropic: `cache_read_input_tokens`, `cache_creation_input_tokens`, `input_tokens` (the last counts only tokens after the last breakpoint). `total_input = read + creation + input`.
- OpenAI: `prompt_tokens_details.cached_tokens`.
- Gemini: cached token count + storage duration in usage/billing.
- DeepSeek: `prompt_cache_hit_tokens`, `prompt_cache_miss_tokens`.
- xAI: `usage.prompt_tokens_details.cached_tokens` (Chat) / `input_tokens_details.cached_tokens` (Responses).
  Store read/write/uncached/output separately per turn so the user invoice and our cost reconciliation both line up with provider billing.

### 6.3 Surface cache state and the model-switch penalty to users

Required UX:

- Show a per-conversation "cache warm" indicator and, on the cost breakdown, a "cached input (X% off)" line so users see they are paying less for reused context.
- **When a user changes the model mid-conversation, warn before confirming**: "Switching models starts a new cache. Your prior context will be re-billed at full input price (and may re-tokenize), with no cached savings until the cache rebuilds." Make the model a sticky conversation setting with an explicit change confirmation.
- State the operating rule plainly in help/UX: **no changes to the prefix for caching to work** — switching models, editing earlier messages, or changing the tool/system prompt restarts the cache and removes the discount.
- For providers with no caching (Perplexity) or no billed cached tier (NVIDIA NIM), do not show a cache-savings line; show "no cache discount available for this provider."

---

## 7. Build Implications — Prioritized Checklist

### P0 — Request layer correctness + cache economics

1. **Per-provider cache adapter** in the request layer that knows each provider's mechanism (auto/explicit), required params (`cache_control` breakpoints for Anthropic/Gemini/Qwen; `prompt_cache_key` for Mistral/OpenAI/xAI), min-token thresholds, TTLs, and write/read multipliers from Section 4.
2. **Stable-prefix request builder**: assemble every request as [tools (stable)] -> [system (stable)] -> [knowledge/project prefix (stable)] -> [append-only history] -> [volatile/user-variable content last]. Enforce append-only history; forbid mid-conversation tool/system mutation. Place Anthropic `cache_control` on the last stable block.
3. **Pin model per conversation**; route every turn to the same model unless the user explicitly switches (with the Section 6.3 warning).
4. **Usage metering** that records cache_read / cache_write / uncached_input / output separately from each provider's usage fields, and a billing function implementing the Section 6.1 math with per-provider multipliers + Gemini explicit storage.
5. **Trust-boundary enforcement** (repo rule): Local / BYOK / Managed-Cloud caches, memory, and knowledge are isolated; never silently cross boundaries.

### P1 — Artifact + inline rendering parity

6. **Sandboxed artifact viewer** in a cross-origin iframe (untrusted HTML/JS/React), split-view panel, with a separate ephemeral inline-visual renderer in the message stream, plus "convert to artifact."
7. **Artifact versioning** store + version selector; new version on each model edit and on prior-message edit.
8. **Artifact type renderers**: Markdown, code, single-page HTML, SVG, React (live), diagrams/flowcharts. Treat Mermaid as a diagram engine choice, not a Claude-confirmed type.
9. **Inline tool-output components**: web-search citation/source cards, code-execution output + downloadable files, collapsible extended-thinking block, collapsible tool-call cards.
10. **Publish/share/remix** with plan-scoped visibility (public vs org-only) and the unpublish-once constraint.

### P2 — Memory + knowledge parity

11. **Generated memory summary** (always-on, ~24h refresh cadence, injected into new standalone conversations), user-editable single store, Pause/Reset, incognito (writes nothing).
12. **On-demand chat-search tool** surfaced as a visible tool call, separate from the always-on summary.
13. **Per-project isolated memory + project summary**, separate from standalone memory.
14. **Knowledge base with full-context <-> automatic RAG** (project knowledge search tool) switching by size, reversible, no manual toggle; keep the knowledge block in the cacheable prefix.
15. **Client-side `/memories` file primitive** for agentic sessions, distinct from consumer memory; pairs with context editing/compaction.

### P3 — Hardening

16. Cache-state UX (warm indicator, cached-discount line, model-switch warning) per Section 6.3.
17. Re-verify all pricing/min-token/TTL numbers against primary sources on a schedule; gate hardcoded numbers behind the UNVERIFIED list above; read model IDs from `packages/contracts/types/src/models.json` only.
18. Provider quirks: OpenAI ~15 req/min overflow per (prefix + cache_key); Anthropic 1h TTL needs no beta header on current Claude API (may need `extended-cache-ttl-2025-04-11` on older SDKs/partner platforms — verify per platform); OpenRouter top-level `cache_control` routes Anthropic-direct only (excludes Bedrock/Vertex).

---

## 8. Current state vs this reference (repo audit, 2026-06-21) — gaps + immediate fixes

Mapped against an audit of our actual code. We are NOT greenfield — caching is surprisingly
mature; memory/knowledge are mostly scaffolding. Each gap cites the audit's evidence.

### 8.1 Caching — strong foundation (the "web gets zero caching" alarm was FALSE)

> **CORRECTION (verified in code 2026-06-21).** An earlier audit pass claimed "the web path
> never enables the cache policy → zero caching." That is **WRONG**. Traced the live path:
> `apps/web/lib/runtime/WebChatRuntime.ts:146` sends `use_prompt_cache: true`, and the web
> `AnthropicProvider` (`apps/web/lib/llm-providers/anthropic.ts`, used via
> `lib/llm-providers/factory.ts`) applies `cache_control` to system + tools + last block
> **gated on `request.usePromptCache`** (lines 186-188 / 383-385), with a `highReusePrefix`
> 1h-TTL upgrade when tools are present. So web Anthropic caching IS active. The
> `request-processor` simply forwards `usePromptCache` to the provider (which constructs the
> policy) — it does not need to construct it itself. (`api-gateway` is a SEPARATE service path
> that enables it its own way.) Lesson logged: confirm in source before acting on audit claims.

WE HAVE (verified):

- Anthropic `cache_control` on system + last-user block, ephemeral, with a stable-prefix
  split via a `<!-- AGIWORKFORCE_CACHE_BOUNDARY -->` marker
  (`packages/ai/provider-protocol/src/anthropic-payload-policy.ts`, `system-prompt-cache-boundary.ts`).
- Cache-read extraction for all 6 provider response shapes + a provider-aware cost calculator
  with correct disjoint-vs-subset token accounting and 0.1× read / 1.25× write
  (`apps/web/.../stream-transform.ts:278-334`, `apps/web/lib/services/llm-cost-calculator.ts`),
  surfaced as `x_agi_workforce.cache: { tokens_saved, cost_saved_cents }`.
- Cache-friendly request assembly: system prompt pass-through (no volatile injection), tool
  list deterministically ordered, history append-only.

GAPS (prioritized) — the web-cache-enable "gap" was a false alarm (see correction above):

- **P0 — model-switch protection missing.** No model lineage in the request envelope, no
  warning when the user switches models mid-conversation. Per §5/§6.3 this silently re-bills
  the whole prefix at full price. Fix: pin model per conversation + the §6.3 warning UX.
- **P1 — tool list can change per turn.** Tools appended conditionally on per-turn flags
  (`request-processor.ts:1042-1076`); flipping web_search/code_execution mid-chat busts the
  Anthropic cache (§5). Fix: make the tool set a conversation-level decision.
- **P2 — OpenAI `prompt_cache_key` is dead code** (`packages/ai/providers/openai/src/types.ts:89`);
  Mistral REQUIRES it (§4). Fix: send a stable per-conversation `prompt_cache_key` for
  OpenAI/Mistral/xAI.
- **P3 — verify hardcoded multipliers/min-tokens against §4** (Anthropic minimums differ per
  model: Opus 4.8 1,024 vs Haiku 4.5 4,096).

### 8.2 Memory — storage exists, intelligence not wired

WE HAVE: `user_memories` table (`0010_memory.sql`) + CRUD + search + `/api/memory/sync`;
shared `useMemoryStore`/`MemoryEditor`; web injects up to 50 facts into the system prompt
(`apps/web/lib/runtime/memory-context.ts`).
GAPS vs §2: (a) the **24h generated summary** (§2.1 always-available) is NOT implemented —
`memoryGenerateFromHistory` is a defined-but-unwired flag in the web runtime; (b) the
**on-demand chat-search tool** (§2.1) isn't surfaced as a visible tool call; (c) local stores
don't auto-push to server; sync reconciliation is a `conflicts:0` placeholder; (d) per-project
isolated memory (§2.1) not implemented; (e) managed-gating inconsistent across surfaces.
Fix order: generated-summary job → chat-search tool → real sync (rides the managed sync spine)
→ project memory.

### 8.3 Knowledge base — mostly scaffolding (biggest gap)

WE HAVE: `project_knowledge_files` table + metadata API; desktop full-context-injects ≤24KB
(`apps/desktop/.../chat/index.tsx:1065-1107`); embeddings/RAG Tauri stubs exist but UNUSED.
GAPS vs §3: (a) **no actual file storage/upload** (only metadata); (b) **no RAG** (the
full-context↔automatic-RAG switching in §3.1 is unbuilt); (c) **web doesn't inject project
knowledge at all**; (d) not synced cross-device; (e) knowledge block isn't in the cacheable
prefix (§3.3). Furthest from parity. Fix: file storage + extraction → web injection (cacheable
prefix) → automatic RAG above the context threshold → managed sync.

### 8.4 Artifacts — extraction-only; missing the inline/persistent split + tool

WE HAVE (Step 1a done): one shared derivation (`@agiworkforce/artifacts`) with deterministic
ids; web/mobile consume it; the shared split-view viewer matches §1.3 layout.
GAPS vs §1: (a) artifacts are created ONLY by markdown extraction — **no artifact tool the
model calls** (§1.1); (b) the **ephemeral-inline vs persistent-panel split (§1.5)** isn't
modeled, nor "convert to artifact"; (c) versioning partial; (d) publish/share/remix (§1.3)
gated/unwired despite `packages/platform/artifacts` having the publish primitive; (e) verify our
`SandboxedIframe` uses a cross-origin sandbox (§1.3 requires `*.claudeusercontent.com`-style
isolation, never same-origin).

### 8.5 Sequencing

The single shared artifact model (consolidation Step 1) + the managed sync spine (P5) are the
substrate; memory/knowledge/caching all ride the same trust-boundary + sync + cacheable-prefix
rules. **Build the request-layer cache fixes (8.1 P0) early** — low-risk, high-ROI, and
independent of the UI consolidation.
