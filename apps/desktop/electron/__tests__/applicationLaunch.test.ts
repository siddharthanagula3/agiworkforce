import { beforeEach, describe, expect, it, vi } from 'vitest';

type ChildProcessModule = typeof import('node:child_process');
type FsPromisesModule = typeof import('node:fs/promises');

type Reply = { error: Error | null; stdout: string };
const replies = new Map<string, Reply>();
const calls: Array<{ file: string; args: string[] }> = [];
const folders = new Map<string, string[]>();

const execFile = vi.fn(
  (
    file: string,
    args: string[],
    _options: unknown,
    done: (error: Error | null, stdout: string) => void,
  ) => {
    calls.push({ file, args });
    const reply = replies.get(`${file} ${args.join(' ')}`) ?? {
      error: new Error('not found'),
      stdout: '',
    };
    done(reply.error, reply.stdout);
  },
);
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<ChildProcessModule>();
  return { ...actual, default: { ...actual, execFile }, execFile };
});

const readdir = vi.fn(async (folder: string) => {
  const entries = folders.get(folder);
  if (!entries) throw new Error('ENOENT');
  return entries;
});
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<FsPromisesModule>();
  return { ...actual, default: { ...actual, readdir }, readdir };
});

const requireAvailable = vi.fn();
const computerUseSupport = vi.fn<() => { supported: true } | { supported: false; reason: string }>(
  () => ({ supported: true }),
);
vi.mock('../runtime/computerUseService', () => ({
  ComputerUseRefused: class extends Error {
    readonly reason: string;
    constructor(reason: string, message: string) {
      super(message);
      this.reason = reason;
    }
  },
  computerUseSupport,
  requireAvailable,
}));

const { findInstalledApplication, launchApplication, listInstalledApplications } =
  await import('../runtime/applicationLaunch');

const OWN_BUNDLE = '/Applications/AGI Desktop.app';

function plist(appPath: string, bundleId: string): void {
  replies.set(
    `/usr/bin/plutil -extract CFBundleIdentifier raw -o - ${appPath}/Contents/Info.plist`,
    { error: null, stdout: `${bundleId}\n` },
  );
}

beforeEach(() => {
  replies.clear();
  calls.length = 0;
  folders.clear();
  requireAvailable.mockReset();
  readdir.mockClear();
  computerUseSupport.mockReturnValue({ supported: true });
  Object.defineProperty(process, 'execPath', {
    configurable: true,
    value: `${OWN_BUNDLE}/Contents/MacOS/AGI Desktop`,
  });
  folders.set('/Applications', ['AGI Desktop.app', 'Visual Studio Code.app']);
  folders.set('/System/Applications', ['Notes.app', 'Calculator.app']);
  plist(OWN_BUNDLE, 'com.agiworkforce.desktop.cloud');
  plist('/System/Applications/Notes.app', 'com.apple.Notes');
  plist('/Applications/Visual Studio Code.app', 'com.microsoft.VSCode');
});

describe('finding the app a step names', () => {
  it('finds an app by its name in Applications whatever its case', async () => {
    expect(await findInstalledApplication('notes')).toEqual({
      name: 'Notes',
      bundleId: 'com.apple.Notes',
      path: '/System/Applications/Notes.app',
    });
  });

  it('finds an app by its bundle id through Spotlight', async () => {
    replies.set('/usr/bin/mdfind kMDItemCFBundleIdentifier == "com.microsoft.VSCode"', {
      error: null,
      stdout: '/Applications/Visual Studio Code.app\n',
    });

    expect(await findInstalledApplication('com.microsoft.VSCode')).toMatchObject({
      name: 'Visual Studio Code',
      bundleId: 'com.microsoft.VSCode',
    });
  });

  it('refuses an app that is not installed', async () => {
    await expect(findInstalledApplication('Nope')).rejects.toMatchObject({
      reason: 'failed',
      message: expect.stringContaining('No app called "Nope" is installed'),
    });
  });

  it('refuses AGI Desktop itself, by place and by bundle id', async () => {
    await expect(findInstalledApplication('AGI Desktop')).rejects.toMatchObject({
      reason: 'failed',
    });

    folders.set('/Applications/Utilities', ['AGI Copy.app']);
    plist('/Applications/Utilities/AGI Copy.app', 'com.agiworkforce.desktop.cloud');
    await expect(findInstalledApplication('AGI Copy')).rejects.toMatchObject({ reason: 'failed' });
  });

  it('looks nothing up when computer use cannot run here', async () => {
    requireAvailable.mockImplementation(() => {
      throw new Error('Controlling the mouse and keyboard is supported on macOS only.');
    });

    await expect(findInstalledApplication('Notes')).rejects.toThrow('macOS only');
    expect(calls).toEqual([]);
  });
});

describe('opening the app that was asked about', () => {
  it('opens the exact bundle that was resolved and gated', async () => {
    replies.set('/usr/bin/open -a /System/Applications/Notes.app', { error: null, stdout: '' });

    await launchApplication({
      name: 'Notes',
      bundleId: 'com.apple.Notes',
      path: '/System/Applications/Notes.app',
    });

    expect(calls).toEqual([
      { file: '/usr/bin/open', args: ['-a', '/System/Applications/Notes.app'] },
    ]);
  });

  it('reports an app that did not open', async () => {
    await expect(
      launchApplication({ name: 'Notes', bundleId: 'com.apple.Notes', path: '/gone/Notes.app' }),
    ).rejects.toMatchObject({ reason: 'failed', message: 'Notes did not open.' });
  });
});

describe('listing the apps a person can refuse', () => {
  it('lists installed apps once each by name, Finder included and AGI Desktop left out', async () => {
    folders.set('/System/Library/CoreServices', ['Finder.app', 'Dock.app']);
    folders.set('/Applications/Utilities', ['notes.txt', 'Notes.app']);
    plist('/System/Library/CoreServices/Finder.app', 'com.apple.finder');
    plist('/System/Library/CoreServices/Dock.app', 'com.apple.dock');
    plist('/Applications/Utilities/Notes.app', 'com.apple.Notes');

    expect(await listInstalledApplications()).toEqual([
      {
        name: 'Finder',
        bundleId: 'com.apple.finder',
        path: '/System/Library/CoreServices/Finder.app',
      },
      { name: 'Notes', bundleId: 'com.apple.Notes', path: '/Applications/Utilities/Notes.app' },
      {
        name: 'Visual Studio Code',
        bundleId: 'com.microsoft.VSCode',
        path: '/Applications/Visual Studio Code.app',
      },
    ]);
    expect(readdir).not.toHaveBeenCalledWith('/System/Library/CoreServices');
  });

  it('leaves out a bundle whose id cannot be read', async () => {
    folders.set('/Applications', ['Broken.app']);

    expect((await listInstalledApplications()).map((app) => app.name)).toEqual(['Notes']);
  });

  it('reads nothing on a computer where computer use cannot run', async () => {
    computerUseSupport.mockReturnValue({ supported: false, reason: 'macOS only' });

    await expect(listInstalledApplications()).rejects.toMatchObject({
      reason: 'unsupported',
      message: 'macOS only',
    });
    expect(calls).toEqual([]);
    expect(readdir).not.toHaveBeenCalled();
  });
});
