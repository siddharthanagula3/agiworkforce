import { describe, expect, it } from 'vitest';
import {
  CLOUD_CODE_ENVIRONMENTS_PATH,
  CLOUD_CODE_TURN_STILL_RUNNING_CODE,
  CloudCodeApiError,
  CreateCloudCodeEnvironmentRequestSchema,
  UpdateCloudCodeEnvironmentRequestSchema,
  createManagedCloudCodeApi,
  isCloudCodeEnvironmentsUnavailable,
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

const ENVIRONMENT_ID = '0190a000-0000-7000-8000-000000000002';
const ENVIRONMENT = {
  id: ENVIRONMENT_ID,
  name: 'Web app',
  networkAccess: 'trusted',
  extraHosts: ['registry.example.com'],
  allowPackageManagers: true,
  setupScript: 'npm install',
  variableNames: ['API_TOKEN'],
  isDefault: true,
  createdAt: '2026-11-16T10:00:00.000Z',
  updatedAt: '2026-11-16T10:00:00.000Z',
};

describe('managed Code client environments', () => {
  it('reads the list and the account limit', async () => {
    const calls: Array<{ path: string; init: RequestInit }> = [];
    const client = createManagedCloudCodeApi({
      fetchImpl: async (path, init) => {
        calls.push({ path, init });
        return Response.json({ environments: [ENVIRONMENT], limit: 20 });
      },
    });

    const body = await client.listEnvironments();

    expect(calls[0]?.path).toBe(CLOUD_CODE_ENVIRONMENTS_PATH);
    expect(body).toEqual({ environments: [ENVIRONMENT], limit: 20 });
  });

  it('drops anything a list row carries beyond the variable names', async () => {
    const client = api(async () =>
      Response.json({
        environments: [{ ...ENVIRONMENT, variables: { API_TOKEN: 'secret' } }],
        limit: 20,
      }),
    );

    const body = await client.listEnvironments();

    expect(JSON.stringify(body)).not.toContain('secret');
  });

  it('tells a server without environments apart from a failed request', async () => {
    const missing = await api(async () => Response.json({ error: 'Not found' }, { status: 404 }))
      .listEnvironments()
      .catch((caught: unknown) => caught);
    const failed = await api(async () => Response.json({ error: 'Boom' }, { status: 500 }))
      .listEnvironments()
      .catch((caught: unknown) => caught);

    expect(isCloudCodeEnvironmentsUnavailable(missing)).toBe(true);
    expect(isCloudCodeEnvironmentsUnavailable(failed)).toBe(false);
  });

  it('changes and deletes one environment at its own path', async () => {
    const calls: Array<{ path: string; init: RequestInit }> = [];
    const client = createManagedCloudCodeApi({
      fetchImpl: async (path, init) => {
        calls.push({ path, init });
        return init.method === 'DELETE'
          ? Response.json({ deleted: true })
          : Response.json({ environment: ENVIRONMENT });
      },
    });

    const updated = await client.updateEnvironment(ENVIRONMENT_ID, { isDefault: true });
    await client.deleteEnvironment(ENVIRONMENT_ID);

    expect(updated).toEqual(ENVIRONMENT);
    expect(calls.map((call) => [call.init.method, call.path])).toEqual([
      ['PATCH', `${CLOUD_CODE_ENVIRONMENTS_PATH}/${ENVIRONMENT_ID}`],
      ['DELETE', `${CLOUD_CODE_ENVIRONMENTS_PATH}/${ENVIRONMENT_ID}`],
    ]);
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ isDefault: true });
  });

  it('accepts only the settings the server stores', () => {
    const create = { requestId: 'request-0001', name: 'Web app', networkAccess: 'trusted' };

    expect(CreateCloudCodeEnvironmentRequestSchema.safeParse(create).success).toBe(true);
    expect(
      CreateCloudCodeEnvironmentRequestSchema.safeParse({ ...create, variables: { A: 'b' } })
        .success,
    ).toBe(false);
    expect(UpdateCloudCodeEnvironmentRequestSchema.safeParse({}).success).toBe(false);
    expect(UpdateCloudCodeEnvironmentRequestSchema.safeParse({ isDefault: false }).success).toBe(
      true,
    );
  });
});
