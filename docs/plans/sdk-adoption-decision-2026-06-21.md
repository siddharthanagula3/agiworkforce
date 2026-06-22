# SDK adoption — decision (2026-06-21)

Grounded by the `official-sdk-research` workflow (context7 + WebSearch) which **verified the
repo**, correcting its own framing. Full research: workflow `wreilzpz4`.

## Ground truth

- The official SDKs are ALREADY installed: `ai@^6`, `openai@^6.38`, `@anthropic-ai/sdk@^0.91`.
- There are **3 parallel provider stacks**: A) `apps/web/lib/llm-providers/*` (raw fetch, 12
  providers, LIVE primary web path), B) `apps/web/core/ai/llm/providers/*` (hand-rolled, 7,
  LIVE second path), C) `packages/providers/*` (wraps official SDKs, 8, used ONLY by
  `services/api-gateway`). They have DRIFTED (correctness liability).

## Decision: option (b), scoped

Adopt the official Anthropic + OpenAI SDKs **under our existing `BaseLLMProvider` interface**;
collapse Stacks A+B onto one SDK-backed transport (extend Stack C's proven pattern). KEEP our
own: the provider/factory contract, normalized usage→cost mapping (`lib/cost-tracker.ts`,
`lib/services/llm-cost-calculator.ts` — transport-agnostic), prompt-cache strategy, and the
Local/BYOK/Managed consent + secret-scan + provider-label gating. SDKs supply transport,
retries, typed errors, streaming, token counting, authoritative field types — NOT our trust
boundary.

- **Reject (a)** AI-SDK-as-universal-replacement: rip-and-replace of 3 working stacks for an
  abstraction we mostly get free from the official SDKs; v6 churn; and the **Gateway is
  third-party transit → disqualified for Local/BYOK** (locked rule). AI Gateway = Managed-Cloud
  tier ONLY, still behind our ledger/abuse/retention gates.
- **Reject (c)** pure hand-rolled: A+B duplicate retries/SSE/errors/token-counting the SDKs
  ship, and have drifted.
- Direct `@ai-sdk/*`/official-SDK packages talk straight to each provider with a caller key +
  baseURL → safe for Local/BYOK (nothing transits Vercel). Only the Gateway adds a third party.

## Concrete drift fixes (real, in live code — do regardless of the migration)

1. **Stack C dead `prompt_cache_key`** (`packages/providers/openai`): declared+commented, never
   assigned. Populate from a stable conversation/tenant id in the translate builders. (NOTE:
   the LIVE web path Stack A already sets it correctly — `apps/web/lib/llm-providers/openai.ts`
   :159/:346 — so this is non-web only.)
2. **Live Anthropic web provider lacks `tool_choice`** (`apps/web/lib/llm-providers/anthropic.ts`
   — confirmed absent): can't force/forbid/select a tool or `disable_parallel_tool_use`. Thread
   it through send/stream. Keep it STABLE per conversation (changing it invalidates cached
   message blocks; tools/system survive).
3. **Live Anthropic web provider has no token counting**: add a thin `messages.countTokens`
   call (GA, free) for pre-send estimates.

## Verified caching facts (from the SDKs, supersede earlier WebSearch where they differ)

- Anthropic `cache_control` 1h TTL is **GA, NO beta header**; usage now reports a
  `cache_creation.{ephemeral_5m_input_tokens, ephemeral_1h_input_tokens}` breakdown.
- OpenAI: `prompt_cache_key` is a top-level string on BOTH Chat Completions and Responses;
  newer `prompt_cache_retention?: 'in_memory'|'24h'|null`. **Responses API is recommended for
  new work** (better cache utilization; from GPT-5.4 tool-calling with `reasoning:none`
  REQUIRES Responses).

Migration is phased + invisible-by-design — sequence it AFTER the visible artifacts/parity
work unless a drift bug bites. Read model IDs from `packages/types/src/models.json` only.
