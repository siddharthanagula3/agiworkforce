# @agiworkforce/llm-normalize

Cross-provider LLM payload normalization helpers.

This package encodes production-tested knowledge about per-vendor / per-endpoint
quirks so that one chat thread can hop providers without payload edge cases:

- **OpenAI Responses API policy** — decides `service_tier`, `store`,
  `prompt_cache_key` stripping, server-compaction enablement, and disabled-
  reasoning stripping based on a hostname-classified endpoint and the model's
  `compat` flags. Covers `api.openai.com`, Azure OpenAI, Codex, OpenRouter,
  and ~15 OpenAI-compatible proxies.
- **OpenAI reasoning-effort resolution** — knows which efforts each GPT-5.x /
  Codex variant supports and how to fall back when a requested effort isn't.
- **System-prompt cache boundary** — splits a system prompt into a stable
  prefix and a dynamic suffix so providers with prompt caching (Anthropic,
  Vertex Anthropic) get max cache hits.

All exports are pure functions. No IO, no provider SDKs, no runtime context.
Drop them in at the request-build boundary inside any `ProviderAdapter`.

## Provenance

Ported from [OpenClaw](https://github.com/openclaw/openclaw) (MIT, Peter
Steinberger), specifically `src/agents/{openai-responses-payload-policy,
openai-reasoning-effort, system-prompt-cache-boundary, prompt-cache-stability,
shared/string-coerce}.ts`. See [THIRD_PARTY_LICENSES.md](../../THIRD_PARTY_LICENSES.md)
at repo root.

## Usage

```ts
import {
  resolveOpenAIResponsesPayloadPolicy,
  applyOpenAIResponsesPayloadPolicy,
} from '@agiworkforce/llm-normalize';

const policy = resolveOpenAIResponsesPayloadPolicy(
  {
    provider: 'openai',
    api: 'openai-responses',
    baseUrl: 'https://api.openai.com/v1',
    id: 'gpt-5',
    contextWindow: 200_000,
  },
  { storeMode: 'provider-policy', enablePromptCacheStripping: true, enableServerCompaction: true },
);

const payloadObj: Record<string, unknown> = {
  /* your built request */
};
applyOpenAIResponsesPayloadPolicy(payloadObj, policy);
// payloadObj is now safe to send to api.openai.com
```

## What's NOT here yet (deferred to Sprint 2)

- `provider-attribution.ts` (806 LOC, requires plugin-manifest decoupling)
- `anthropic-payload-policy.ts` (depends on provider-attribution)
- `openai-completions-compat.ts` (depends on provider-attribution + pi-ai Model type)
- `anthropic-family-tool-payload-compat.ts` (StreamFn wrapper, depends on pi-ai)
- `openai-tool-schema.ts` (JSON Schema strict-mode normalizer; deps on
  TypeBox + Gemini-cleanup helper)

These are all real production helpers and will land alongside the
`ProviderAdapter` interface in Sprint 2.
