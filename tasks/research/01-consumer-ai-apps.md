# 01 — Consumer AI apps: May 2026 competitive first pass

**Recommendation:** AGI should not position itself as “another chatbot.” The defensible launch wedge is **privacy-first work AI across mobile/web/desktop with local mode + BYOK + controlled managed-cloud routing**.

## Why

- The largest consumer assistants already own generic chat, voice, multimodal exploration, brand trust, and app-store discoverability.
- The paid-user pressure point is cost control: consumer apps are moving away from implicit unlimited compute as agents and long contexts consume more resources.
- A solo-founder product needs a sharper wedge than “better answer quality.” Privacy, local execution, BYOK, model choice, and cross-surface state are clearer differentiators.
- App-store copy should claim only what the app can prove on the user’s device: local mode availability, BYOK, no-cloud default, export/delete controls, and transparent provider routing.

## Competitive matrix

| App        | Vendor       | Surfaces                    | Primary positioning                                                                         | Evidence        | Implication for AGI                                                                                        |
| ---------- | ------------ | --------------------------- | ------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------- |
| ChatGPT    | OpenAI       | Web/iOS/Android             | Everyday assistant; voice/multimodal; default category benchmark                            | S047            | AGI should not compete on generic assistant alone; differentiate on local/BYOK/cross-surface work.         |
| Claude     | Anthropic    | Web/iOS/Android/Desktop     | Long-form writing/coding/reasoning; paid tiers/API                                          | S005,S006       | Useful comparator for agent/tool limits and subscription economics.                                        |
| Gemini     | Google       | Web/iOS/Android             | Google-native assistant and model family; mobile listing emphasizes access to Gemini models | S046,S048       | Google ecosystem integration is the main moat; AGI should avoid Google-suite clone positioning.            |
| Perplexity | Perplexity   | Web/iOS/Android             | Answer engine with citations/sources and multiple model access                              | S045            | AGI should use source/citation UX only where retrieval is a core path; do not promise universal web truth. |
| Copilot    | Microsoft    | Web/iOS/Android/Windows     | Productivity assistant integrated into Microsoft ecosystem                                  | needs_full_pass | Enterprise ecosystem position; verify latest pricing/listing in full run.                                  |
| Grok       | xAI          | Web/iOS/Android/X ecosystem | AI assistant tied to X/xAI model family                                                     | S042            | Consumer distribution through X; API cache mechanics relevant but app teardown needs full pass.            |
| DeepSeek   | DeepSeek     | Web/mobile/API              | Low-cost model/API narrative; docs include cache/deprecation signals                        | S040            | Useful price-pressure comparator; model-alias stability must be monitored.                                 |
| Kimi       | Moonshot     | Web/mobile/API              | Long-context Chinese/global AI assistant candidate                                          | needs_full_pass | Needs official plan/app listing verification in final pass.                                                |
| Z.ai / GLM | Zhipu/Z.ai   | Web/API                     | China-origin model/app competitor                                                           | needs_full_pass | Needs regional/compliance verification.                                                                    |
| Cursor     | Anysphere    | Desktop/web                 | Coding-agent workflow benchmark                                                             | needs_full_pass | Best studied as workflow/agent competitor, not generic consumer app.                                       |
| Manus      | Monica/Manus | Web                         | Agentic task-completion benchmark                                                           | needs_full_pass | Needs current public availability and pricing verification.                                                |
| Poe        | Quora        | Web/iOS/Android             | Multi-model consumer app with bot marketplace                                               | needs_full_pass | Useful for multi-provider UX, credits and bot ecosystem comparison.                                        |

## Tear-down notes

### ChatGPT

ChatGPT remains the default consumer mental model for AI chat. Competing head-on means matching a global brand, heavy model spend, voice/multimodal UX, and frequent feature releases. AGI should instead make ChatGPT look over-centralized: the user owns keys, controls routing, can use local models, and can keep work artifacts portable.

### Claude

