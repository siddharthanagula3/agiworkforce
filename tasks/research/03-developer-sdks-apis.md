# 03 — Developer SDKs and provider APIs first pass

**Recommendation:** AGI should own the app-level LLM contract and keep provider adapters thin, explicit, and testable. Do not let any vendor SDK or gateway define product semantics.

## Why

- Prompt caching is materially different across Anthropic, OpenAI, Google, Mistral, DeepSeek and xAI.
- Provider terms are not interchangeable; a gateway cannot make prohibited resale allowed.
- API pricing and model aliases can change within typical 30-day notice windows.
- Tool use, structured output, files, grounding, batch, realtime, and safety metadata differ enough to require feature flags.

## Recommended internal contract

```ts
export type LlmRoute = {
  provider:
    | 'openai'
    | 'anthropic'
    | 'google'
    | 'mistral'
    | 'deepseek'
    | 'xai'
    | 'openrouter'
    | 'local';
  model: string;
  accountMode: 'byok-direct' | 'byok-proxy' | 'agi-managed' | 'local';
  capabilities: CapabilityFlags;
  budget: BudgetPolicy;
  cacheIntent?: CacheIntent;
  safetyPolicy: SafetyPolicyRef;
};

export type CacheIntent = {
  staticPrefixHash: string;
  minExpectedInputTokens: number;
  desiredTtlSeconds?: number;
  providerSpecific?: Record<string, unknown>;
};

export type CacheObservation = {
  provider: string;
  model: string;
  inputTokens: number;
  cachedReadTokens?: number;
  cacheWriteTokens?: number;
  storageTokenHours?: number;
  hit: boolean;
  reason?: string;
};
```

## Provider capability matrix

| Provider      | Prompt caching                                      | Tools / structured output               | Vision/audio                               | Batch                   | TOS posture                                           | Evidence        |
| ------------- | --------------------------------------------------- | --------------------------------------- | ------------------------------------------ | ----------------------- | ----------------------------------------------------- | --------------- |
| Anthropic     | Yes; explicit cache_control, 5m/1h TTL              | Tools/structured patterns               | Vision yes; audio limited by model/product | Batch discount          | Resale requires approval; customer apps allowed       | S004,S005,S006  |
| OpenAI        | Yes; automatic >=1024 tokens, prompt_cache_key      | Tools/structured output/realtime        | Vision/audio/realtime broad                | Batch for eligible APIs | No account resale; customer responsible for app users | S007,S008,S009  |
| Google Gemini | Yes; cached content + TTL storage billing           | Tools/structured output/Live API family | Vision/audio/live family                   | Batch/async varies      | 30-day pricing change; grounding restrictions         | S010,S011,S012  |
| xAI           | Automatic prompt caching                            | Tools/features need current docs        | Vision/audio varies                        | Unknown                 | Requires current legal review                         | S042            |
| DeepSeek      | Automatic context caching                           | Tools/openai-compatible patterns        | Text/reasoning primary                     | Unknown                 | Alias deprecation warning                             | S040            |
| Mistral       | Prompt prefix caching, cached tokens 10% input      | Tools/structured features               | Vision on selected models                  | Batch/fine-tune varies  | Needs current terms review                            | S041            |
| Perplexity    | Search/answer API, model routing                    | Search/retrieval emphasis               | Varies                                     | Unknown                 | Needs current terms review                            | needs_full_pass |
| Moonshot/Kimi | Likely long-context API                             | Needs verification                      | Needs verification                         | Unknown                 | Needs regional terms review                           | needs_full_pass |
| Z.ai/GLM      | Chinese/global API candidate                        | Needs verification                      | Needs verification                         | Unknown                 | Needs regional terms review                           | needs_full_pass |
| Groq          | Low-latency inference API                           | OpenAI-compatible patterns              | Model-dependent                            | Unknown                 | Needs terms review                                    | needs_full_pass |
| Together      | Hosted open models                                  | OpenAI-compatible patterns              | Model-dependent                            | Unknown                 | Needs terms review                                    | needs_full_pass |
| Fireworks     | Hosted open models                                  | OpenAI-compatible patterns              | Model-dependent                            | Unknown                 | Needs terms review                                    | needs_full_pass |
| Azure OpenAI  | OpenAI models via Azure                             | Enterprise Azure controls               | Model-dependent                            | Enterprise options      | Azure terms/data residency                            | needs_full_pass |
| AWS Bedrock   | Multi-model cloud                                   | AWS IAM/guardrails                      | Model-dependent                            | Enterprise options      | AWS terms/model provider terms                        | needs_full_pass |
| OpenRouter    | Aggregator; supports sticky routing/cache semantics | OpenAI-compatible aggregator            | Provider-dependent                         | No                      | Model terms flowdown; no competing resale             | S023            |

## Vercel AI SDK vs raw SDK vs AGI normalize

