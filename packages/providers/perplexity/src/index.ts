/**
 * @agiworkforce/providers-perplexity
 *
 * Perplexity (Sonar) provider adapter implementing `ProviderAdapter` from
 * `@agiworkforce/types`. Perplexity ships an OpenAI-compatible Chat Completions
 * endpoint at `https://api.perplexity.ai`. Sonar models are search-augmented:
 * the response includes a `citations` array of source URLs (or richer
 * `search_results`) appended to the final stream chunk.
 *
 * Stream extension: any non-empty `citations` array on a final chunk is
 * surfaced as a synthetic trailing `text-delta` block formatted as a
 * markdown-link list, so existing chat UIs render sources without needing
 * to learn a new shape. A future revision can promote citations to a
 * dedicated `citations` chunk type once the chat layer adds first-class
 * source rendering.
 *
 * @packageDocumentation
 */

import OpenAI from 'openai';
import type {
  AuthMethod,
  ChatRequest,
  ModelInfo,
  ProviderAdapter,
  ProviderAdapterConfig,
  ProviderAdapterFactory,
  ProviderCatalogContext,
  StreamChunk,
} from '@agiworkforce/types';
import { detectOpenAICompletionsCompat } from '@agiworkforce/llm-normalize';
import {
  translateChatRequest,
  translateOpenAIStream,
  type OpenAIChatCompletionChunk,
} from '@agiworkforce/providers-openai';

import { PERPLEXITY_MODEL_CATALOG } from './catalog';

const PERPLEXITY_DEFAULT_BASE_URL = 'https://api.perplexity.ai';

const PERPLEXITY_AUTH_METHODS: readonly AuthMethod[] = [
  {
    kind: 'api-key',
    envVar: 'PERPLEXITY_API_KEY',
    required: true,
    label: 'Perplexity API Key',
  },
];

export interface PerplexityAdapterConfig extends ProviderAdapterConfig {
  /** Skip dynamic /models discovery — return only the curated catalog. */
  skipDiscovery?: boolean;
  /**
   * When true, append a markdown-formatted "Sources:" section to the assistant
   * text whenever the response includes citations. Default true.
   */
  includeCitations?: boolean;
}

interface PerplexityChunk extends OpenAIChatCompletionChunk {
  citations?: string[];
  search_results?: Array<{ title?: string; url: string }>;
}

function formatCitations(chunk: PerplexityChunk): string | null {
  const lines: string[] = [];
  if (Array.isArray(chunk.search_results) && chunk.search_results.length > 0) {
    chunk.search_results.forEach((sr, i) => {
      const title = sr.title?.trim();
      lines.push(`${i + 1}. ${title ? `[${title}](${sr.url})` : sr.url}`);
    });
  } else if (Array.isArray(chunk.citations) && chunk.citations.length > 0) {
    chunk.citations.forEach((url, i) => {
      lines.push(`${i + 1}. ${url}`);
    });
  }
  return lines.length > 0 ? `\n\n**Sources:**\n${lines.join('\n')}` : null;
}

async function* withCitationFooter(
  chunks: AsyncIterable<PerplexityChunk>,
  enabled: boolean,
): AsyncIterable<OpenAIChatCompletionChunk> {
  let citationFooter: string | null = null;
  for await (const chunk of chunks) {
    if (enabled) {
      const formatted = formatCitations(chunk);
      if (formatted) citationFooter = formatted;
    }
    const finishReason = chunk.choices?.[0]?.finish_reason;
    if (finishReason && citationFooter) {
      // Emit a synthetic text-delta chunk before the finish-bearing chunk so
      // translateOpenAIStream renders the footer as part of the assistant
      // message, then forward the original.
      yield {
        ...chunk,
        choices: [
          {
            ...chunk.choices[0]!,
            finish_reason: null,
            delta: { content: citationFooter },
          },
        ],
      } as OpenAIChatCompletionChunk;
      citationFooter = null;
    }
    yield chunk;
  }
}

export function createPerplexityAdapter(config: PerplexityAdapterConfig = {}): ProviderAdapter {
  const sdk = new OpenAI({
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    baseURL: config.baseUrl ?? PERPLEXITY_DEFAULT_BASE_URL,
    ...(config.fetch ? { fetch: config.fetch } : {}),
  });
  const includeCitations = config.includeCitations ?? true;

  return {
    id: 'perplexity',
    label: 'Perplexity',
    auth: PERPLEXITY_AUTH_METHODS,
    config,

    async catalog(_ctx?: ProviderCatalogContext): Promise<ModelInfo[]> {
      // Perplexity does not expose /models — always return the curated catalog.
      void _ctx;
      return [...PERPLEXITY_MODEL_CATALOG];
    },

    async *stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<StreamChunk> {
      const detected = detectOpenAICompletionsCompat({
        provider: 'perplexity',
        baseUrl: config.baseUrl ?? PERPLEXITY_DEFAULT_BASE_URL,
        id: req.model,
      });

      const params = translateChatRequest(req, {
        compat: detected.defaults,
        provider: 'perplexity',
      });

      try {
        const sdkStream = await sdk.chat.completions.create(
          params as unknown as Parameters<typeof sdk.chat.completions.create>[0],
          { signal },
        );
        const decorated = withCitationFooter(
          sdkStream as unknown as AsyncIterable<PerplexityChunk>,
          includeCitations,
        );
        for await (const chunk of translateOpenAIStream(decorated)) {
          yield chunk;
        }
      } catch (err) {
        const error = err as Error & { status?: number };
        const retryable =
          typeof error.status === 'number' && (error.status === 429 || error.status >= 500);
        yield {
          type: 'error',
          message: error.message ?? 'Perplexity request failed',
          ...(typeof error.status === 'number' ? { code: String(error.status) } : {}),
          retryable,
        };
        yield { type: 'stop', reason: 'error' };
      }
    },
  };
}

export const perplexityAdapterFactory: ProviderAdapterFactory = (config) =>
  createPerplexityAdapter(config as PerplexityAdapterConfig);

export { PERPLEXITY_MODEL_CATALOG } from './catalog';
