import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const warn = vi.fn();
vi.mock('@/lib/logger', () => ({ logger: { warn: (...a: unknown[]) => warn(...a) } }));

const storeMedia = vi.fn();
const insertMediaAsset = vi.fn();
vi.mock('@/lib/server/media-storage', () => ({
  isGeneratedMediaStorageConfigured: () => true,
  storeMedia: (...args: unknown[]) => storeMedia(...args),
  deleteStoredMedia: vi.fn(),
}));
vi.mock('@/lib/server/media-assets', () => ({
  insertMediaAsset: (...args: unknown[]) => insertMediaAsset(...args),
}));

import { googleVideoOutputHostDisposition, providerApiUrl } from './provider-endpoints';
import { persistGeneratedFile } from './container-files';

const ENV_KEYS = [
  'OPENAI_BASE_URL',
  'ANTHROPIC_BASE_URL',
  'GOOGLE_BASE_URL',
  'OPENROUTER_BASE_URL',
] as const;
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
    expect(providerApiUrl('google', 'operations/task-1')).toBe(
      'https://generativelanguage.googleapis.com/v1beta/operations/task-1',
    );
    expect(providerApiUrl('openrouter', 'videos')).toBe('https://openrouter.ai/api/v1/videos');
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
      'https://gateway.ai.cloudflare.com/v1/acct/gw/anthropic/v1/messages',
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

  it('honours the installed Google SDK GOOGLE_BASE_URL convention without adding a version', () => {
    process.env['GOOGLE_BASE_URL'] = 'https://gateway.ai.cloudflare.com/v1/acct/gw/google/v1beta';
    expect(providerApiUrl('google', 'operations/task-1')).toBe(
      'https://gateway.ai.cloudflare.com/v1/acct/gw/google/v1beta/operations/task-1',
    );
  });

  it('uses the shared OpenRouter base URL convention for video endpoints', () => {
    process.env['OPENROUTER_BASE_URL'] = 'https://gateway.ai.cloudflare.com/v1/acct/gw/openrouter';
    expect(providerApiUrl('openrouter', 'videos/task-1/content?index=0')).toBe(
      'https://gateway.ai.cloudflare.com/v1/acct/gw/openrouter/videos/task-1/content?index=0',
    );
  });

  it('classifies only canonical/configured Google API hosts and redirect-only storage hosts', () => {
    process.env['GOOGLE_BASE_URL'] = 'https://gateway.ai.cloudflare.com/v1/acct/gw/google/v1beta';

    expect(googleVideoOutputHostDisposition('generativelanguage.googleapis.com')).toBe('api');
    expect(googleVideoOutputHostDisposition('gateway.ai.cloudflare.com')).toBe('api');
    expect(googleVideoOutputHostDisposition('storage.googleapis.com')).toBeNull();
    expect(googleVideoOutputHostDisposition('storage.googleapis.com', true)).toBe('redirect');
    expect(googleVideoOutputHostDisposition('attacker.example', true)).toBeNull();
  });
});

/**
 * ANTHROPIC_BASE_URL is read under two incompatible conventions in this repo
 * and neither is going away:
 *
 *   - `packages/ai/providers/anthropic/src/index.ts:75` -> `@anthropic-ai/sdk`,
 *     whose `baseURL` must NOT carry `/v1` (it posts `/v1/messages` itself).
 *     `lib/services/provider-adapter-service.ts:182-201` feeds it the raw
 *     validated override.
 *   - `lib/ai-sdk/providers.ts:106-112` -> `@ai-sdk/anthropic`, whose `baseURL`
 *     MUST carry `/v1` (it appends only `/messages`).
 *
 * So an operator's single value is `/v1`-carrying for one path and not for the
 * other. These direct fetch sites must land on a real endpoint either way:
 * concatenating blindly yields `<root>/messages` (404, missing `/v1`) for the
 * no-`/v1` spelling, or `<root>/v1/v1/messages` for the other. Both spellings
 * must normalize to the same URL.
 */
