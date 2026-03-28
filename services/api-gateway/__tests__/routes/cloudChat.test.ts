import { describe, expect, it } from 'vitest';
import { buildGoogleStreamRequest } from '../../src/routes/cloudChat';

describe('cloudChat Google upstream requests', () => {
  it('keeps the API key out of the query string', async () => {
    const request = buildGoogleStreamRequest(
      'gemini-2.5-pro',
      {
        contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
      },
      'secret-google-key',
    );

    expect(request.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:streamGenerateContent?alt=sse',
    );
    expect(request.url).not.toContain('secret-google-key');
    expect(request.init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-goog-api-key': 'secret-google-key',
    });
  });
});
