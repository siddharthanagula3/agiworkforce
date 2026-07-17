import { describe, expect, it, vi } from 'vitest';
import {
  ManagedCloudSettingsContractError,
  createManagedCloudSettingsClient,
} from '../managed-cloud-settings-client';

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => body),
  } as unknown as Response;
}

describe('createManagedCloudSettingsClient', () => {
  it('pulls through the canonical path and strips non-allowlisted namespaces', async () => {
    const fetchImpl = vi.fn(async () =>
      response({
        settings: {
          appearance: { theme: 'dark' },
          byok: { apiKey: 'must-not-cross' },
        },
        cursor: '12',
        hasMore: false,
      }),
    );
    const client = createManagedCloudSettingsClient({
      baseUrl: 'https://cloud.example/',
      fetchImpl,
      getHeaders: async () => ({ Authorization: 'Bearer token' }),
    });

    const pulled = await client.pull('9');

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://cloud.example/api/settings/sync?since=9',
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer token' },
      }),
    );
    expect(pulled.settings).toEqual({ appearance: { theme: 'dark' } });
  });

  it('runtime-validates push inputs and responses', async () => {
    const fetchImpl = vi.fn(async () => response({ applied: true, cursor: 13 }));
    const client = createManagedCloudSettingsClient({ fetchImpl });

    await expect(
      client.push({
        settings: { appearance: { theme: 'dark' } },
        baseVersion: '12',
      }),
    ).rejects.toBeInstanceOf(ManagedCloudSettingsContractError);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const calls = fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0]?.[1].headers).toMatchObject({
      'Content-Type': 'application/json',
    });
  });

  it('retries transient failures, emits observable events, and forwards cancellation', async () => {
    const events: string[] = [];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response({ error: 'temporarily unavailable' }, 503))
      .mockResolvedValueOnce(response({ applied: true, cursor: '13' }));
    const controller = new AbortController();
    const client = createManagedCloudSettingsClient({
      fetchImpl,
      retryDelayMs: 0,
      onEvent: (event) => events.push(`${event.operation}:${event.phase}:${event.attempt}`),
    });

    await expect(
      client.push(
        {
          settings: { appearance: { theme: 'dark' } },
          baseVersion: '12',
        },
        { signal: controller.signal },
      ),
    ).resolves.toEqual({ applied: true, cursor: '13' });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect((fetchImpl.mock.calls[0]?.[1] as RequestInit).signal).toBe(controller.signal);
    expect(events).toEqual(['push:start:1', 'push:retry:1', 'push:start:2', 'push:success:2']);
  });

  it('does not retry non-transient client errors', async () => {
    const fetchImpl = vi.fn(async () => response({ error: 'invalid' }, 400));
    const client = createManagedCloudSettingsClient({ fetchImpl, retryDelayMs: 0 });

    await expect(
      client.push({
        settings: { appearance: { theme: 'dark' } },
        baseVersion: '12',
      }),
    ).rejects.toThrow('HTTP 400');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('never serializes a future-skewed client timestamp into the push protocol', async () => {
    const fetchImpl = vi.fn(async () => response({ applied: false, cursor: '13' }));
    const client = createManagedCloudSettingsClient({ fetchImpl });

    await client.push({
      settings: { appearance: { theme: 'dark' } },
      baseVersion: '12',
      updatedAt: '2999-01-01T00:00:00.000Z',
    } as never);

    const calls = fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>;
    const init = calls[0]![1];
    expect(JSON.parse(String(init.body))).toEqual({
      settings: { appearance: { theme: 'dark' } },
      baseVersion: '12',
    });
  });

  it('cancels an in-flight retry delay', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(async () => response({ error: 'temporarily unavailable' }, 503));
    const controller = new AbortController();
    const client = createManagedCloudSettingsClient({ fetchImpl, retryDelayMs: 1_000 });

    const pending = client.pull('0', { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