Claude is the strongest writing/coding/reasoning subscription comparator. The key lesson is not only model quality; it is that subscriptions are bounded by compute economics. AGI should avoid “unlimited Pro” promises and should expose honest usage budgets where managed cloud is included.

### Gemini

Gemini is important because Google controls both the model family and Android on-device runtime path. AGI should integrate with Gemini Nano/AICore where available rather than trying to beat it with a universal GGUF path on every Android phone.

### Perplexity

Perplexity’s source-backed answer engine makes citations and retrieval feel normal to consumers. AGI can borrow source transparency but should not make web search the main wedge unless it ships strong retrieval accuracy and publisher/source UX.

### Copilot

Copilot’s moat is distribution through Microsoft. AGI should not try to replace Office-integrated workflows at launch. It can compete where users want vendor independence, local privacy, and custom provider routing.

### Grok

Grok/xAI matters for API/provider optionality and social distribution. AGI should include xAI in the provider matrix only if terms, safety, and cache semantics are explicit enough for managed routing.

### DeepSeek

DeepSeek creates pricing pressure and highlights model-alias/deprecation risk. Low prices can change quickly; AGI should treat low-cost providers as route options, not as the pricing backbone.

### Kimi, Z.ai, Manus, Poe, Cursor

These need a deeper full pass with official pricing/listing snapshots. Their relevance is less “chatbot alternative” and more long-context, agentic task completion, multi-model routing, and coding-agent UX.

## ASO implications

Use keywords around **private AI**, **local AI**, **offline AI**, **BYOK**, **bring your own key**, **multi-model**, **AI workspace**, and **work assistant**. Avoid broad “AI chatbot” as the only target. Screenshots should show: model chooser, local/cloud toggle, BYOK setup, privacy controls, and cross-device work surface.

## Sources

- **S045 — Perplexity App Store/Play descriptions** (Perplexity, 2026-05). https://apps.apple.com/us/app/perplexity-ai-search-chat/id1668000334. Answer engine with sources/citations and model access; web.run refs turn401711search7/10.
- **S046 — Google Gemini app listing** (Google, 2026-05). https://play.google.com/store/apps/details?id=com.google.android.apps.bard. Gemini AI assistant mobile app; web.run ref turn401711search13.
- **S047 — ChatGPT app/site** (OpenAI, 2026-05). https://chatgpt.com/. ChatGPT public AI assistant; web.run ref turn401711search0.
- **S005 — Anthropic API pricing** (Anthropic, 2026-05). https://platform.claude.com/docs/en/about-claude/pricing. Model pricing, cache multipliers, batch discount; web.run refs turn648069view1/turn401711search5.
- **S006 — Anthropic Commercial Terms of Service** (Anthropic, 2026-05). https://www.anthropic.com/legal/commercial-terms. Customer apps for own users, no resale except approved, pricing change notice; web.run ref turn938462view0.
- **S040 — DeepSeek API pricing and caching** (DeepSeek, 2026-05). https://api-docs.deepseek.com/quick_start/pricing. Cache-hit discounts, model deprecation warning, default context caching; web.run refs turn843348search1/5/26.
- **S042 — xAI prompt caching and pricing** (xAI, 2026-05). https://docs.x.ai/docs/guides/prompt-caching. Automatic caching and reduced cached prompt token price; web.run refs turn843348search2/6/16.
- **S048 — Google Gemini / DeepMind model page** (Google DeepMind, 2026-05). https://deepmind.google/models/gemini/. Gemini 3 model family/current marketing page; web.run ref turn401711search6.
- **S019 — Vercel AI SDK 6** (Vercel, 2026-05). https://sdk.vercel.ai/docs. Provider-agnostic TS AI toolkit, 20M monthly downloads; web.run refs turn569811search16/0/22.
- **S020 — Vercel AI Gateway** (Vercel, 2026-05). https://vercel.com/docs/ai-gateway. Unified API, budgets, monitoring, routing/fallbacks, BYOK; web.run refs turn569811search12/26/8.
