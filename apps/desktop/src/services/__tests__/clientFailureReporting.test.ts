import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reportClientFailure } from '@agiworkforce/unified-chat';

const cloudFetch = vi.fn();
const getAuthHeaders = vi.fn();
let privateBoundary = false;

vi.mock('../../api/cloudApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/cloudApi')>();
  return {
    ...actual,
    CLOUD_API_BASE_URL: 'https://cloud.example',
    cloudFetch: (...args: unknown[]) => cloudFetch(...args),
    getAuthHeaders: () => getAuthHeaders(),
  };
});

vi.mock('../../stores/privacyBoundary', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../stores/privacyBoundary')>();
  return { ...actual, isPrivateTrustBoundary: () => privateBoundary };
});

import {
  CLIENT_FAILURE_ENDPOINT,
  CLIENT_FAILURE_SESSION_BUDGET,
  installClientFailureReporting,
  resetClientFailureReporting,
} from '../clientFailureReporting';

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  privateBoundary = false;
  cloudFetch.mockReset().mockResolvedValue({ ok: true });
  getAuthHeaders.mockReset().mockResolvedValue({ Authorization: 'Bearer desktop-token' });
  resetClientFailureReporting();
});

afterEach(() => {
  resetClientFailureReporting();
});

describe('the failure the shell counts and used to drop', () => {
  it('carries a report the shared chat surface made to the account ingest', async () => {
    installClientFailureReporting();

    reportClientFailure({ failure: 'mermaid_render', detail: 'parse' });
    await settle();

    expect(cloudFetch).toHaveBeenCalledTimes(1);
    const [url, init] = cloudFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://cloud.example${CLIENT_FAILURE_ENDPOINT}`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      events: [{ failure: 'mermaid_render', detail: 'parse' }],
    });
  });

  it('carries nothing at all while this window is on a private trust boundary', async () => {
    privateBoundary = true;
    installClientFailureReporting();

    reportClientFailure({ failure: 'artifact_load', detail: 'timeout' });
    await settle();

    expect(cloudFetch).not.toHaveBeenCalled();
  });

  it('goes quiet once a render loop has spent the session budget', async () => {
    installClientFailureReporting();

    for (let i = 0; i < CLIENT_FAILURE_SESSION_BUDGET + 5; i += 1) {
      reportClientFailure({ failure: 'markdown_render', detail: 'render' });
    }
    await settle();

    expect(cloudFetch).toHaveBeenCalledTimes(CLIENT_FAILURE_SESSION_BUDGET);
  });

  it('never throws back into the render it is reporting on', async () => {
    cloudFetch.mockRejectedValue(new Error('offline'));
    installClientFailureReporting();

    expect(() =>
      reportClientFailure({ failure: 'code_copy', detail: 'permission_denied' }),
    ).not.toThrow();
    await settle();
  });

  it('emits nothing once the host uninstalls the sink', async () => {
    installClientFailureReporting();
    resetClientFailureReporting();

    reportClientFailure({ failure: 'stream_stall', detail: 'timeout' });
    await settle();

    expect(cloudFetch).not.toHaveBeenCalled();
  });
});