| Option                        | Use                                                                          | Do not use for                              | Lock-in profile                                             |
| ----------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------- |
| Raw provider SDKs             | Provider-specific features, cache controls, beta APIs, highest fidelity      | App-wide canonical interface                | High unless wrapped.                                        |
| Vercel AI SDK                 | Web streaming/UI, TypeScript ergonomics, fast prototypes                     | Canonical mobile/runtime policy model       | Medium; provider details still leak.                        |
| `@agiworkforce/llm-normalize` | Product contract, routing policy, telemetry schema, BYOK/local/managed modes | Reimplementing every provider feature in v1 | Lowest app lock-in, higher maintenance.                     |
| Gateways                      | Failover, budgets, logging, breadth, experiments                             | Legal clearance, universal feature parity   | Low provider-switch friction, medium vendor-of-vendor risk. |

## Adapter test requirements

1. Same conversation produces provider-neutral message trace.
2. Tool call schema round-trips into normalized representation.
3. Structured output validates at adapter boundary.
4. Cache observations are recorded per provider.
5. BYOK route never stores provider key server-side unless explicit proxy consent exists.
6. Redaction removes prompt/output/API-key data before observability export.
7. Model deprecation test fails if route uses a preview/EOL alias without migration entry.

## Sources

- **S004 — Anthropic Prompt Caching** (Anthropic, 2026-05). https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching. Explicit cache_control, 5-minute/1-hour TTL, cache write/read multipliers, isolation; web.run ref turn648069view0.
- **S005 — Anthropic API pricing** (Anthropic, 2026-05). https://platform.claude.com/docs/en/about-claude/pricing. Model pricing, cache multipliers, batch discount; web.run refs turn648069view1/turn401711search5.
- **S006 — Anthropic Commercial Terms of Service** (Anthropic, 2026-05). https://www.anthropic.com/legal/commercial-terms. Customer apps for own users, no resale except approved, pricing change notice; web.run ref turn938462view0.
- **S007 — OpenAI Prompt Caching guide** (OpenAI, 2026-05). https://platform.openai.com/docs/guides/prompt-caching. Automatic caching >=1024 tokens, prompt_cache_key, retention, cached token privacy; web.run refs turn133782view0/1.
- **S008 — OpenAI API pricing** (OpenAI, 2026-05). https://openai.com/api/pricing/. GPT-5.x pricing and cached input rates; web.run ref turn133782view2.
- **S009 — OpenAI Services Agreement** (OpenAI, 2026-05). https://openai.com/policies/services-agreement/. No resale/lease of account access; customer responsible for end users; web.run refs turn503554view2/turn133782view3.
- **S010 — Google Gemini API context caching** (Google, 2026-05). https://ai.google.dev/gemini-api/docs/caching. Context cache TTL, storage duration, billing, prefix semantics; web.run ref turn606457view0.
- **S011 — Google Gemini API pricing** (Google, 2026-05). https://ai.google.dev/gemini-api/docs/pricing. Gemini model pricing, cached token rates, storage per MTok-hour; web.run ref turn606457view1.
- **S012 — Google Gemini API Terms** (Google, 2026-05). https://ai.google.dev/terms. 30-day pricing change, agentic responsibility, grounding restrictions; web.run refs turn254275view2/0.
- **S019 — Vercel AI SDK 6** (Vercel, 2026-05). https://sdk.vercel.ai/docs. Provider-agnostic TS AI toolkit, 20M monthly downloads; web.run refs turn569811search16/0/22.
- **S020 — Vercel AI Gateway** (Vercel, 2026-05). https://vercel.com/docs/ai-gateway. Unified API, budgets, monitoring, routing/fallbacks, BYOK; web.run refs turn569811search12/26/8.
- **S021 — LiteLLM Router/Fallbacks** (BerriAI, 2026-05). https://docs.litellm.ai/docs/routing. Budget routing, fallbacks, Redis for production limits; web.run refs turn569811search1/5/27.
- **S022 — Portkey Gateway** (Portkey, 2026-05). https://portkey.ai/docs. Fallbacks, load balancing, retries, caching; web.run refs turn569811search2/14/17.
- **S023 — OpenRouter Docs and Terms** (OpenRouter, 2026-05). https://openrouter.ai/docs. Provider sticky caching, BYOK fee, model terms, no competing resale; web.run refs turn569811search3/7/25 and turn986870view0.
- **S040 — DeepSeek API pricing and caching** (DeepSeek, 2026-05). https://api-docs.deepseek.com/quick_start/pricing. Cache-hit discounts, model deprecation warning, default context caching; web.run refs turn843348search1/5/26.
- **S041 — Mistral AI prompt caching** (Mistral, 2026-05). https://docs.mistral.ai/capabilities/prefix/. Prompt prefix cache tokens billed at 10% standard input; web.run ref turn843348search4.
- **S042 — xAI prompt caching and pricing** (xAI, 2026-05). https://docs.x.ai/docs/guides/prompt-caching. Automatic caching and reduced cached prompt token price; web.run refs turn843348search2/6/16.
