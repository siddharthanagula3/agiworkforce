import { describe, expect, it } from 'vitest';
import {
  CLOUD_CODE_TURN_STILL_RUNNING_CODE,
  CloudCodeApiError,
  createManagedCloudCodeApi,
} from '../index';

function api(fetchImpl: () => Promise<Response>) {
  return createManagedCloudCodeApi({ fetchImpl });
}

describe('managed Code client errors', () => {
  it('names a durable turn that is still running', async () => {
    const client = api(async () =>
      Response.json(
        {
          error: {
            code: 'CONFLICT',
            message: 'The task is still running.',
            details: { reason: CLOUD_CODE_TURN_STILL_RUNNING_CODE },
          },
        },
        { status: 409 },
      ),
    );

    const error = await client
      .startAgentTurn('0190a000-0000-7000-8000-000000000001', {
        goal: 'fix the build',
        model: 'model-a',
        idempotencyKey: 'key-00000001',
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CloudCodeApiError);
    expect((error as CloudCodeApiError).status).toBe(409);
    expect((error as CloudCodeApiError).code).toBe(CLOUD_CODE_TURN_STILL_RUNNING_CODE);
  });

  it('keeps the status of a refusal the transport raised itself', async () => {
    const refusal = Object.assign(new Error('Continue with one of your passkeys.'), {
      status: 403,
      code: 'PASSKEY_REQUIRED',
    });
    const client = api(async () => {
      throw refusal;
    });

    const error = await client.list().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CloudCodeApiError);
    expect((error as CloudCodeApiError).status).toBe(403);
    expect((error as CloudCodeApiError).message).toBe('Continue with one of your passkeys.');
  });

  it('still reports an unreachable service as a connection problem', async () => {
    const client = api(async () => {
      throw new TypeError('Network request failed');
    });

    const error = await client.list().catch((caught: unknown) => caught);

    expect((error as CloudCodeApiError).status).toBe(0);
  });
});
