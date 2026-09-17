import { describe, expect, it } from 'vitest';

import { createVercelGatewayEmbeddings, VercelGatewayEmbeddingError } from '../index';

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createVercelGatewayEmbeddings', () => {
  it('posts to the gateway embeddings endpoint with the requested dimensions', async () => {
    let seenUrl = '';
    let seenBody: Record<string, unknown> = {};
    const client = createVercelGatewayEmbeddings({
      apiKey: 'test-key',
      fetch: async (input, init) => {
        seenUrl = String(input);
        seenBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return respond({
          object: 'list',
          model: 'vendor/embed',
          data: [
            { object: 'embedding', index: 1, embedding: [0, 1] },
            { object: 'embedding', index: 0, embedding: [1, 0] },
          ],
          usage: { prompt_tokens: 7, total_tokens: 7 },
        });
      },
    });

    const result = await client.embed({ model: 'vendor/embed', input: ['a', 'b'], dimensions: 2 });

    expect(seenUrl).toBe('https://ai-gateway.vercel.sh/v1/embeddings');
    expect(seenBody).toMatchObject({ model: 'vendor/embed', input: ['a', 'b'], dimensions: 2 });
    expect(result.vectors).toEqual([
      [1, 0],
      [0, 1],
    ]);
    expect(result.promptTokens).toBe(7);
  });

  it('refuses a result whose width differs from the requested dimensions', async () => {
    const client = createVercelGatewayEmbeddings({
      apiKey: 'test-key',
      fetch: async () =>
        respond({
          object: 'list',
          model: 'vendor/embed',
          data: [{ object: 'embedding', index: 0, embedding: [1, 0, 0] }],
          usage: { prompt_tokens: 1, total_tokens: 1 },
        }),
    });

    await expect(
      client.embed({ model: 'vendor/embed', input: ['a'], dimensions: 2 }),
    ).rejects.toBeInstanceOf(VercelGatewayEmbeddingError);
  });

  it('carries the upstream status when the gateway refuses', async () => {
    const client = createVercelGatewayEmbeddings({
      apiKey: 'test-key',
      fetch: async () => respond({ error: { message: 'no credits' } }, 403),
    });

    await expect(client.embed({ model: 'vendor/embed', input: ['a'] })).rejects.toMatchObject({
      status: 403,
    });
  });
});
