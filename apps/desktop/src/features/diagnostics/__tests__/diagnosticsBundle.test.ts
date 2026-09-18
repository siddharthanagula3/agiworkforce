import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  cloudFetch: vi.fn(),
  getAuthHeaders: vi.fn(async () => ({ 'Content-Type': 'application/json' })),
}));

vi.mock('../../../utils/ipc', () => ({ invoke: mocks.invoke }));
vi.mock('../../../api/cloudApi', () => ({
  CLOUD_API_BASE_URL: 'https://agiworkforce.com',
  cloudFetch: mocks.cloudFetch,
  getAuthHeaders: mocks.getAuthHeaders,
}));

import { collectDesktopDiagnostics, exportDesktopDiagnostics } from '../diagnosticsBundle';

const BUNDLE_FIELDS = [
  'collectedAt',
  'surface',
  'appVersion',
  'releaseSha',
  'deployEnv',
  'platform',
  'locale',
  'timeZone',
  'viewport',
  'online',
  'pagePath',
  'conversationId',
  'recentEvents',
];

describe('desktop diagnostics bundle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invoke.mockResolvedValue(['boot failed: disk full']);
  });

  it('collects every field the support diagnostics contract names', async () => {
    const bundle = await collectDesktopDiagnostics({ appVersion: '1.2.0' });
    expect(Object.keys(bundle).sort()).toEqual([...BUNDLE_FIELDS].sort());
    expect(bundle.surface).toBe('desktop');
    expect(bundle.appVersion).toBe('1.2.0');
    expect(bundle.releaseSha).toBeNull();
    expect(bundle.recentEvents).toEqual([
      { at: bundle.collectedAt, kind: 'error', message: 'boot failed: disk full' },
    ]);
  });

  it('still produces a bundle when the log command is unavailable', async () => {
    mocks.invoke.mockRejectedValue(new Error('unknown command'));
    const bundle = await collectDesktopDiagnostics();
    expect(bundle.recentEvents).toEqual([]);
  });

  it('returns the redacted bundle the server produced, not the local one', async () => {
    mocks.cloudFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        diagnostics: { surface: 'desktop', recentEvents: [{ message: '[redacted]' }] },
        summary: 'surface: desktop',
        filename: 'agi-diagnostics-desktop.json',
      }),
    });

    const result = await exportDesktopDiagnostics();
    expect(mocks.cloudFetch).toHaveBeenCalledWith(
      'https://agiworkforce.com/api/support/diagnostics',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.summary).toBe('surface: desktop');
    expect(result.diagnostics.recentEvents[0]?.message).toBe('[redacted]');
  });

  it('exports nothing when the redactor is unreachable', async () => {
    mocks.cloudFetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    await expect(exportDesktopDiagnostics()).rejects.toThrow(/redacted on the server/u);
  });
});
