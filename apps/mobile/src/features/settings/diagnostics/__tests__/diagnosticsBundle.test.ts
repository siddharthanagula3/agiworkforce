jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.2.0' }, platform: { ios: { buildNumber: '57' } } },
}));

const mockApiFetch = jest.fn();
jest.mock('../../../../../services/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import { supportDiagnosticsSchema } from '@agiworkforce/cloud-contracts/support';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { collectMobileDiagnostics, exportMobileDiagnostics } from '../diagnosticsBundle';

const BUNDLE_FIELDS = [
  'collectedAt',
  'surface',
  'appVersion',
  'releaseSha',
  'deployEnv',
  'platform',
  'appBuild',
  'deviceClass',
  'appMode',
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

  it('names the build, device class and app mode the feedback screen reports', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const bundle = collectMobileDiagnostics();
    expect(bundle.appBuild).toBe('57');
    expect(['phone', 'tablet']).toContain(bundle.deviceClass);
    expect(bundle.appMode).toBe('cloud');

    useChatAppModeStore.setState({ appMode: 'local' });
    expect(collectMobileDiagnostics().appMode).toBe('local');
  });

  it('stays valid for the shared schema whether or not it names the client fields yet', () => {
    const bundle = collectMobileDiagnostics();
    const known = Object.keys(supportDiagnosticsSchema.shape);
    const accepted = Object.fromEntries(
      Object.entries(bundle).filter(([field]) => known.includes(field)),
    );
    expect(supportDiagnosticsSchema.safeParse(accepted).success).toBe(true);
    if (known.includes('appBuild')) {
      expect(supportDiagnosticsSchema.safeParse(bundle).success).toBe(true);
    }
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
