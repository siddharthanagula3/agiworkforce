import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('server-only', () => ({}));

import { AppError } from '@/lib/errors';
import { PayloadCeilingExceededError } from '@/lib/payload-ceiling';
import { readJsonBody, readValidatedJsonBody } from '@/lib/read-json-body';

const Schema = z.object({ cap: z.number().int().min(1) }).strict();

function request(body: string): Request {
  return new Request('https://app.example.com/api/x', { method: 'PUT', body });
}

describe('readJsonBody', () => {
  it('preserves the dedicated payload ceiling error by identity', async () => {
    const incoming = request('{}');
    const error = new PayloadCeilingExceededError(256 * 1024);
    vi.spyOn(incoming, 'json').mockRejectedValue(error);

    await expect(readJsonBody(incoming)).rejects.toBe(error);
  });

  it.each(['not json', '', ' '])('keeps invalid JSON %j as a validation error', async (body) => {
    await expect(readJsonBody(request(body))).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Invalid JSON body',
    });
  });

  it('keeps non-ceiling body read failures as validation errors', async () => {
    const incoming = request('{}');
    vi.spyOn(incoming, 'json').mockRejectedValue(new TypeError('Body read failed'));

    await expect(readJsonBody(incoming)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Invalid JSON body',
    });
  });
});

describe('readValidatedJsonBody', () => {
  it('preserves the dedicated payload ceiling error before schema validation', async () => {
    const incoming = request('{}');
    const error = new PayloadCeilingExceededError(256 * 1024);
    vi.spyOn(incoming, 'json').mockRejectedValue(error);

    await expect(readValidatedJsonBody(incoming, Schema, 'Invalid cap')).rejects.toBe(error);
  });

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
