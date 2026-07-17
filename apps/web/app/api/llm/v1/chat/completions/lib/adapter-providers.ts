import 'server-only';

import {
  buildAnthropicAdapter,
  buildGoogleAdapter,
  buildOpenAIAdapter,
  buildGroqAdapter,
  buildMistralAdapter,
  buildMoonshotAdapter,
  buildZhipuAdapter,
  buildQwenAdapter,
  buildOpenRouterAdapter,
  buildDeepSeekAdapter,
  buildXAIAdapter,
  buildPerplexityAdapter,
} from './adapter-factory';
import {
  buildAnthropicChatRequest,
  buildGoogleChatRequest,
  buildOpenAIChatRequest,
  toCanonicalChatRequest,
} from './canonical-request';
import {
  toUpstreamError,
  toGoogleUpstreamError,
  toOpenAIUpstreamError,
  toGroqUpstreamError,
  toMistralUpstreamError,
  toMoonshotUpstreamError,
  toZhipuUpstreamError,
  toQwenUpstreamError,
  toOpenRouterUpstreamError,
  toDeepSeekUpstreamError,
  toXAIUpstreamError,
  toPerplexityUpstreamError,
} from './adapter-errors';
import type { ChatRequest, ProviderAdapter, StreamChunk } from '@agiworkforce/types';
import type { ProcessedRequest } from './request-processor';

/**
 * One entry per provider wired onto the `packages/ai/providers/*` adapter path.
 * Keeps the streaming/non-streaming branches in route.ts identical in shape
 * for every adapter-backed provider instead of duplicating a provider-
 * specific try/catch block per provider (Anthropic's was hand-duplicated for
 * Google when this table didn't exist yet -- pulled out here so a third
 * provider is one entry, not another duplicated block).
 *
 * Moved out of route.ts (restructure Wave 2, task #34's tool-loop slice):
 * Next.js route handler files may only export the reserved route-segment
 * symbols (GET/POST/OPTIONS/config exports), so a second consumer --
 * tool-loop-anthropic.ts's generalized, table-driven per-step dispatch --
 * could not import this table while it lived in route.ts. A lib-sibling
 * (alongside adapter-factory.ts/canonical-request.ts/adapter-errors.ts,
 * which this table already composes) is the established home for exactly
 * this kind of cross-consumer reuse; route.ts now imports it from here too,
 * so there is exactly one table, not a second copy that can drift.
 *
 * `wireMode` (task #34's OpenAI slice): Anthropic/Google's legacy providers
 * reshape their vendor's native wire into an OpenAI-like shape, so
 * `OpenAIWireAssembler`'s `wireMode: 'legacy-web'` -- reverse-engineered from
 * that hand-built shape -- reproduces both. OpenAI's legacy provider does no
 * such reshaping (near-verbatim real upstream SSE passthrough, confirmed via
 * stream-transform.openai-byte-parity.test.ts), so it needs the DIFFERENT
 * `'openai-passthrough'` mode (team-lead RULING: Option B, preserve
 * fidelity). The 9 openai-compat providers join OpenAI on the same
 * `'openai-passthrough'` mode: each `packages/ai/providers/{provider}` package
 * is a thin config wrapper around the SAME `@agiworkforce/providers-openai`
 * translate/stream layer (see adapter-factory.ts's `buildCompatAdapter`
 * docstring), and none of their legacy files reshape their vendor's own
 * near-OpenAI-shaped wire any more than `openai.ts` does (confirmed by
 * reading each legacy provider file directly). None of the 9 need a
 * `buildChatRequest` wrapper either -- none set `effort`/`reasoning_effort`
 * or `thinking` in any form (grepped every legacy compat file), so the base
 * `toCanonicalChatRequest` (no thinking/effort folded in) already reproduces
 * their exact request shape.
 */
export const ADAPTER_PROVIDERS: Record<
  string,
  {
    buildAdapter: (processed: ProcessedRequest) => ProviderAdapter;
    buildChatRequest: (processed: ProcessedRequest) => ChatRequest;
    mapError: (chunk: Extract<StreamChunk, { type: 'error' }>) => Error;
    wireMode: 'legacy-web' | 'openai-passthrough';
  }
> = {
  anthropic: {
    buildAdapter: buildAnthropicAdapter,
    buildChatRequest: buildAnthropicChatRequest,
    mapError: toUpstreamError,
    wireMode: 'legacy-web',
  },
  google: {
    buildAdapter: buildGoogleAdapter,
    buildChatRequest: buildGoogleChatRequest,
    mapError: toGoogleUpstreamError,
    wireMode: 'legacy-web',
  },
  openai: {
    buildAdapter: buildOpenAIAdapter,
    buildChatRequest: buildOpenAIChatRequest,
    mapError: toOpenAIUpstreamError,
    wireMode: 'openai-passthrough',
  },
  groq: {
    buildAdapter: buildGroqAdapter,
    buildChatRequest: toCanonicalChatRequest,
    mapError: toGroqUpstreamError,
    wireMode: 'openai-passthrough',
  },
  mistral: {
    buildAdapter: buildMistralAdapter,
    buildChatRequest: toCanonicalChatRequest,
    mapError: toMistralUpstreamError,
    wireMode: 'openai-passthrough',
  },
  moonshot: {
    buildAdapter: buildMoonshotAdapter,
    buildChatRequest: toCanonicalChatRequest,
    mapError: toMoonshotUpstreamError,
    wireMode: 'openai-passthrough',
  },
  zhipu: {
    buildAdapter: buildZhipuAdapter,
    buildChatRequest: toCanonicalChatRequest,
    mapError: toZhipuUpstreamError,
    wireMode: 'openai-passthrough',
  },
  qwen: {
    buildAdapter: buildQwenAdapter,
    buildChatRequest: toCanonicalChatRequest,
    mapError: toQwenUpstreamError,
    wireMode: 'openai-passthrough',
  },
  openrouter: {
    buildAdapter: buildOpenRouterAdapter,
    buildChatRequest: toCanonicalChatRequest,
    mapError: toOpenRouterUpstreamError,
    wireMode: 'openai-passthrough',
  },
  deepseek: {
    buildAdapter: buildDeepSeekAdapter,
    buildChatRequest: toCanonicalChatRequest,
    mapError: toDeepSeekUpstreamError,
    wireMode: 'openai-passthrough',
  },
  xai: {
    buildAdapter: buildXAIAdapter,
    buildChatRequest: toCanonicalChatRequest,
    mapError: toXAIUpstreamError,
    wireMode: 'openai-passthrough',
  },
  perplexity: {
    buildAdapter: buildPerplexityAdapter,
    buildChatRequest: toCanonicalChatRequest,
    mapError: toPerplexityUpstreamError,
    wireMode: 'openai-passthrough',
  },
};
