import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({
  isTrustedAccessibilityClient: vi.fn(() => false),
  requests: [] as Array<Record<string, unknown>>,
  reply: null as null | ((request: Record<string, unknown>) => string),
}));

vi.mock('electron', () => ({
  app: { isPackaged: true },
  desktopCapturer: { getSources: vi.fn() },
  screen: {},
  systemPreferences: {
    isTrustedAccessibilityClient: host.isTrustedAccessibilityClient,
    getMediaAccessStatus: () => 'granted',
  },
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const helperOnDisk = { existsSync: () => true, statSync: () => ({ mtimeMs: 1 }) };
  return { ...actual, ...helperOnDisk, default: { ...actual, ...helperOnDisk } };
});

function spawnHelper() {
  const child = Object.assign(new EventEmitter(), {
    killed: false,
    exitCode: null,
    kill: vi.fn(),
    stdout: Object.assign(new EventEmitter(), { setEncoding: vi.fn() }),
    stderr: new EventEmitter(),
    stdin: {
      write: (line: string) => {
        const request = JSON.parse(line) as Record<string, unknown>;
        host.requests.push(request);
        const answer = host.reply?.(request);
        if (answer !== undefined) queueMicrotask(() => child.stdout.emit('data', `${answer}\n`));
        return true;
      },
    },
  });
  return child;
}

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: spawnHelper, default: { ...actual, spawn: spawnHelper } };
});

const { secureInputActive, stopComputerUseHelper } = await import('../runtime/computerUseService');

const realPlatform = process.platform;
const realResourcesPath = process.resourcesPath;

beforeEach(() => {
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
  Object.defineProperty(process, 'resourcesPath', { value: '/app', configurable: true });
  host.requests.length = 0;
  host.isTrustedAccessibilityClient.mockClear();
});

afterEach(() => {
  stopComputerUseHelper();
  Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true });
  Object.defineProperty(process, 'resourcesPath', {
    value: realResourcesPath,
    configurable: true,
  });
});

describe('the secure input check used by screen recording', () => {
  it('asks the helper for the front app and never for Accessibility', async () => {
    host.reply = () => JSON.stringify({ ok: true, front: { app: 'Safari', secureInput: true } });

    await expect(secureInputActive()).resolves.toBe(true);

    expect(host.requests).toEqual([{ action: 'front' }]);
    expect(host.isTrustedAccessibilityClient).not.toHaveBeenCalled();
  });

  it('reads off when the front app holds no secure input', async () => {
    host.reply = () => JSON.stringify({ ok: true, front: { app: 'Notes' } });

    await expect(secureInputActive()).resolves.toBe(false);
  });

  it('cannot vouch for a reply that names no front app', async () => {
    host.reply = () => JSON.stringify({ ok: true, front: {} });

    await expect(secureInputActive()).rejects.toThrow();
  });

  it('refuses off macOS without starting the helper', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    host.reply = () => JSON.stringify({ ok: true, front: { app: 'Notes' } });

    await expect(secureInputActive()).rejects.toThrow();
    expect(host.requests).toEqual([]);
  });
});
