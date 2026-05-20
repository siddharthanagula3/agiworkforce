# 08 — API pricing history, deprecation, lock-in mitigation first pass

**Recommendation:** design as if every provider can change price, remove a model, or alter cache behavior within a short notice window. AGI should maintain an explicit price/deprecation registry and never tie a paid tier to one provider’s current cheap model.

## Why

- Anthropic and Google terms include pricing-change mechanics around posted/notice windows.
- OpenRouter can add/remove models and changes fees with advance notice; provider model terms still apply.
- DeepSeek docs include model-alias deprecation warnings, demonstrating that alias stability is not guaranteed.
- Caching can mask input cost but not output cost; agent loops can erase margin quickly.

## Pricing-change risk table

| Vendor/layer  | Observed official risk                                                                                   | AGI mitigation                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Anthropic     | Published rates can update after notice/posting; cache writes/hits have provider-specific multipliers    | Cache adapter, price watch, route-level budget.                         |
| OpenAI        | Cached input prices differ by model; automatic caching threshold/retention is provider-controlled        | Track cached token usage; avoid relying on cache for guaranteed margin. |
| Google Gemini | Context caching includes storage token-hour charges; paid pricing changes effective after posting window | TTL budget, cache garbage collection, model substitution.               |
| DeepSeek      | Model aliases marked for future deprecation; cache-hit discounts can change                              | Pin explicit model IDs; deprecation register.                           |
| Mistral/xAI   | Caching behavior exists but details differ                                                               | Adapter-specific observation fields.                                    |
| OpenRouter    | Model availability and terms flow through underlying providers                                           | Direct-provider fallback for top routes.                                |

## Abstraction comparison

| Strategy                      | Pricing-change mitigation       | Feature parity                     | Legal/TOS mitigation               | Operational cost                    |
| ----------------------------- | ------------------------------- | ---------------------------------- | ---------------------------------- | ----------------------------------- |
| Raw SDK only                  | Low                             | Highest                            | Low                                | Medium developer burden.            |
| Vercel AI SDK                 | Medium                          | Medium-high for supported features | Low                                | Low-medium.                         |
| `@agiworkforce/llm-normalize` | High app-level control          | High if adapters maintained        | Medium: can enforce terms by route | Medium-high maintenance.            |
| LiteLLM self-host             | Medium-high routing control     | Medium                             | Low-medium                         | Infra/security burden.              |
| OpenRouter                    | High model breadth              | Medium/provider-dependent          | Low: model terms still apply       | Low initial, aggregator dependency. |
| Portkey                       | Medium-high managed reliability | Medium                             | Low-medium                         | Subscription/vendor dependency.     |
| Vercel AI Gateway             | Medium in Vercel stack          | Medium                             | Low-medium                         | Convenient if already on Vercel.    |

## Required registry

```yaml
models:
  anthropic:claude-opus-4.7:
    status: stable
    input_per_mtok: 5.00
    output_per_mtok: 25.00
    cache_write_5m_multiplier: 1.25
    cache_read_multiplier: 0.10
    last_verified: 2026-05-17
  google:gemini-2.5-flash:
    status: stable
    cache_storage_cost: true
    ttl_guardrail_seconds: 300
  deepseek:deepseek-chat:
    status: alias-risk
    migration_required: true
```

## Pricing guardrails

1. Route-level maximum cost per request.
2. User-level monthly managed-cloud budget.
3. Provider-level daily cap.
4. Default output token cap by tier.
5. Cache hit-rate KPI and regression alerts.
6. Degrade from premium to mid-tier model before blocking, but tell the user.
7. BYOK escape hatch for power users.

## Sources

- **S004 — Anthropic Prompt Caching** (Anthropic, 2026-05). https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching. Explicit cache_control, 5-minute/1-hour TTL, cache write/read multipliers, isolation; web.run ref turn648069view0.
- **S005 — Anthropic API pricing** (Anthropic, 2026-05). https://platform.claude.com/docs/en/about-claude/pricing. Model pricing, cache multipliers, batch discount; web.run refs turn648069view1/turn401711search5.
- **S006 — Anthropic Commercial Terms of Service** (Anthropic, 2026-05). https://www.anthropic.com/legal/commercial-terms. Customer apps for own users, no resale except approved, pricing change notice; web.run ref turn938462view0.
- **S007 — OpenAI Prompt Caching guide** (OpenAI, 2026-05). https://platform.openai.com/docs/guides/prompt-caching. Automatic caching >=1024 tokens, prompt_cache_key, retention, cached token privacy; web.run refs turn133782view0/1.
- **S008 — OpenAI API pricing** (OpenAI, 2026-05). https://openai.com/api/pricing/. GPT-5.x pricing and cached input rates; web.run ref turn133782view2.
- **S010 — Google Gemini API context caching** (Google, 2026-05). https://ai.google.dev/gemini-api/docs/caching. Context cache TTL, storage duration, billing, prefix semantics; web.run ref turn606457view0.
- **S011 — Google Gemini API pricing** (Google, 2026-05). https://ai.google.dev/gemini-api/docs/pricing. Gemini model pricing, cached token rates, storage per MTok-hour; web.run ref turn606457view1.
- **S012 — Google Gemini API Terms** (Google, 2026-05). https://ai.google.dev/terms. 30-day pricing change, agentic responsibility, grounding restrictions; web.run refs turn254275view2/0.
- **S020 — Vercel AI Gateway** (Vercel, 2026-05). https://vercel.com/docs/ai-gateway. Unified API, budgets, monitoring, routing/fallbacks, BYOK; web.run refs turn569811search12/26/8.
- **S021 — LiteLLM Router/Fallbacks** (BerriAI, 2026-05). https://docs.litellm.ai/docs/routing. Budget routing, fallbacks, Redis for production limits; web.run refs turn569811search1/5/27.
- **S022 — Portkey Gateway** (Portkey, 2026-05). https://portkey.ai/docs. Fallbacks, load balancing, retries, caching; web.run refs turn569811search2/14/17.
- **S023 — OpenRouter Docs and Terms** (OpenRouter, 2026-05). https://openrouter.ai/docs. Provider sticky caching, BYOK fee, model terms, no competing resale; web.run refs turn569811search3/7/25 and turn986870view0.
- **S040 — DeepSeek API pricing and caching** (DeepSeek, 2026-05). https://api-docs.deepseek.com/quick_start/pricing. Cache-hit discounts, model deprecation warning, default context caching; web.run refs turn843348search1/5/26.
- **S041 — Mistral AI prompt caching** (Mistral, 2026-05). https://docs.mistral.ai/capabilities/prefix/. Prompt prefix cache tokens billed at 10% standard input; web.run ref turn843348search4.
- **S042 — xAI prompt caching and pricing** (xAI, 2026-05). https://docs.x.ai/docs/guides/prompt-caching. Automatic caching and reduced cached prompt token price; web.run refs turn843348search2/6/16.