describe('ANTHROPIC_BASE_URL is version-agnostic (both repo conventions resolve alike)', () => {
  const EXPECTED = 'https://gateway.ai.cloudflare.com/v1/acct/gw/anthropic/v1/messages';

  it('resolves the no-/v1 spelling (@anthropic-ai/sdk convention) to a /v1 path', () => {
    process.env['ANTHROPIC_BASE_URL'] = 'https://gateway.ai.cloudflare.com/v1/acct/gw/anthropic';
    expect(providerApiUrl('anthropic', 'messages')).toBe(EXPECTED);
  });

  it('resolves the /v1-carrying spelling (@ai-sdk/anthropic convention) without doubling /v1', () => {
    process.env['ANTHROPIC_BASE_URL'] = 'https://gateway.ai.cloudflare.com/v1/acct/gw/anthropic/v1';
    expect(providerApiUrl('anthropic', 'messages')).toBe(EXPECTED);
    expect(providerApiUrl('anthropic', 'messages')).not.toContain('/v1/v1/');
  });

  it('keeps an interior /v1 that belongs to the gateway path, not the provider version', () => {
    process.env['ANTHROPIC_BASE_URL'] = 'https://gateway.ai.cloudflare.com/v1/acct/gw/anthropic';
    expect(providerApiUrl('anthropic', 'files/file_1/content')).toBe(
      'https://gateway.ai.cloudflare.com/v1/acct/gw/anthropic/v1/files/file_1/content',
    );
  });

  it('leaves OPENAI_BASE_URL alone — both OpenAI SDKs agree the root carries /v1', () => {
    process.env['OPENAI_BASE_URL'] = 'https://gateway.ai.cloudflare.com/v1/acct/gw/openai';
    expect(providerApiUrl('openai', 'audio/transcriptions')).toBe(
      'https://gateway.ai.cloudflare.com/v1/acct/gw/openai/audio/transcriptions',
    );
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
      url: 'private-media/file/owner/x.pdf',
      pathname: 'private-media/file/owner/x.pdf',
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
      organizationId: null,
      ref: { provider: 'openai', filename: 'report.pdf', containerId: 'cntr_1', fileId: 'file_1' },
      model: 'fixture-model',
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
      organizationId: null,
      ref: { provider: 'anthropic', filename: 'report.pdf', fileId: 'file_abc' },
      model: 'fixture-model',
    });

    expect(fetchSpy).toHaveBeenCalled();
    const urls = fetchSpy.mock.calls.map((call) => String(call[0]));
    // Exact URL, not a prefix: the Files API lives under `/v1`, and the
    // override here is written in the no-`/v1` (@anthropic-ai/sdk) spelling —
    // a blind join would emit `.../anthropic/files/...` and 404.
    expect(urls).toContain(
      'https://gateway.ai.cloudflare.com/v1/acct/gw/anthropic/v1/files/file_abc/content',
    );
    expect(urls.some((u) => u.includes('api.anthropic.com'))).toBe(false);
  });

  it('sends the Anthropic file download to the same URL when the override carries /v1', async () => {
    process.env['ANTHROPIC_BASE_URL'] = 'https://gateway.ai.cloudflare.com/v1/acct/gw/anthropic/v1';
    fetchSpy.mockResolvedValue(fetchOk('pdf-bytes', 'application/pdf'));

    await persistGeneratedFile({
      userId: 'user_1',
      organizationId: null,
      ref: { provider: 'anthropic', filename: 'report.pdf', fileId: 'file_abc' },
      model: 'fixture-model',
    });

    const urls = fetchSpy.mock.calls.map((call) => String(call[0]));
    expect(urls).toContain(
      'https://gateway.ai.cloudflare.com/v1/acct/gw/anthropic/v1/files/file_abc/content',
    );
    expect(urls.some((u) => u.includes('/v1/v1/'))).toBe(false);
  });
});
