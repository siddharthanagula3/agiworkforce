import { describe, expect, it } from 'vitest';

import { handleError, withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { WORKSPACE_POLICY_UNAVAILABLE_DECISION } from '@/lib/services/organization-policy-evaluator';

async function bodyOf(response: Response) {
  return (await response.json()) as { error: { code: string; message: string } };
}

describe('handleError message exposure', () => {
  it('replaces an unmarked 503 message with generic text', async () => {
    const response = handleError(
      createError.serviceUnavailable('Failed to connect to MCP server: ECONNREFUSED 10.0.0.4'),
    );
    expect(response.status).toBe(503);
    expect((await bodyOf(response)).error.message).toBe('Service temporarily unavailable');
  });

  it('delivers a 503 message marked user-safe', async () => {
    const reason = WORKSPACE_POLICY_UNAVAILABLE_DECISION.reason;
    const response = handleError(createError.serviceUnavailable(reason).asUserSafe());
    expect(response.status).toBe(503);
    expect((await bodyOf(response)).error.message).toBe(reason);
  });

  it('never exposes a raw thrown error', async () => {
    const handler = withErrorHandler(async (_request: Request) => {
      throw new Error('relation "secret_table" does not exist');
    });
    const response = await handler(new Request('https://app.example.com/api/x'));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await bodyOf(response))).not.toContain('secret_table');
  });
});
