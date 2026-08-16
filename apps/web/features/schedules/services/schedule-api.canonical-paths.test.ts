import { describe, expect, it, vi } from 'vitest';

const RELOCATED = '/api/relocated-schedules';

vi.mock('@agiworkforce/cloud-contracts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/cloud-contracts')>();
  return {
    ...actual,
    MANAGED_CLOUD_SCHEDULES_PATH: RELOCATED,
    managedCloudSchedulePath: (scheduleId: string) =>
      `${RELOCATED}/${encodeURIComponent(scheduleId)}`,
    managedCloudScheduleRunsPath: (scheduleId: string) =>
      `${RELOCATED}/${encodeURIComponent(scheduleId)}/runs`,
  };
});

const { createScheduleApi } = await import('./schedule-api');

function response(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function requestedUrls(fetchImpl: ReturnType<typeof vi.fn>): string[] {
  return fetchImpl.mock.calls.map((call) => String(call[0]));
}

describe('schedule API canonical path ownership', () => {
  it('routes every schedules call through the cloud contract, never a retyped literal', async () => {
    const fetchImpl = vi.fn(async () =>
      response({ schedules: [], pagination: { limit: 20, offset: 0 } }),
    );
    const api = createScheduleApi({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getCsrfToken: async () => 'csrf-token',
    });

    await api.listSchedules({ limit: 20, offset: 0 });

    expect(requestedUrls(fetchImpl)).toEqual([`${RELOCATED}?limit=20&offset=0`]);
  });

  it('keeps list, item, and runs on the same relocated resource', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response({ schedules: [], pagination: { limit: 5, offset: 0 } }))
      .mockResolvedValueOnce(response({ runs: [], pagination: { limit: 5, offset: 0 } }));
    const api = createScheduleApi({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getCsrfToken: async () => 'csrf-token',
    });

    await api.listSchedules({ limit: 5, offset: 0 });
    await api.listRuns('schedule/1', { limit: 5, offset: 0 });

    for (const url of requestedUrls(fetchImpl)) {
      expect(url.startsWith(`${RELOCATED}`)).toBe(true);
    }
  });
});
