import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { POST } from '@/app/api/v1/providers/[providerId]/stream/route';

describe('POST /api/v1/providers/[providerId]/stream', () => {
  it('retires duplicate execution in favor of the canonical managed completion route', async () => {
    const response = POST();

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      error: 'This duplicate managed execution endpoint has been retired.',
      code: 'CANONICAL_COMPLETION_REQUIRED',
      completion_url: '/api/llm/v1/chat/completions',
    });
  });
});
