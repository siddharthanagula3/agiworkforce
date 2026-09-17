import 'server-only';

import { logger } from '@/lib/logger';
import { providerApiUrl } from '@/lib/server/provider-endpoints';

interface GoogleEmbeddingResponse {
  embeddings?: Array<{ values?: number[] }>;
}

export class GoogleEmbeddingError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'GoogleEmbeddingError';
  }
}

export async function embedTextsWithGoogle(input: {
  apiKey: string;
  providerModelId: string;
  inputs: readonly string[];
  dimensions?: number;
}): Promise<number[][]> {
  const response = await fetch(
    providerApiUrl('google', `models/${input.providerModelId}:batchEmbedContents`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': input.apiKey },
      body: JSON.stringify({
        requests: input.inputs.map((text) => ({
          model: `models/${input.providerModelId}`,
          content: { parts: [{ text }] },
          ...(input.dimensions !== undefined ? { outputDimensionality: input.dimensions } : {}),
        })),
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    logger.error(
      { status: response.status, body: body.slice(0, 500), model: input.providerModelId },
      'Embedding provider call failed',
    );
    throw new GoogleEmbeddingError('The embedding provider rejected the request.', response.status);
  }

  const payload = (await response.json()) as GoogleEmbeddingResponse;
  const vectors = payload.embeddings?.map((entry) => entry.values ?? []) ?? [];
  if (
    vectors.length !== input.inputs.length ||
    vectors.some(
      (vector) =>
        vector.length === 0 ||
        (input.dimensions !== undefined && vector.length !== input.dimensions),
    )
  ) {
    throw new GoogleEmbeddingError(
      'The embedding provider returned an incomplete result set.',
      null,
    );
  }
  return vectors;
}
