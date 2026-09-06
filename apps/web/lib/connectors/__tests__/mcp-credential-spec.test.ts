import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { remoteRecordFixture } from './directory-record-fixture';

const mocks = vi.hoisted(() => ({
  protectedResource: vi.fn(),
  pinnedFetch: vi.fn(),
  cache: new Map<string, { value: string }>(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@modelcontextprotocol/client', () => ({
  discoverOAuthProtectedResourceMetadata: (...args: unknown[]) => mocks.protectedResource(...args),
  LATEST_PROTOCOL_VERSION: '2025-06-18',
}));
vi.mock('@/lib/egress-policy', () => ({
  assertResolvedPublicHostname: vi.fn(async () => undefined),
  pinnedPublicFetch: (...args: unknown[]) => mocks.pinnedFetch(...args),
}));
vi.mock('@/lib/connectors/mcp-runtime-cache', () => ({
  NeonMcpResponseCacheStore: class {
    async get(key: { params: string }) {
      return mocks.cache.get(key.params);
    }
    async set(key: { params: string }, entry: { value: string }) {
      mocks.cache.set(key.params, entry);
      return 1;
    }
  },
}));

import { directoryTargetFor } from '../mcp-directory-targets';
import {
  parseChallengeScheme,
  registryEntryUrl,
  resolveConnectorCredentialSpec,
} from '../mcp-credential-spec';

const FODDA_ID = 'ai.fodda/mcp-server';
const KEENABLE_ID = 'ai.keenable/web-search';
const KEENABLE_URL = 'https://api.keenable.ai/mcp?keenable_title=mcp-registry';

const FODDA_ENTRY = {
  server: {
    name: FODDA_ID,
    description: 'Expert-curated knowledge graphs.',
    version: '1.46.31',
    remotes: [
      {
        type: 'streamable-http',
        url: 'https://mcp.fodda.ai/mcp',
        headers: [
          {
            description: "Bearer token with your Fodda API key (e.g. 'Bearer sk_live_...')",
            isRequired: true,
            isSecret: true,
            name: 'Authorization',
          },
        ],
      },
      {
        type: 'sse',
        url: 'https://mcp.fodda.ai/sse',
        headers: [{ isRequired: true, isSecret: true, name: 'Authorization' }],
      },
    ],
  },
};

const KEENABLE_ENTRY = {
  server: {
    name: KEENABLE_ID,
    description: 'Web search.',
    version: '0.2.1',
    remotes: [
      {
        type: 'streamable-http',
        url: KEENABLE_URL,
        headers: [
          {
            description: 'Optional Keenable API key. Keyless by default (rate-limited).',
            isSecret: true,
            name: 'X-API-Key',
          },
        ],
      },
    ],
  },
};

function registryFetch(entries: Record<string, unknown>) {
  return vi.fn(async (input: string | URL) => {
    const url = String(input);
    for (const [id, entry] of Object.entries(entries)) {
      if (url === registryEntryUrl(id)) return Response.json(entry);
    }
    return new Response('not found', { status: 404 });
  });
}

function challenge(status: number, wwwAuthenticate: string | null) {
  return new Response(null, {
    status,
    headers: wwwAuthenticate ? { 'www-authenticate': wwwAuthenticate } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cache.clear();
  mocks.protectedResource.mockRejectedValue(new Error('no protected resource metadata'));
  mocks.pinnedFetch.mockResolvedValue(challenge(200, null));
  vi.stubGlobal('fetch', registryFetch({ [FODDA_ID]: FODDA_ENTRY, [KEENABLE_ID]: KEENABLE_ENTRY }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveConnectorCredentialSpec', () => {
  it('takes the Authorization header and Bearer prefix from the registry entry', async () => {
    const target = directoryTargetFor(
      remoteRecordFixture(FODDA_ID, 'Fodda', 'https://mcp.fodda.ai/mcp', 'api-key'),
    )!;

    const spec = await resolveConnectorCredentialSpec(target);

    expect(spec).toMatchObject({
      headerName: 'Authorization',
      valuePrefix: 'Bearer ',
      placement: 'header',
      source: 'registry',
    });
    expect(spec.description).toContain('Fodda API key');
    expect(mocks.pinnedFetch).not.toHaveBeenCalled();
  });

  it('keeps a vendor header name with no prefix when the registry declares one', async () => {
    const target = directoryTargetFor(
      remoteRecordFixture(KEENABLE_ID, 'Keenable', KEENABLE_URL, 'api-key'),
    )!;

    const spec = await resolveConnectorCredentialSpec(target);

    expect(spec).toMatchObject({ headerName: 'X-API-Key', valuePrefix: '', source: 'registry' });
  });

  it('caches the registry entry so the form does not refetch it', async () => {
    const target = directoryTargetFor(
      remoteRecordFixture(FODDA_ID, 'Fodda', 'https://mcp.fodda.ai/mcp', 'api-key'),
    )!;
    await resolveConnectorCredentialSpec(target);
    await resolveConnectorCredentialSpec(target);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reads the placement the server declares in its discovery document', async () => {
    mocks.protectedResource.mockResolvedValue({
      resource: 'https://mcp.fodda.ai/mcp',
      bearer_methods_supported: ['header'],
    });
    const target = directoryTargetFor(
      remoteRecordFixture(FODDA_ID, 'Fodda', 'https://mcp.fodda.ai/mcp', 'api-key'),
    )!;

    expect((await resolveConnectorCredentialSpec(target)).placement).toBe('header');
  });

  it('falls back to the challenge scheme when the registry says nothing', async () => {
    mocks.pinnedFetch.mockResolvedValue(challenge(401, 'Token realm="api"'));
    const target = directoryTargetFor(
      remoteRecordFixture(
        'com.example/no-headers',
        'Bare',
        'https://bare.example.com/mcp',
        'api-key',
      ),
    )!;

    const spec = await resolveConnectorCredentialSpec(target);

    expect(spec).toMatchObject({
      headerName: 'Authorization',
      valuePrefix: 'Token ',
      source: 'challenge',
    });
    expect(mocks.pinnedFetch).toHaveBeenCalledWith(
      'https://bare.example.com/mcp',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('defaults to a bearer Authorization header when nothing declares otherwise', async () => {
    const target = directoryTargetFor(
      remoteRecordFixture(
        'com.example/silent',
        'Silent',
        'https://silent.example.com/mcp',
        'api-key',
      ),
    )!;

    expect(await resolveConnectorCredentialSpec(target)).toMatchObject({
      headerName: 'Authorization',
      valuePrefix: 'Bearer ',
      placement: 'header',
      source: 'default',
    });
  });
});

describe('parseChallengeScheme', () => {
  it('reads the scheme token from a WWW-Authenticate value', () => {
    expect(parseChallengeScheme('Bearer realm="OAuth", error="invalid_token"')).toBe('Bearer');
    expect(parseChallengeScheme('  Basic realm="x"')).toBe('Basic');
    expect(parseChallengeScheme(null)).toBeNull();
    expect(parseChallengeScheme('')).toBeNull();
  });
});
