import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ElectronHostBridge } from '../bridgeContract';
import { onGlobalVoiceHotkey } from '../voice-hotkey';

function installHost(bridge: Partial<ElectronHostBridge>): void {
  Object.defineProperty(window, 'agiHost', { value: bridge, configurable: true });
}

afterEach(() => {
  Reflect.deleteProperty(window, 'agiHost');
});

describe('onGlobalVoiceHotkey', () => {
  it('forwards a press from the shell and returns the shell unsubscribe', () => {
    const unsubscribe = vi.fn();
    const presses: (() => void)[] = [];
    installHost({
      onVoiceHotkey: (callback) => {
        presses.push(callback);
        return unsubscribe;
      },
    });

    const handler = vi.fn();
    const dispose = onGlobalVoiceHotkey(handler);
    presses.forEach((press) => press());

    expect(handler).toHaveBeenCalledTimes(1);
    dispose();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('is inert with no shell, so the Tauri build subscribes to nothing', () => {
    expect(() => onGlobalVoiceHotkey(vi.fn())()).not.toThrow();
  });

  it('is inert against a shell too old to carry the channel', () => {
    installHost({});
    expect(() => onGlobalVoiceHotkey(vi.fn())()).not.toThrow();
  });
});
