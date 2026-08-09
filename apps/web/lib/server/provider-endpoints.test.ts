import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const warn = vi.fn();
vi.mock('@/lib/logger', () => ({ logger: { warn: (...a: unknown[]) => warn(...a) } }));

const storeMedia = vi.fn();
const insertMediaAsset = vi.fn();
vi.mock('@/lib/server/media-storage', () => ({
  isMediaStorageConfigured: () => true,
  storeMedia: (...args: unknown[]) => storeMedia(...args),
}));
vi.mock('@/lib/server/media-assets', () => ({
  insertMediaAsset: (...args: unknown[]) => insertMediaAsset(...args),
}));

import { providerApiUrl } from './provider-endpoints';
import { persistGeneratedFile } from './container-files';

const ENV_KEYS = ['OPENAI_BASE_URL', 'ANTHROPIC_BASE_URL'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  warn.mockReset();
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('provider API root resolution', () => {
  it('falls back to the vendor default when no override is set', () => {
    expect(providerApiUrl('openai', 'models')).toBe('https://api.openai.com/v1/models');
    expect(providerApiUrl('anthropic', 'models')).toBe('https://api.anthropic.com/v1/models');
  });

  it('honours an allowlisted *_BASE_URL override', () => {
    process.env['OPENAI_BASE_URL'] = 'https://gateway.ai.cloudflare.com/v1/acct/gw/openai';
    expect(providerApiUrl('openai', 'models')).toBe(
      'https://gateway.ai.cloudflare.com/v1/acct/gw/openai/models',
    );
  });

  it('strips a trailing slash so joined paths never double up', () => {
    process.env['ANTHROPIC_BASE_URL'] = 'https://gateway.ai.cloudflare.com/v1/acct/gw/anthropic/';
    expect(providerApiUrl('anthropic', 'messages')).toBe(
      'https://gateway.ai.cloudflare.com/v1/acct/gw/anthropic/messages',
    );
  });

  it('drops a non-allowlisted override and warns instead of failing the request', () => {
    process.env['OPENAI_BASE_URL'] = 'https://169.254.169.254/latest/meta-data';
    expect(providerApiUrl('openai', 'models')).toBe('https://api.openai.com/v1/models');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('drops a plaintext override', () => {
    process.env['ANTHROPIC_BASE_URL'] = 'http://api.anthropic.com/v1';
    expect(providerApiUrl('anthropic', 'models')).toBe('https://api.anthropic.com/v1/models');
  });
});

describe('providerApiUrl', () => {
  it('joins a version-relative path onto the resolved root', () => {
    expect(providerApiUrl('openai', 'audio/transcriptions')).toBe(
      'https://api.openai.com/v1/audio/transcriptions',
    );
    expect(providerApiUrl('openai', '/images/generations')).toBe(
      'https://api.openai.com/v1/images/generations',
    );
  });
});

/**
 * Call-site coverage: the resolver is worthless if the modules that actually
 * fetch keep their own literal. These assert the request URL a real call path
 * produces, so re-inlining `https://api.openai.com/...` in container-files.ts
 * fails here and not only in the repo-wide guard.
 */
describe('generated-file fetchers route through the resolved endpoint', () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    fetchSpy.mockReset();
    storeMedia.mockReset();
    insertMediaAsset.mockReset();
    vi.stubGlobal('fetch', fetchSpy);
    process.env['OPENAI_API_KEY'] = 'sk-test';
    process.env['ANTHROPIC_API_KEY'] = 'ak-test';
    storeMedia.mockResolvedValue({
      url: 'https://blob.example/media/file/u/x.pdf',
      pathname: 'media/file/u/x.pdf',
      byteSize: 5,
      contentType: 'application/pdf',
    });
    insertMediaAsset.mockResolvedValue('asset_1');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function fetchOk(body = 'bytes', contentType = 'application/pdf') {
    return {
      ok: true,
      status: 200,
      headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? contentType : null) },
      arrayBuffer: async () => Buffer.from(body),
      json: async () => ({ filename: 'report.pdf' }),
    };
  }

  it('sends the OpenAI container-file download to OPENAI_BASE_URL', async () => {
    process.env['OPENAI_BASE_URL'] = 'https://gateway.ai.cloudflare.com/v1/acct/gw/openai';
    fetchSpy.mockResolvedValue(fetchOk('pdf-bytes', 'application/pdf'));

    await persistGeneratedFile({
      userId: 'user_1',
      ref: { provider: 'openai', filename: 'report.pdf', containerId: 'cntr_1', fileId: 'file_1' },
      model: 'gpt-5.5',
    });

    expect(fetchSpy).toHaveBeenCalled();
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(
      'https://gateway.ai.cloudflare.com/v1/acct/gw/openai/containers/cntr_1/files/file_1/content',
    );
  });

  it('sends the Anthropic file download to ANTHROPIC_BASE_URL', async () => {
    process.env['ANTHROPIC_BASE_URL'] = 'https://gateway.ai.cloudflare.com/v1/acct/gw/anthropic';
    fetchSpy.mockResolvedValue(fetchOk('pdf-bytes', 'application/pdf'));

    await persistGeneratedFile({
      userId: 'user_1',
      ref: { provider: 'anthropic', filename: 'report.pdf', fileId: 'file_abc' },
      model: 'claude-sonnet-4-5',
    });

    expect(fetchSpy).toHaveBeenCalled();
    const urls = fetchSpy.mock.calls.map((call) => String(call[0]));
    expect(
      urls.some((u) => u.startsWith('https://gateway.ai.cloudflare.com/v1/acct/gw/anthropic/')),
    ).toBe(true);
    expect(urls.some((u) => u.includes('api.anthropic.com'))).toBe(false);
  });
});
