import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { setSlackChannelPolicy, slackRunModeFor } from './slack-channel-policies';

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
});
