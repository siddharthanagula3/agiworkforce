import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const query = vi.fn(
  async (sql: string): Promise<Record<string, unknown>[]> =>
    sql.includes("set_config('request.jwt.claim.sub'") ? [] : [],
);
const execute = vi.fn(async () => 0);
const tx = { query, execute } as unknown as DatabaseAdapter;
const serviceDb = {
  transaction: vi.fn(async (callback: (db: DatabaseAdapter) => Promise<unknown>) => callback(tx)),
} as unknown as DatabaseAdapter;

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => serviceDb),
}));

import {
  backfillDisplayNameFromUpstream,
  buildCustomInstructionsPreamble,
  getOnboardingStatus,
  readUserIdentity,
} from '../user-identity';

describe('backfillDisplayNameFromUpstream', () => {
  it('binds the signed-in user before writing the lazily created profile row', async () => {
    await backfillDisplayNameFromUpstream('user-42', 'Ada Lovelace');

    expect(execute).toHaveBeenCalledWith('set local role app_rls');
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("set_config('request.jwt.claim.sub', $1, true)"),
      ['user-42', ''],
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('insert into public.profiles'),
      ['user-42', 'Ada Lovelace'],
    );
  });

  it('skips the write for a blank candidate name', async () => {
    execute.mockClear();
    query.mockClear();

    await backfillDisplayNameFromUpstream('user-42', '   ');

    expect(execute).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
});

describe('readUserIdentity binds the caller before reading the profile row', () => {
  it('reads profiles through the claimed user scope', async () => {
    execute.mockClear();
    query.mockClear();
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('select id, email, display_name, avatar_url, routing_preferences')) {
        return [
          {
            id: 'user-42',
            email: 'ada@example.com',
            display_name: 'Ada Lovelace',
            avatar_url: null,
            routing_preferences: null,
          },
        ];
      }
      return [];
    });

    const identity = await readUserIdentity('user-42');

    expect(identity.displayName).toBe('Ada Lovelace');
    expect(execute).toHaveBeenCalledWith('set local role app_rls');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("set_config('request.jwt.claim.sub', $1, true)"),
      ['user-42', ''],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('select id, email, display_name, avatar_url, routing_preferences'),
      ['user-42'],
    );
  });
});

describe('buildCustomInstructionsPreamble binds the caller before reading settings', () => {
  it('reads user_settings through the claimed user scope', async () => {
    execute.mockClear();
    query.mockClear();
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('select settings from public.user_settings')) {
        return [{ settings: { general: { instructions: 'Be concise.' } } }];
      }
      return [];
    });

    const preamble = await buildCustomInstructionsPreamble('user-42');

    expect(preamble).toContain('Be concise.');
    expect(execute).toHaveBeenCalledWith('set local role app_rls');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("set_config('request.jwt.claim.sub', $1, true)"),
      ['user-42', ''],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('select settings from public.user_settings'),
      ['user-42'],
    );
  });
});

describe('getOnboardingStatus', () => {
  it('reports first-run incomplete when nothing has been persisted yet', async () => {
    execute.mockClear();
    query.mockClear();
    query.mockImplementation(async (sql: string) =>
      sql.includes('select settings from public.user_settings') ? [{ settings: {} }] : [],
    );

    const status = await getOnboardingStatus('user-42');

    expect(status).toEqual({ completed: false, primaryUseCase: null });
  });

  it('reports completion and the chosen use case once persisted', async () => {
    execute.mockClear();
    query.mockClear();
    query.mockImplementation(async (sql: string) =>
      sql.includes('select settings from public.user_settings')
        ? [
            {
              settings: {
                general: {
                  onboardingCompletedAt: '2026-09-04T00:00:00.000Z',
                  primaryUseCase: 'code',
                },
              },
            },
          ]
        : [],
    );

    const status = await getOnboardingStatus('user-42');

    expect(status).toEqual({ completed: true, primaryUseCase: 'code' });
  });
});
