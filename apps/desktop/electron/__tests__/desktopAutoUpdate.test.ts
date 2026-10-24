import { beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (...args: unknown[]) => void;

const handlers = new Map<string, Listener>();

vi.mock('electron', () => ({
  app: { isPackaged: true, getVersion: () => '1.2.0' },
  autoUpdater: {
    setFeedURL: vi.fn(),
    on: vi.fn((event: string, listener: Listener) => handlers.set(event, listener)),
    checkForUpdates: vi.fn(),
    quitAndInstall: vi.fn(),
  },
}));
vi.mock('../runtime/desktopTelemetryService', () => ({ recordDesktopEvent: vi.fn() }));

const platform = Object.getOwnPropertyDescriptor(process, 'platform');
Object.defineProperty(process, 'platform', { value: 'darwin' });
const update = await import('../desktopAutoUpdate');
if (platform) Object.defineProperty(process, 'platform', platform);

describe('an update download that fails', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('starts out as not failed', () => {
    update.startAutoUpdate('arm64', vi.fn());

    expect(update.autoUpdateDownloadFailed()).toBe(false);
  });

  it('is tracked from the updater error until the next download begins', () => {
    handlers.get('error')?.(new Error('network'));
    expect(update.autoUpdateDownloadFailed()).toBe(true);

    handlers.get('update-available')?.();
    expect(update.autoUpdateDownloadFailed()).toBe(false);
  });

  it('is cleared for good once an update has downloaded', () => {
    handlers.get('error')?.(new Error('network'));
    handlers.get('update-downloaded')?.({}, '', '1.3.0');

    expect(update.autoUpdateDownloadFailed()).toBe(false);
    expect(update.downloadedUpdate()).toBe('1.3.0');

    handlers.get('error')?.(new Error('later check failed'));
    expect(update.autoUpdateDownloadFailed()).toBe(false);
  });
});
