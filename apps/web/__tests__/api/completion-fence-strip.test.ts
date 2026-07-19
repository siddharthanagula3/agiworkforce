import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/completion/route';

describe('POST /api/completion retirement contract', () => {
  it('returns a stable 410 without authenticating, spending credits, or calling a provider', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/completion', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: 'hidden per-keystroke request' }),
      }),
    );

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'prompt_completion_retired',
        message: 'Prompt autocomplete is not available.',
      },
    });
  });
});
