import OpenAI from 'openai';
import {
  ALLOWED_MANAGED_PROVIDER_HOSTS,
  resolveValidatedBaseUrl,
} from '@agiworkforce/provider-runtime';
import { VERCEL_GATEWAY_DEFAULT_BASE_URL } from './endpoint';

export interface VercelGatewayEmbeddingsConfig {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export interface VercelGatewayEmbeddingRequest {
  model: string;
  input: readonly string[];
  dimensions?: number;
  signal?: AbortSignal;
}

export interface VercelGatewayEmbeddingResult {
  vectors: number[][];
  promptTokens: number | null;
}

export class VercelGatewayEmbeddingError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'VercelGatewayEmbeddingError';
  }
}

export function createVercelGatewayEmbeddings(config: VercelGatewayEmbeddingsConfig) {
  const { url: baseUrl } = resolveValidatedBaseUrl(
    config.baseUrl,
    VERCEL_GATEWAY_DEFAULT_BASE_URL,
    {
      allowedHosts: new Set(ALLOWED_MANAGED_PROVIDER_HOSTS),
    },
  );
  const sdk = new OpenAI({
    apiKey: config.apiKey,
    baseURL: baseUrl,
    ...(config.fetch ? { fetch: config.fetch } : {}),
  });

  return {
    async embed(request: VercelGatewayEmbeddingRequest): Promise<VercelGatewayEmbeddingResult> {
      let response: Awaited<ReturnType<typeof sdk.embeddings.create>>;
      try {
        response = await sdk.embeddings.create(
          {
            model: request.model,
            input: [...request.input],
            encoding_format: 'float',
            ...(request.dimensions !== undefined ? { dimensions: request.dimensions } : {}),
          },
          request.signal ? { signal: request.signal } : undefined,
        );
      } catch (error) {
        const status =
          error instanceof OpenAI.APIError && typeof error.status === 'number'
            ? error.status
            : null;
        throw new VercelGatewayEmbeddingError(
          error instanceof Error ? error.message : 'Embedding request failed',
          status,
        );
      }

      const vectors = [...response.data]
        .sort((left, right) => left.index - right.index)
        .map((entry) => entry.embedding as number[]);
      if (
        vectors.length !== request.input.length ||
        vectors.some(
          (vector) =>
            vector.length === 0 ||
            (request.dimensions !== undefined && vector.length !== request.dimensions),
        )
      ) {
        throw new VercelGatewayEmbeddingError(
          'The gateway returned an incomplete embedding set',
          null,
        );
      }
      const promptTokens = response.usage?.prompt_tokens;
      return {
        vectors,
        promptTokens: typeof promptTokens === 'number' ? promptTokens : null,
      };
    },
  };
}
