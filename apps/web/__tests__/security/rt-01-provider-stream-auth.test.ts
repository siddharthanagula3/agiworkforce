import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const upstreamFetch = vi.fn();
vi.stubGlobal('fetch', upstreamFetch);

import { POST } from '@/app/api/v1/providers/[providerId]/stream/route';

describe('RT-01: retired provider stream proxy', () => {
  it('cannot proxy unauthenticated or attacker-controlled input upstream', async () => {
    const response = POST();

    expect(response.status).toBe(410);
    expect(upstreamFetch).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: 'This duplicate managed execution endpoint has been retired.',
      code: 'CANONICAL_COMPLETION_REQUIRED',
      completion_url: '/api/llm/v1/chat/completions',
    });
  });
});
