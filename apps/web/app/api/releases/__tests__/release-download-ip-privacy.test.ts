import { createHash, createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { executeMock, getOptionalEnvMock, queryMock, withRateLimitMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
  getOptionalEnvMock: vi.fn(),
  queryMock: vi.fn(),
  withRateLimitMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: withRateLimitMock }));
vi.mock('@shared/utils/env', () => ({ getOptionalEnv: getOptionalEnvMock }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ execute: executeMock, query: queryMock }),
}));

import { __resetIpHashKeyForTests } from '@/lib/server/ip-hash';
import { GET as getLatestRelease } from '../latest/[platform]/route';

const PEPPER = 'test-pepper-value-at-least-32-characters-long';
const CLIENT_IP = '203.0.113.7';

function makeRequest(headers: Record<string, string>): never {
  return new Request('https://agi.example/api/releases/latest/linux-x86_64', {
    method: 'GET',
    headers,
  }) as never;
}

async function requestLatestRelease(headers: Record<string, string>) {
  const response = await getLatestRelease(makeRequest(headers), {
    params: Promise.resolve({ platform: 'linux-x86_64' }),
  });
  await vi.waitFor(() => expect(executeMock).toHaveBeenCalled());
  return response;
}

function recordedParams(): unknown[] {
  const [, params] = executeMock.mock.calls[0] as [string, unknown[]];
  return params;
}

beforeEach(() => {
  __resetIpHashKeyForTests();
  vi.stubEnv('IP_HASH_PEPPER', PEPPER);
  vi.stubEnv('LOG_SALT', '');
  vi.stubEnv('VERCEL_ENV', '');
  withRateLimitMock.mockResolvedValue(null);
  getOptionalEnvMock.mockImplementation((name: string) =>
    name === 'DATABASE_URL' ? 'postgres://neon.example/db' : undefined,
  );
  queryMock.mockResolvedValue([
    {
      id: '11111111-2222-3333-4444-555555555555',
      version: '1.10.0',
      platform: 'linux-x86_64',
      download_url: 'https://downloads.agiworkforce.com/agi.AppImage.tar.gz',
      signature: 'signature',
      notes: null,
      pub_date: '2026-07-15T00:00:00Z',
      file_size_bytes: 1024,
      is_critical: false,
    },
  ]);
  executeMock.mockResolvedValue(1);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  __resetIpHashKeyForTests();
});

describe('release download analytics IP handling', () => {
  it('sends a peppered HMAC digest to the database, never the address', async () => {
    const response = await requestLatestRelease({ 'x-forwarded-for': `${CLIENT_IP}, 10.0.0.1` });
    expect(response.status).toBe(200);

    const [sql, params] = executeMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('record_release_download');

    const digest = params[1] as string;
    expect(digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(digest).toBe(
      createHmac('sha256', PEPPER).update(`release-download\0${CLIENT_IP}`).digest('hex'),
    );

    const serialized = JSON.stringify(params);
    expect(serialized).not.toContain(CLIENT_IP);
    expect(serialized).not.toContain('10.0.0.1');
  });

  it('is not reproducible without the pepper', async () => {
    await requestLatestRelease({ 'x-real-ip': CLIENT_IP });

    const digest = recordedParams()[1] as string;
    expect(digest).toMatch(/^[0-9a-f]{64}$/u);

    const legacySalted = createHash('sha256').update(`${CLIENT_IP}agiworkforce-salt`).digest('hex');
    expect(digest).not.toBe(legacySalted);

    const otherPepper = createHmac('sha256', `${PEPPER}-rotated`)
      .update(`release-download\0${CLIENT_IP}`)
      .digest('hex');
    expect(digest).not.toBe(otherPepper);
  });

  it('fills every column slot the function declares, so referrer is not stored as region', async () => {
    await requestLatestRelease({
      'x-forwarded-for': CLIENT_IP,
      'cf-ipcountry': 'IN',
      'x-vercel-ip-country-region': 'KA',
      referer: 'https://agi.example/download',
      'user-agent': 'agi-updater/1.10.0',
    });

    const [sql, params] = executeMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('$6');
    expect(params).toHaveLength(6);
    expect(params[2]).toBe('agi-updater/1.10.0');
    expect(params[3]).toBe('IN');
    expect(params[4]).toBe('KA');
    expect(params[5]).toBe('https://agi.example/download');
  });

  it('stores no digest at all when the request carries no address', async () => {
    await requestLatestRelease({ 'user-agent': 'agi-updater/1.10.0' });

    expect(recordedParams()[1]).toBeNull();
  });

  it('keeps recording, with an unrecoverable digest, when no pepper is configured in production', async () => {
    vi.stubEnv('IP_HASH_PEPPER', '');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NODE_ENV', 'production');

    const response = await requestLatestRelease({ 'x-forwarded-for': CLIENT_IP });
    expect(response.status).toBe(200);

    const digest = recordedParams()[1] as string;
    expect(digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(JSON.stringify(recordedParams())).not.toContain(CLIENT_IP);
    expect(digest).not.toBe(
      createHash('sha256').update(`${CLIENT_IP}agiworkforce-salt`).digest('hex'),
    );
  });
});
