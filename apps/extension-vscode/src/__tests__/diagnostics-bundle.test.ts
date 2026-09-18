import { describe, expect, it, vi } from 'vitest';

import {
  collectVsCodeDiagnostics,
  exportVsCodeDiagnostics,
  type VsCodeDiagnosticsEnvironment,
} from '../features/diagnostics';

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

const FULL_ENVIRONMENT: VsCodeDiagnosticsEnvironment = {
  extensionVersion: '1.2.0',
  hostName: 'Visual Studio Code',
  hostVersion: '1.99.0',
  language: 'en',
  osPlatform: 'darwin',
};

describe('vscode diagnostics bundle', () => {
  it('collects every field the support diagnostics contract names', () => {
    const bundle = collectVsCodeDiagnostics(FULL_ENVIRONMENT);
    expect(Object.keys(bundle).sort()).toEqual([...BUNDLE_FIELDS].sort());
    expect(bundle.surface).toBe('extension-vscode');
    expect(bundle.platform).toBe('Visual Studio Code 1.99.0 darwin');
    expect(bundle.appVersion).toBe('1.2.0');
  });

  it('reports no host string rather than a half-built one', () => {
    const bundle = collectVsCodeDiagnostics({
      extensionVersion: null,
      hostName: null,
      hostVersion: null,
      language: null,
      osPlatform: null,
    });
    expect(bundle.platform).toBeNull();
    expect(bundle.pagePath).toBeNull();
  });

  it('returns the server-redacted bundle and sends the bearer token', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        diagnostics: { surface: 'extension-vscode' },
        summary: 'surface: extension-vscode',
        filename: 'agi-diagnostics-extension-vscode.json',
      }),
    })) as unknown as typeof fetch;

    const result = await exportVsCodeDiagnostics({
      token: 'tok_1',
      baseUrl: 'https://agiworkforce.com',
      environment: FULL_ENVIRONMENT,
      fetchImpl,
    });

    const [url, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0] as [string, RequestInit];
    expect(url).toBe('https://agiworkforce.com/api/support/diagnostics');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok_1');
    expect(result.summary).toBe('surface: extension-vscode');
  });

  it('exports nothing when the redactor refuses', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    await expect(
      exportVsCodeDiagnostics({
        token: 'tok_1',
        baseUrl: 'https://agiworkforce.com',
        environment: FULL_ENVIRONMENT,
        fetchImpl,
      }),
    ).rejects.toThrow(/redacted on the server/u);
  });
});
