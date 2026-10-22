import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import {
  readSlackChannelSetting,
  readSlackChannelToolsOrNone,
  setSlackChannelPolicy,
  slackRunModeFor,
} from './slack-channel-policies';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const INSTALLATION = '0190a000-0000-7000-8000-0000000000b1';

function installerDb() {
  return {
    query: vi.fn(async () => [{ team_id: 'T1' }]),
    execute: vi.fn(async () => undefined),
  } as unknown as DatabaseAdapter & { execute: ReturnType<typeof vi.fn> };
}

describe('Slack channel policy', () => {
  it('turns a channel off, keeps it to answers, or leaves the default', () => {
    expect(slackRunModeFor('off', true)).toBeNull();
    expect(slackRunModeFor('answer', true)).toBe('answer');
    expect(slackRunModeFor('task', true)).toBe('task');
    expect(slackRunModeFor(null, true)).toBe('task');
    expect(slackRunModeFor(null, false)).toBe('answer');
  });

  it('refuses anyone but the installer', async () => {
    const db = { query: vi.fn(async () => []), execute: vi.fn() } as unknown as DatabaseAdapter;
    await expect(
      setSlackChannelPolicy(db, 'user_1', {
        installationId: '0190a000-0000-7000-8000-0000000000b1',
        channelId: 'C111',
        mode: 'off',
      }),
    ).rejects.toThrow('not one you installed');
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('writes the allowed tools when they are named', async () => {
    const db = installerDb();
    await setSlackChannelPolicy(db, 'user_1', {
      installationId: INSTALLATION,
      channelId: 'C111',
      mode: 'answer',
      tools: ['web', 'apps'],
    });
    const [sql, params] = db.execute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('allowed_tools = case when $6::boolean then excluded.allowed_tools');
    expect(params).toEqual([INSTALLATION, 'C111', 'answer', 'user_1', ['web', 'apps'], true]);
  });

  it('keeps the saved tools when only the mode changes', async () => {
    const db = installerDb();
    await setSlackChannelPolicy(db, 'user_1', {
      installationId: INSTALLATION,
      channelId: 'C111',
      mode: 'task',
    });
    const [, params] = db.execute.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual([INSTALLATION, 'C111', 'task', 'user_1', null, false]);
  });

  it('reads a channel with no row as every tool and an unknown group as none', async () => {
    const empty = { query: vi.fn(async () => []) } as unknown as DatabaseAdapter;
    await expect(readSlackChannelSetting(empty, INSTALLATION, 'C111')).resolves.toEqual({
      mode: null,
      tools: null,
    });

    const corrupt = {
      query: vi.fn(async () => [{ mode: 'task', allowed_tools: ['shell'] }]),
    } as unknown as DatabaseAdapter;
    await expect(readSlackChannelSetting(corrupt, INSTALLATION, 'C111')).resolves.toEqual({
      mode: 'task',
      tools: [],
    });
  });

  it('gives a run no tools when the policy cannot be read', async () => {
    const failing = {
      query: vi.fn(async () => {
        throw new Error('connection terminated');
      }),
    } as unknown as DatabaseAdapter;
    await expect(readSlackChannelToolsOrNone(failing, INSTALLATION, 'C111')).resolves.toEqual([]);
  });
});
