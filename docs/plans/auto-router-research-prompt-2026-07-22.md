# Research-Agent Prompt — Single "Auto" intelligent model router

Hand the block below to a research agent that has **no repo access**. It returns a
build-ready design for collapsing three Auto tiers into ONE intent/modality/tier/cost/cache-aware
router. Paste its output back to the coding agent.

---

You are a **senior ML-systems + inference-routing architect**. Design the **best production architecture for a single "Auto" model-router** for a multi-provider AI assistant (**AGI Workforce**). You have **no source-code access** — design from the concrete context below, public routing research, and vendor docs. Do not invent APIs, model IDs, or pricing; mark each claim **[verified]** (official source) or **[inferred]** (best practice), and use current 2026 information.

## The problem

Today the product exposes **three** Auto choices — `Auto Economy`, `Auto Balanced`, `Auto Premium` (profiles economy/balanced/premium). We want to collapse them into **ONE "Auto"** that, per request, automatically picks the single best concrete model. The one Auto must route on **all** of:

1. **Subscription tier** — which models the user may access (free / basic / pro / max / enterprise / BYOK). Higher tiers unlock flagship models.
2. **Intent / task** — chat, coding, reasoning, research/web-search, image generation, video generation, creative writing, long-context, agentic/tool-use, computer-use, embeddings, speech.
3. **Input modality** — text, image, audio, video, files (route to a model that accepts them).
4. **Required output** — e.g. "make an image" → image model; "write code" → coding model; plain answer → chat model.
5. **Query complexity** — a bare "hi" or a trivial lookup must go to a **cheap, fast** model; a hard multi-step task to a stronger one. (Don't burn a flagship on "hi".)
6. **Cost-efficiency** — minimize $ per successful request at acceptable quality; exploit **caching**: provider prompt/input caching, output/response caching, and cache-aware routing (prefer a model whose prompt-prefix is already cached). Account for cache-write vs cache-read pricing.

## Current architecture (design to fit / improve this)

- **Slot-based catalog router.** A request's task maps to ordered **slots**; each slot resolves to one concrete `modelKey`. Profiles pick which slot variant (economy/balanced/premium). Tier **clamps** the profile (free→economy, pro→balanced, max/ent/byok→premium) and an **allow-list** limits which slots a tier can reach (free ≈ only a workhorse general slot). Selection: capability+runtime admission → task lookup → tier-clamped profile → ordered `preferredSlots` → first allowed+present+eligible slot wins → else a `fallbackSlot` (workhorse general) → else `no_eligible_route`. Cross-provider failover walks the same slots.
- We want to **keep the data-driven slot/task/tier catalog** but replace the 3 user-facing profiles with **one Auto that computes the profile/slot itself** from intent+modality+complexity+cost+cache signals.

## Our real model catalog (subset — design around these; ~47 models, multi-provider)

Pricing = USD /1M tokens (input/output), cache = cached-input /1M. tier = minimum subscription tier.

| id                     | provider   | tier  | type       | key caps                                | ctx   | in/out $      | cache $ |
| ---------------------- | ---------- | ----- | ---------- | --------------------------------------- | ----- | ------------- | ------- |
| gemini-3.5-flash-lite  | google     | free  | multimodal | tools,vision,search,codeExec,thinking   | 1M    | 0.30 / 2.50   | 0.03    |
| qwen-3.5-flash         | qwen       | free  | multimodal | tools,vision,reason                     | 1M    | 0.029 / 0.287 | 0.0058  |
| qwen-3.7-plus          | qwen       | free  | multimodal | tools,vision,reason                     | 1M    | 0.4 / 1.6     | 0.08    |
| deepseek-v4-flash      | deepseek   | free  | code       | tools,vision,reason                     | 1M    | 0.14 / 0.28   | 0.0028  |
| glm-5.2                | zhipu      | free  | reasoning  | tools,reason,codeExec                   | 1M    | 1.4 / 4.4     | 0.26    |
| gpt-5.6-luna           | openai     | basic | reasoning  | tools,vision,reason,search              | 1.05M | 1 / 6         | 0.1     |
| claude-haiku-4.5       | anthropic  | pro   | chat       | tools,vision,reason,search              | 200k  | 1 / 5         | 0.1     |
| gpt-5.6-terra          | openai     | pro   | reasoning  | tools,vision,reason,search              | 1.05M | 2.5 / 15      | 0.25    |
| gemini-3.5-flash       | google     | pro   | multimodal | tools,vision,reason,search,codeExec     | 1M    | 1.5 / 9       | 0.15    |
| claude-sonnet-5        | anthropic  | pro   | code       | tools,vision,reason,codeExec,cu,agentic | 1M    | 3 / 15        | 0.3     |
| qwen-max               | qwen       | pro   | reasoning  | tools,reason,codeExec                   | 1M    | 1.2 / 6       | —       |
| kimi-k3                | moonshot   | pro   | multimodal | tools,vision,reason,agentic             | 1.05M | 3 / 15        | 0.3     |
| gemini-3.1-pro-preview | google     | pro   | reasoning  | tools,vision,reason,search,codeExec     | 2M    | 2 / 12        | 0.2     |
| sonar-deep-research    | perplexity | pro   | search     | reason,search                           | 128k  | 2 / 8         | —       |
| gpt-5.6-sol            | openai     | max   | reasoning  | tools,vision,reason,search              | 1.05M | 5 / 30        | 0.5     |
| claude-opus-4.8        | anthropic  | max   | reasoning  | tools,vision,reason,codeExec,cu,agentic | 1M    | 5 / 25        | 0.5     |
| grok-4.5               | xai        | max   | reasoning  | tools,vision,reason,vidGen,codeExec     | 500k  | 2 / 6         | —       |
| gemini-3.1-flash-image | google     | —     | image      | imgGen                                  | —     | 0.039 / 0     | —       |
| gpt-image-2            | openai     | —     | image      | imgGen                                  | —     | 8 / 30        | —       |
| veo-3.1                | google     | —     | video      | vidGen                                  | —     | — / 750       | —       |
| sonar                  | perplexity | free  | search     | search                                  | 128k  | 1 / 1         | —       |
| gemini-embedding-2     | google     | —     | embedding  | embeddings                              | 8k    | 0.2 / 0       | —       |
| gpt-4o-transcribe      | openai     | —     | stt        | speech-to-text                          | —     | 0.006 / 0     | —       |
| tts-1-hd               | openai     | —     | tts        | text-to-speech                          | —     | 30 / 0        | —       |

Notes: many models support **prompt/context caching** (cache column); several open-weight models (qwen/deepseek/glm) are far cheaper than flagships; only some providers expose **native web search** (OpenAI/Anthropic/Google/Perplexity/gemini-flash-lite). Image/video/speech are separate model families. The product is **open-weight-first** (prefer cheaper open models when quality suffices) and must **never hard-depend on one model** (every route needs fallbacks).

## Research + design deliverable

Produce a complete, implementable design. Cover, with depth and tradeoff analysis:

1. **Reference systems** — survey how production routers do this and what to adopt: RouteLLM, NotDiamond, Martian, Unify.ai, OpenRouter "auto", Portkey, LiteLLM Router, semantic-router, Requesty/Helicone, and any "GPT-5-style" built-in router. What each does for intent classification, difficulty estimation, cost-aware selection, and caching. [verified] where possible.
2. **Router architecture** — the end-to-end pipeline for ONE request: signal extraction → candidate pool (tier+modality+capability filter) → task/intent classification → complexity/difficulty estimation → cost-quality optimization → cache-aware adjustment → final model + ordered fallbacks. Show it as a diagram + step list. Decide what runs **pre-model** (cheap, <~50ms) vs. a **small router model** vs. heuristics.
3. **Intent / task classification** — compare: keyword/heuristic, embedding-kNN over labeled exemplars, a small fast classifier LLM, provider "router" models, and hybrid. Give latency/cost/accuracy tradeoffs and a recommendation; include how to detect explicit output intent ("make an image", "search the web", "write code") and multimodal inputs.
4. **Complexity / difficulty estimation** — how to cheaply decide "hi" → tiny model vs. hard task → flagship (token length, embeddings, a difficulty scorer, cascade/verify-then-escalate). Cover **model cascading** (try cheap, escalate on low confidence) and its cost math.
5. **Cost-quality optimization** — formalize the objective (maximize quality per $ under a tier/latency budget). Use per-model benchmark scores + $ pricing to compute a utility; show the selection rule. Include an explicit **"route the simple query to the cheapest adequate model"** policy and quantify savings.
6. **Caching (first-class, per your emphasis)** — design: (a) **provider prompt/input caching** (Anthropic/OpenAI/Google/Qwen/DeepSeek cache-read pricing; how to structure the prompt prefix for hits; cache-write vs cache-read cost accounting); (b) **cache-aware routing** (prefer a model/endpoint whose prefix is already warm; keep a conversation pinned to one model to preserve its cache); (c) **semantic response cache** (embed the request, serve a cached answer on a near-duplicate — thresholds, staleness, safety); (d) **write-through/negative caching**. Give the data model + eviction + a cost model showing cache ROI.
7. **Tier-aware candidate pools** — how tier gates the pool and interacts with the profile clamp; what "Auto" does when the best model for the intent is above the user's tier (downgrade gracefully vs. upsell). Keep it honest (never silently route to a model the user can't afford).
8. **Reliability** — fallbacks per route (distinct providers), pre-first-byte failover, idempotency so a retry never double-charges/double-acts, and handling of `no_eligible_route`.
9. **Config schema** — a concrete data model (JSON) for tasks, slots→model mappings, tier allow-lists, per-model quality/cost/caps, and the routing weights — so the router stays **data-driven** (add a model without code changes). Fit it to the existing slot/task/tier catalog described above.
10. **Evaluation** — how to measure the router: offline (a labeled query set with per-model quality/cost) and online (A/B, cost-per-successful-request, quality regression, latency). Define the metrics and a rollout plan (shadow → canary).
11. **Edge cases & failure modes** — ambiguous intent, mixed-modality requests, streaming vs non-streaming, tool-loop turns (does the router pick once or per-step?), very long context, cache poisoning, tier changes mid-conversation, provider outages.
12. **Acceptance criteria** — a verifiable checklist for "the single Auto is correct" (e.g. "hi" routes to a sub-$0.30/1M model; an image request routes to an image model; a free user never hits a max-tier model; a cached-prefix follow-up reuses the same model; every route has ≥1 fallback).

## Output format

One section per numbered item, each led by a 2-sentence TL;DR. End with a **"Recommended design (one page)"** synthesis — the concrete router I should build — and a **"Confidence & gaps"** list of anything you had to infer. Prioritize depth on **intent classification, complexity-based cheap-routing, cost-quality optimization, and caching** (the four the founder emphasized).
