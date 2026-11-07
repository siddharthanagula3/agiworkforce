import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { autoUpdater } from 'electron';

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
let update: typeof import('../desktopAutoUpdate');
const onReady = vi.fn();

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  handlers.clear();
  Object.defineProperty(process, 'platform', { value: 'darwin' });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  update = await import('../desktopAutoUpdate');
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
afterAll(() => {
  if (platform) Object.defineProperty(process, 'platform', platform);
});

describe('native updater state', () => {
  it('distinguishes capability, checks and downloads without overlapping attempts', () => {
    expect(update.autoUpdateState()).toBe('idle');
    update.startAutoUpdate('arm64', onReady);
    expect(update.autoUpdateState()).toBe('checking');
    update.checkForAutoUpdate();
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    handlers.get('update-available')?.();
    expect(update.autoUpdateState()).toBe('downloading');
    update.checkForAutoUpdate();
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    handlers.get('update-not-available')?.();
    expect(update.autoUpdateState()).toBe('idle');
  });

  it('records synchronous check failures and allows retry', () => {
    vi.mocked(autoUpdater.checkForUpdates).mockImplementationOnce(() => { throw new Error('offline'); });
    update.startAutoUpdate('arm64', onReady);
    expect(update.autoUpdateDownloadFailed()).toBe(true);
    update.checkForAutoUpdate();
    expect(update.autoUpdateState()).toBe('checking');
  });

  it('records feed configuration failures without claiming download progress', () => {
    vi.mocked(autoUpdater.setFeedURL).mockImplementationOnce(() => { throw new Error('bad feed'); });
    update.startAutoUpdate('arm64', onReady);
    expect(update.autoUpdateState()).toBe('failed');
    update.startAutoUpdate('arm64', onReady);
    update.checkForAutoUpdate();
    expect(autoUpdater.setFeedURL).toHaveBeenCalledTimes(1);
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  it('preserves a staged package across later events', () => {
    update.startAutoUpdate('arm64', onReady);
    handlers.get('update-downloaded')?.({}, '', '1.3.0');
    for (const event of ['error', 'checking-for-update', 'update-not-available', 'update-available']) {
      handlers.get(event)?.(new Error('late'));
      expect(update.autoUpdateState()).toBe('ready');
      expect(update.downloadedUpdate()).toBe('1.3.0');
    }
    update.checkForAutoUpdate();
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(update.autoUpdateDownloadFailed()).toBe(false);
    expect(onReady).toHaveBeenCalledWith('1.3.0');
  });

  it.each([undefined, '', 'Release title', '1.2.0'])('preserves unknown staged identity for %s', (name) => {
    update.startAutoUpdate('arm64', onReady);
    handlers.get('update-downloaded')?.({}, '', name);
    expect(update.autoUpdateState()).toBe('ready');
    expect(update.downloadedUpdate()).toBe('');
    expect(onReady).toHaveBeenCalledWith('');
    expect(update.installDownloadedUpdate()).toBe(true);
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it('reports unsupported native updates without attempting a check', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    update.startAutoUpdate('arm64', onReady);
    expect(update.autoUpdateState()).toBe('unsupported');
    expect(update.installDownloadedUpdate()).toBe(false);
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });
});
