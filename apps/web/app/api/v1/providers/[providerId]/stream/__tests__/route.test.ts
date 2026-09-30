import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { POST, dynamic, runtime } from '../route';

describe('POST /api/v1/providers/[providerId]/stream', () => {
  it('is retired and points callers at the canonical completion endpoint', async () => {
    const response = POST();

    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({
      error: 'This duplicate managed execution endpoint has been retired.',
      code: 'CANONICAL_COMPLETION_REQUIRED',
      completion_url: '/api/llm/v1/chat/completions',
    });
  });

  it('never runs statically or on the edge', () => {
    expect(dynamic).toBe('force-dynamic');
    expect(runtime).toBe('nodejs');
  });
});
