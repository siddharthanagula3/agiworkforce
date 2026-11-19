import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequestAuthority } from '@/lib/identity/request-authority';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { readPrivacyPreferences, savePrivacyPreference } from './privacy-preferences-client';

vi.mock('@/lib/client/csrf', async (original) => ({
  ...(await original<ImportedModule0>()),
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => new Headers(headers)),
}));

const fetchMock = vi.fn<typeof fetch>();
const authority = () =>
  createRequestAuthority({
    userId: 'a',
    sessionId: 'session-a',
    isCurrent: () => true,
    getToken: async () => 'token-a',
  });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(addCsrfHeaders)
    .mockReset()
    .mockImplementation(async (headers) => new Headers(headers));
});
afterEach(() => vi.unstubAllGlobals());

describe('strict privacy snapshots', () => {
  it.each([
    {},
    { settings: null, version: null },
    { settings: [], version: null },
    { settings: {}, version: '' },
    { settings: { privacy: null }, version: 'v1' },
    { settings: { privacy: [] }, version: 'v1' },
    { settings: { privacy: { shareTelemetry: 'true' } }, version: 'v1' },
    { settings: { privacy: { keepOutOfProviderTraining: null } }, version: 'v1' },
    { settings: { privacy: { allowChatsForModelImprovement: 'true' } }, version: 'v1' },
    { settings: { privacy: { allowVoiceForModelImprovement: 1 } }, version: 'v1' },
  ])('rejects malformed data rather than manufacturing defaults: %j', async (body) => {
    fetchMock.mockResolvedValueOnce(Response.json(body));
    await expect(readPrivacyPreferences(authority())).rejects.toThrow();
  });

  it('preserves missing first-use values without granting consent', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ settings: {}, version: null }));
    await expect(readPrivacyPreferences(authority())).resolves.toEqual({
      stored: {},
      version: null,
    });
  });

  it.each([
    { settings: { privacy: { shareTelemetry: false } }, version: 'v1' },
    { settings: { privacy: {} }, version: 'v1' },
    { settings: { privacy: { shareTelemetry: true } }, version: null },
  ])('rejects an unmatched or unconfirmed stored receipt: %j', async (body) => {
    fetchMock.mockResolvedValueOnce(Response.json(body));
    const event = vi.fn();
    window.addEventListener('agi:preference-namespace-saved', event);
    try {
      await expect(savePrivacyPreference(authority(), 'shareTelemetry', true)).rejects.toThrow();
      expect(event).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('agi:preference-namespace-saved', event);
    }
  });

  it('patches one field and publishes the real stored namespace including untouched siblings', async () => {
    const stored = { shareTelemetry: false, keepOutOfProviderTraining: true, sibling: 'preserved' };
    fetchMock.mockResolvedValueOnce(
      Response.json({ settings: { privacy: stored }, version: 'v2' }),
    );
    const event = vi.fn();
    window.addEventListener('agi:preference-namespace-saved', event);
    try {
      await expect(
        savePrivacyPreference(authority(), 'keepOutOfProviderTraining', true),
      ).resolves.toEqual({ stored, version: 'v2' });
      expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({
        namespace: 'privacy',
        patch: { keepOutOfProviderTraining: true },
      });
      expect(event.mock.calls[0]![0].detail).toEqual({ namespace: 'privacy', value: stored });
    } finally {
      window.removeEventListener('agi:preference-namespace-saved', event);
    }
  });

  it('checks retirement after response JSON before publishing', async () => {
    const operation = authority();
    let resolve!: (body: unknown) => void;
    let parsed!: () => void;
    const parsing = new Promise<void>((done) => {
      parsed = done;
    });
    const body = new Promise<unknown>((done) => {
      resolve = done;
    });
    const response = new Response();
    vi.spyOn(response, 'json').mockImplementation(() => {
      parsed();
      return body;
    });
    fetchMock.mockResolvedValueOnce(response);
    const event = vi.fn();
    window.addEventListener('agi:preference-namespace-saved', event);
    try {
      const pending = savePrivacyPreference(operation, 'shareTelemetry', true);
      const rejected = expect(pending).rejects.toThrow();
      await parsing;
      operation.retire();
      resolve({ settings: { privacy: { shareTelemetry: true } }, version: 'v1' });
      await rejected;
      expect(event).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('agi:preference-namespace-saved', event);
    }
  });
});

type ImportedModule0 = typeof import('@/lib/client/csrf');
