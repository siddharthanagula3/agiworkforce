import { describe, expect, it, vi } from 'vitest';
import { readEnabledPreference } from '../src/features/background/enabled-preference';

const noWait = () => Promise.resolve();

describe('readEnabledPreference', () => {
  it('follows a readable setting in both directions', async () => {
    const onUnreadable = vi.fn();

    await expect(
      readEnabledPreference({ read: async () => true, onUnreadable, wait: noWait }),
    ).resolves.toBe(true);
    await expect(
      readEnabledPreference({ read: async () => false, onUnreadable, wait: noWait }),
    ).resolves.toBe(false);
    expect(onUnreadable).not.toHaveBeenCalled();
  });

  it('stays quiet and says why when the setting can never be read', async () => {
    const failure = new Error('storage unavailable');
    const read = vi.fn().mockRejectedValue(failure);
    const onUnreadable = vi.fn();

    await expect(readEnabledPreference({ read, onUnreadable, wait: noWait })).resolves.toBe(false);
    expect(read).toHaveBeenCalledTimes(3);
    expect(onUnreadable).toHaveBeenCalledExactlyOnceWith(failure);
  });

  it('recovers when a retry can read the setting, honouring what it says', async () => {
    const onUnreadable = vi.fn();
    const turnedOff = vi.fn().mockRejectedValueOnce(new Error('busy')).mockResolvedValue(false);
    const turnedOn = vi.fn().mockRejectedValueOnce(new Error('busy')).mockResolvedValue(true);

    await expect(
      readEnabledPreference({ read: turnedOff, onUnreadable, wait: noWait }),
    ).resolves.toBe(false);
    await expect(
      readEnabledPreference({ read: turnedOn, onUnreadable, wait: noWait }),
    ).resolves.toBe(true);
    expect(onUnreadable).not.toHaveBeenCalled();
  });
});
