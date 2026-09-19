import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  fetch: vi.fn(),
  signedIn: true,
}));

vi.mock('../../utils/ipc', () => ({ invoke: mocks.invoke }));
vi.mock('../../api/cloudApi', async (importOriginal) => ({
  ...(await importOriginal()),
  CLOUD_API_BASE_URL: 'https://agiworkforce.example',
}));
vi.mock('../../stores/auth', () => ({
  useAuthStore: { getState: () => ({}) },
  selectHasCloudAccountSession: () => mocks.signedIn,
}));
vi.mock('../managedCloudRequestContext', () => ({
  createManagedCloudRequestContext: () => ({
    getHeaders: async () => ({ Authorization: 'Bearer desktop-token' }),
    fetch: mocks.fetch,
  }),
}));
vi.mock('../deviceRegistryHeartbeat', () => ({
  desktopInstallId: () => 'desktop-install-1',
}));

import { flushAutomationAuditOutbox } from '../automationAuditOutbox';

beforeEach(() => {
  mocks.signedIn = true;
  mocks.invoke.mockReset();
  mocks.fetch.mockReset();
});

describe('automation audit outbox', () => {
  it('acknowledges only a fully accepted batch', async () => {
    mocks.invoke
      .mockResolvedValueOnce([
        { id: 7, report: { runId: 'run-1' } },
        { id: 8, report: { runId: 'run-1' } },
      ])
      .mockResolvedValueOnce(2);
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify({ accepted: 2 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(flushAutomationAuditOutbox()).resolves.toBe(true);
    expect(mocks.fetch).toHaveBeenCalledWith(
      'https://agiworkforce.example/api/automation/outcomes',
      expect.objectContaining({ method: 'POST' }),
    );
    const [, request] = mocks.fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toEqual({
      outcomes: [
        { runId: 'run-1', deviceId: 'desktop-install-1' },
        { runId: 'run-1', deviceId: 'desktop-install-1' },
      ],
    });
    expect(mocks.invoke).toHaveBeenLastCalledWith('automation_audit_outbox_ack', {
      request: { ids: [7, 8] },
    });
  });

  it('retains the batch when delivery fails', async () => {
    mocks.invoke.mockResolvedValueOnce([{ id: 7, report: { runId: 'run-1' } }]);
    mocks.fetch.mockResolvedValue(new Response('{}', { status: 503 }));

    await expect(flushAutomationAuditOutbox()).resolves.toBe(false);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });

  it('does not read or transmit another account boundary while signed out', async () => {
    mocks.signedIn = false;
    await expect(flushAutomationAuditOutbox()).resolves.toBe(false);
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
