import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('server-only', () => ({}));

import { AppError } from '@/lib/errors';
import { readValidatedJsonBody } from '@/lib/read-json-body';

const Schema = z.object({ cap: z.number().int().min(1) }).strict();

function request(body: string): Request {
  return new Request('https://app.example.com/api/x', { method: 'PUT', body });
}

describe('readValidatedJsonBody', () => {
  it('returns the parsed body when it matches the schema', async () => {
    await expect(
      readValidatedJsonBody(request('{"cap":5}'), Schema, 'Invalid cap'),
    ).resolves.toEqual({ cap: 5 });
  });

  it('throws a validation error carrying the issues for a mismatched body', async () => {
    const error = await readValidatedJsonBody(request('{"cap":0}'), Schema, 'Invalid cap').catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(400);
    expect((error as AppError).message).toBe('Invalid cap');
    expect(Array.isArray((error as AppError).details)).toBe(true);
  });

  it('throws a validation error for a body that is not JSON', async () => {
    const error = await readValidatedJsonBody(request('not json'), Schema, 'Invalid cap').catch(
      (caught: unknown) => caught,
    );
    expect((error as AppError).message).toBe('Invalid JSON body');
  });
});
