import { describe, expect, it, vi } from 'vitest';

import { fetchOllamaCatalog } from '../catalog';

describe('fetchOllamaCatalog', () => {
  it('reports discovered identity without inventing unavailable capability facts', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            models: [
              {
                name: 'custom-model:latest',
                model: 'custom-model:latest',
                modified_at: '2026-07-14T00:00:00Z',
                size: 1,
                digest: 'sha256:test',
                details: {
                  family: 'qwen3',
                  parameter_size: '9B',
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );

    const models = await fetchOllamaCatalog({ fetch });

    expect(models).toEqual([
      {
        id: 'custom-model:latest',
        name: 'custom-model:latest',
        provider: 'ollama',
        sizeBillion: 9,
      },
    ]);
  });
});
