import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { directoryRecord } from './fixtures';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  assertResolvedPublicHostname: vi.fn(async (..._args: unknown[]) => undefined),
  discoverOAuthServerInfo: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({
    query: (...args: unknown[]) => mocks.query(...args),
    execute: (...args: unknown[]) => mocks.execute(...args),
  }),
}));
vi.mock('@/lib/egress-policy', () => ({
  assertResolvedPublicHostname: (...args: unknown[]) => mocks.assertResolvedPublicHostname(...args),
}));
vi.mock('@modelcontextprotocol/client', () => ({
  discoverOAuthServerInfo: (...args: unknown[]) => mocks.discoverOAuthServerInfo(...args),
}));

import {
  AUTH_PROBE_TIMEOUT_MS,
  authModeFromProbe,
  isAuthProbeCandidate,
  probeRemoteAuthMode,
  resolveAuthModeForRecord,
} from '@/lib/connectors/directory/auth-probe';
import type { DirectoryRecord } from '@/lib/connectors/directory/types';

describe('probeRemoteAuthMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertResolvedPublicHostname.mockResolvedValue(undefined);
    mocks.query.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports open when discovery finds no protected-resource metadata', async () => {
    mocks.discoverOAuthServerInfo.mockResolvedValueOnce({});

    await expect(probeRemoteAuthMode('https://open.example.com/mcp')).resolves.toBe('open');
  });

  it('reports oauth-required when discovery finds resource metadata', async () => {
    mocks.discoverOAuthServerInfo.mockResolvedValueOnce({ resourceMetadata: {} });

    await expect(probeRemoteAuthMode('https://protected.example.com/mcp')).resolves.toBe(
      'oauth-required',
    );
  });

  it('reports unresolved when the hostname fails the egress guard, without calling discovery', async () => {
    mocks.assertResolvedPublicHostname.mockRejectedValueOnce(new Error('internal host'));

    await expect(probeRemoteAuthMode('https://169.254.169.254/mcp')).resolves.toBe('unresolved');
    expect(mocks.discoverOAuthServerInfo).not.toHaveBeenCalled();
  });

  it('reports unresolved when hostname resolution hangs past the probe timeout', async () => {
    vi.useFakeTimers();
    mocks.assertResolvedPublicHostname.mockReturnValueOnce(new Promise(() => {}));

    const outcome = probeRemoteAuthMode('https://slow-dns.example.com/mcp');
    await vi.advanceTimersByTimeAsync(AUTH_PROBE_TIMEOUT_MS);

    await expect(outcome).resolves.toBe('unresolved');
    expect(mocks.discoverOAuthServerInfo).not.toHaveBeenCalled();
  });

  it('reuses a cached verdict instead of probing again', async () => {
    mocks.query.mockResolvedValueOnce([
      { value: 'open', stamp: '1', expires_at_ms: String(Date.now() + 60_000), scope: 'public' },
    ]);

    await expect(probeRemoteAuthMode('https://cached.example.com/mcp')).resolves.toBe('open');
    expect(mocks.discoverOAuthServerInfo).not.toHaveBeenCalled();
  });
});

describe('authModeFromProbe', () => {
  it('maps every probe outcome to a directory auth mode', () => {
    expect(authModeFromProbe('open')).toBe('none');
    expect(authModeFromProbe('oauth-required')).toBe('oauth');
    expect(authModeFromProbe('unresolved')).toBe('unknown');
  });
});

describe('isAuthProbeCandidate', () => {
  it('accepts only unknown records with a network remote', () => {
    expect(isAuthProbeCandidate(directoryRecord({ id: 'http' }))).toBe(true);
    expect(isAuthProbeCandidate(directoryRecord({ id: 'known', authMode: 'oauth' }))).toBe(false);
    expect(
      isAuthProbeCandidate(
        directoryRecord({ id: 'stdio', remotes: [{ url: 'stdio://x', transport: 'stdio' }] }),
      ),
    ).toBe(false);
    expect(isAuthProbeCandidate(directoryRecord({ id: 'packages', remotes: [] }))).toBe(false);
  });
});

describe('resolveAuthModeForRecord', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertResolvedPublicHostname.mockResolvedValue(undefined);
    mocks.query.mockResolvedValue([]);
  });

  it('leaves an already-resolved record untouched', async () => {
    const record: DirectoryRecord = directoryRecord({
      id: 'x',
      authMode: 'api-key',
      connectable: 'api-key-form',
      remotes: [],
    });

    await expect(resolveAuthModeForRecord(record)).resolves.toBe(record);
    expect(mocks.discoverOAuthServerInfo).not.toHaveBeenCalled();
  });

  it('upgrades an unknown record once discovery resolves it', async () => {
    mocks.discoverOAuthServerInfo.mockResolvedValueOnce({});
    const record = directoryRecord({
      id: 'x',
      remotes: [{ url: 'https://open.example.com/mcp', transport: 'streamable-http' }],
    });

    const resolved = await resolveAuthModeForRecord(record);
    expect(resolved.authMode).toBe('none');
    expect(resolved.connectable).toBe('connect');
  });

  it('leaves a stdio-only record untouched without probing', async () => {
    const record = directoryRecord({
      id: 'local',
      remotes: [{ url: 'stdio://local', transport: 'stdio' }],
    });

    await expect(resolveAuthModeForRecord(record)).resolves.toBe(record);
    expect(mocks.assertResolvedPublicHostname).not.toHaveBeenCalled();
    expect(mocks.discoverOAuthServerInfo).not.toHaveBeenCalled();
  });

  it('probes the first network remote even when a stdio remote is listed first', async () => {
    mocks.discoverOAuthServerInfo.mockResolvedValueOnce({ resourceMetadata: {} });
    const record = directoryRecord({
      id: 'mixed',
      remotes: [
        { url: 'stdio://local', transport: 'stdio' },
        { url: 'https://remote.example.com/mcp', transport: 'streamable-http' },
      ],
    });

    const resolved = await resolveAuthModeForRecord(record);

    expect(mocks.discoverOAuthServerInfo).toHaveBeenCalledWith('https://remote.example.com/mcp');
    expect(resolved.authMode).toBe('oauth');
    expect(resolved.connectable).toBe('connect');
  });
});
