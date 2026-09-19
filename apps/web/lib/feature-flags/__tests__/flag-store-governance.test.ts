import { describe, expect, it, vi } from 'vitest';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn() }));

import { insertFlagDefinition, listFlagDefinitions } from '../flag-store';

const ROW = {
  key: 'composer.voice_mode',
  description: 'Voice mode',
  kill_switch: false,
  variants: ['on', 'off'],
  default_variant: 'off',
  rules: [],
  expires_at: null,
  maturity: 'beta' as const,
  release_channel: 'beta' as const,
  availability: 'limited' as const,
  owner_name: 'voice-team',
  archived_at: null,
  version: 1,
  created_at: '2026-09-19T00:00:00.000Z',
  updated_at: '2026-09-19T00:00:00.000Z',
};

describe('feature flag governance persistence', () => {
  it('writes every governance field instead of discarding it after API validation', async () => {
    const query = vi.fn(async () => [ROW]);

    await insertFlagDefinition(
      {
        key: ROW.key,
        description: ROW.description,
        killSwitch: false,
        variants: ['on', 'off'],
        defaultVariant: 'off',
        rules: [],
        expiresAt: null,
        maturity: 'beta',
        channel: 'beta',
        availability: 'limited',
        owner: 'voice-team',
      },
      { query } as unknown as DatabaseAdapter,
    );

    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('maturity, release_channel, availability, owner_name');
    expect(params.slice(7)).toEqual(['beta', 'beta', 'limited', 'voice-team']);
  });

  it('restores persisted governance fields into the returned definition', async () => {
    const definitions = await listFlagDefinitions({}, {
      query: vi.fn(async () => [ROW]),
    } as unknown as DatabaseAdapter);

    expect(definitions[0]).toMatchObject({
      maturity: 'beta',
      channel: 'beta',
      availability: 'limited',
      owner: 'voice-team',
    });
  });
});
