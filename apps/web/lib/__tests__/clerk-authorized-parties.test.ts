import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { getClerkAuthorizedParties } from '@/lib/clerk-authorized-parties';

const ENV_KEYS = ['CLERK_AUTHORIZED_PARTIES', 'NEXT_PUBLIC_APP_URL'] as const;
const saved: Record<string, string | undefined> = {};

describe('getClerkAuthorizedParties', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('returns the configured allowlist, trimmed, with empty entries dropped', () => {
    process.env['CLERK_AUTHORIZED_PARTIES'] =
      ' https://app.example.com , ,https://admin.example.com';
    expect(getClerkAuthorizedParties()).toEqual([
      'https://app.example.com',
      'https://admin.example.com',
    ]);
  });

  it('falls back to this deployment origin when CLERK_AUTHORIZED_PARTIES is unset', () => {
    process.env['NEXT_PUBLIC_APP_URL'] = 'https://app.example.com/dashboard/';
    expect(getClerkAuthorizedParties()).toEqual(['https://app.example.com']);
  });

  it('treats a separator-only allowlist as unset and still binds to the deployment origin', () => {
    process.env['CLERK_AUTHORIZED_PARTIES'] = ' , , ';
    process.env['NEXT_PUBLIC_APP_URL'] = 'https://app.example.com';
    expect(getClerkAuthorizedParties()).toEqual(['https://app.example.com']);
  });

  it('throws instead of returning an empty list when nothing identifies this origin', () => {
    expect(() => getClerkAuthorizedParties()).toThrow(/authorized-party/i);
  });

  it('throws when NEXT_PUBLIC_APP_URL is not an absolute URL', () => {
    process.env['NEXT_PUBLIC_APP_URL'] = 'app.example.com';
    expect(() => getClerkAuthorizedParties()).toThrow(/authorized-party/i);
  });

  it('never resolves to an empty list for any configuration that resolves at all', () => {
    const configurations: Array<Partial<Record<(typeof ENV_KEYS)[number], string>>> = [
      { CLERK_AUTHORIZED_PARTIES: 'https://a.example.com' },
      { NEXT_PUBLIC_APP_URL: 'https://b.example.com' },
      { CLERK_AUTHORIZED_PARTIES: '', NEXT_PUBLIC_APP_URL: 'https://c.example.com' },
      {
        CLERK_AUTHORIZED_PARTIES: 'https://d.example.com',
        NEXT_PUBLIC_APP_URL: 'https://e.example.com',
      },
    ];

    for (const configuration of configurations) {
      for (const key of ENV_KEYS) delete process.env[key];
      Object.assign(process.env, configuration);
      expect(getClerkAuthorizedParties().length).toBeGreaterThan(0);
    }
  });
});
