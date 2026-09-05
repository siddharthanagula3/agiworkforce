import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const query = vi.fn(async (): Promise<Record<string, unknown>[]> => []);
const execute = vi.fn(async () => 0);
const callerDb = { query, execute } as unknown as DatabaseAdapter;

import {
  backfillDisplayNameFromUpstream,
  buildCustomInstructionsPreamble,
  getOnboardingStatus,
  readUserIdentity,
} from '../user-identity';

describe('backfillDisplayNameFromUpstream', () => {
  it('writes the lazily created profile row on the connection it was given', async () => {
    query.mockClear();
    await backfillDisplayNameFromUpstream(callerDb, 'user-42', 'Ada Lovelace');

    expect(query).toHaveBeenCalledWith(expect.stringContaining('insert into public.profiles'), [
      'user-42',
      'Ada Lovelace',
    ]);
  });

  it('skips the write for a blank candidate name', async () => {
    execute.mockClear();
    query.mockClear();

    await backfillDisplayNameFromUpstream(callerDb, 'user-42', '   ');

    expect(execute).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
});

describe('readUserIdentity', () => {
  it('reads profiles on the caller connection and constrains by the owner', async () => {
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

    const identity = await readUserIdentity(callerDb, 'user-42');

    expect(identity.displayName).toBe('Ada Lovelace');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('select id, email, display_name, avatar_url, routing_preferences'),
      ['user-42'],
    );
  });
});

describe('buildCustomInstructionsPreamble', () => {
  it('reads user_settings on the caller connection', async () => {
    query.mockClear();
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('select settings from public.user_settings')) {
        return [{ settings: { general: { instructions: 'Be concise.' } } }];
      }
      return [];
    });

    const preamble = await buildCustomInstructionsPreamble(callerDb, 'user-42');

    expect(preamble).toContain('Be concise.');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('select settings from public.user_settings'),
      ['user-42'],
    );
  });
});

describe('getOnboardingStatus', () => {
  it('reports first-run incomplete when nothing has been persisted yet', async () => {
    query.mockClear();
    query.mockImplementation(async (sql: string) =>
      sql.includes('select settings from public.user_settings') ? [{ settings: {} }] : [],
    );

    const status = await getOnboardingStatus(callerDb, 'user-42');

    expect(status).toEqual({ completed: false, primaryUseCase: null });
  });

  it('reports completion and the chosen use case once persisted', async () => {
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

    const status = await getOnboardingStatus(callerDb, 'user-42');

    expect(status).toEqual({ completed: true, primaryUseCase: 'code' });
  });
});
