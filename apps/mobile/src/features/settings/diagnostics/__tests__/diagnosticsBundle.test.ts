jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.2.0' } },
}));

const mockApiFetch = jest.fn();
jest.mock('../../../../../services/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import { collectMobileDiagnostics, exportMobileDiagnostics } from '../diagnosticsBundle';

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

describe('mobile diagnostics bundle', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('collects every field the support diagnostics contract names without a DOM', () => {
    const bundle = collectMobileDiagnostics({ screen: '/settings' });
    expect(Object.keys(bundle).sort()).toEqual([...BUNDLE_FIELDS].sort());
    expect(bundle.surface).toBe('mobile');
    expect(bundle.appVersion).toBe('1.2.0');
    expect(bundle.platform).toContain('ios');
    expect(bundle.viewport).not.toBeNull();
    expect(bundle.pagePath).toBe('/settings');
  });

  it('keeps only the newest events', () => {
    const events = Array.from({ length: 25 }, (_, index) => ({
      at: '2026-09-18T10:00:00.000Z',
      kind: 'error' as const,
      message: `failure ${index}`,
    }));
    expect(collectMobileDiagnostics({ recentEvents: events }).recentEvents).toHaveLength(10);
  });

  it('returns the server-redacted bundle', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        diagnostics: { surface: 'mobile' },
        summary: 'surface: mobile',
        filename: 'agi-diagnostics-mobile.json',
      }),
    });

    const result = await exportMobileDiagnostics();
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/support/diagnostics',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.summary).toBe('surface: mobile');
  });

  it('exports nothing when the redactor refuses', async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    await expect(exportMobileDiagnostics()).rejects.toThrow(/redacted on the server/);
  });
});
