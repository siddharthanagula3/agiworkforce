import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  collectExtensionDiagnostics,
  exportExtensionDiagnostics,
} from '../src/features/diagnostics';

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

describe('chrome extension diagnostics bundle', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', { runtime: { getManifest: () => ({ version: '1.2.0' }) } });
  });

  it('collects every field the support diagnostics contract names', () => {
    const bundle = collectExtensionDiagnostics();
    expect(Object.keys(bundle).sort()).toEqual([...BUNDLE_FIELDS].sort());
    expect(bundle.surface).toBe('extension-chrome');
    expect(bundle.appVersion).toBe('1.2.0');
  });

  it('never reports the page the user was browsing', () => {
    expect(collectExtensionDiagnostics().pagePath).toBeNull();
  });

  it('keeps only the newest events', () => {
    const events = Array.from({ length: 25 }, (_, index) => ({
      at: '2026-09-18T10:00:00.000Z',
      kind: 'error' as const,
      message: `failure ${index}`,
    }));
    const bundle = collectExtensionDiagnostics({ recentEvents: events });
    expect(bundle.recentEvents).toHaveLength(10);
    expect(bundle.recentEvents.at(-1)?.message).toBe('failure 24');
  });

  it('returns the server-redacted bundle and sends the bearer token', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        diagnostics: { surface: 'extension-chrome' },
        summary: 'surface: extension-chrome',
        filename: 'agi-diagnostics-extension-chrome.json',
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await exportExtensionDiagnostics('tok_1');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/support\/diagnostics$/u);
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok_1');
    expect(result.summary).toBe('surface: extension-chrome');
  });

  it('exports nothing when the redactor refuses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })),
    );
    await expect(exportExtensionDiagnostics('tok_1')).rejects.toThrow(/redacted on the server/u);
  });
});
