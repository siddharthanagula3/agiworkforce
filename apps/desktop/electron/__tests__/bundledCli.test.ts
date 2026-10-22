import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type NodeFsModule = typeof import('node:fs');

const { electronApp, accessSync, statSync, constants, executables } = vi.hoisted(() => {
  const executables = new Set<string>();
  return {
    executables,
    statSync: vi.fn(() => ({ isDirectory: () => true, isFile: () => true })),
    constants: { X_OK: 1 },
    electronApp: { isPackaged: false, getPath: () => '/tmp' },
    accessSync: vi.fn((candidate: string) => {
      if (!executables.has(candidate)) throw new Error('ENOENT');
    }),
  };
});

vi.mock('electron', () => ({ app: electronApp }));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<NodeFsModule>();
  return {
    ...actual,
    statSync,
    accessSync,
    constants,
    default: { ...actual, statSync, accessSync, constants },
  };
});
vi.mock('node:os', () => ({ default: { homedir: () => '/Users/qa' }, homedir: () => '/Users/qa' }));
vi.mock('../runtime/workspaceStore', () => ({ listRoots: () => [], getRoot: () => undefined }));
vi.mock('../runtime/gitService', () => ({
  readWorkspaceGit: async () => ({ git: { branch: 'main' } }),
}));
vi.mock('../config', () => ({ CLOUD_APP_ORIGIN: 'http://localhost:3100' }));
vi.mock('../runtime/cliAccountStore', () => ({
  shellSignedCliIn: () => false,
  rememberShellSignedCliIn: () => undefined,
}));

const RESOURCES = '/Applications/AGI Desktop.app/Contents/Resources';
const BUNDLED = `${RESOURCES}/agi-cli/agi`;
const INSTALLED = '/Users/qa/.agi/bin/agi';
const CONFIRMED = '/opt/agi/bin/agi';
const ON_PATH = '/usr/local/bin/agi';

class FakeStream extends EventEmitter {
  setEncoding(): void {}
}

function versionChild() {
  const child = Object.assign(new EventEmitter(), {
    stdout: new FakeStream(),
    stderr: new FakeStream(),
    kill: () => true,
  });
  setTimeout(() => {
    child.stdout.emit('data', 'agi 1.7.1\n');
    child.emit('exit', 0, null);
  }, 0);
  return child;
}

async function loadService(cliPath: string) {
  vi.resetModules();
  const spawn = vi.fn(() => versionChild());
  const service = await import('../runtime/developerSessionService');
  service.configureDeveloperSessions({
    emit: () => undefined,
    resolveBinary: () => cliPath,
    mayRunIn: () => true,
    spawn: spawn as never,
  });
  return { service, spawn };
}

const originalResourcesPath = process.resourcesPath;
const originalPath = process.env['PATH'];

beforeEach(() => {
  executables.clear();
  accessSync.mockClear();
  electronApp.isPackaged = true;
  Object.defineProperty(process, 'resourcesPath', { value: RESOURCES, configurable: true });
  process.env['PATH'] = '/usr/local/bin';
});

afterEach(() => {
  Object.defineProperty(process, 'resourcesPath', {
    value: originalResourcesPath,
    configurable: true,
  });
  process.env['PATH'] = originalPath;
});

describe('which agi CLI the desktop runs', () => {
  it('runs the path the user confirmed ahead of the bundled CLI and the PATH', async () => {
    executables.add(BUNDLED).add(CONFIRMED).add(ON_PATH);
    const { service, spawn } = await loadService(CONFIRMED);

    expect(service.selectRuntimeBinary()).toEqual({ binary: CONFIRMED, source: 'custom' });
    const status = await service.readDeveloperRuntimeStatus();

    expect(spawn).toHaveBeenCalledWith(CONFIRMED, ['--version'], expect.anything());
    expect(status).toMatchObject({ available: true, path: CONFIRMED, source: 'custom' });
  });

  it('runs the bundled CLI when no path is confirmed, ahead of the PATH', async () => {
    executables.add(BUNDLED).add(ON_PATH);
    const { service, spawn } = await loadService('  ');

    expect(service.selectRuntimeBinary()).toEqual({ binary: BUNDLED, source: 'bundled' });
    const status = await service.readDeveloperRuntimeStatus();

    expect(spawn).toHaveBeenCalledWith(BUNDLED, ['--version'], expect.anything());
    expect(status).toMatchObject({
      available: true,
      version: '1.7.1',
      path: BUNDLED,
      source: 'bundled',
    });
  });

  it('runs the CLI the install script put in the home folder ahead of the PATH', async () => {
    executables.add(INSTALLED).add(ON_PATH);
    const { service } = await loadService('');

    expect(service.selectRuntimeBinary()).toEqual({ binary: INSTALLED, source: 'path' });
  });

  it('falls back to agi on the PATH when nothing is confirmed, bundled or installed', async () => {
    executables.add(ON_PATH);
    const { service, spawn } = await loadService('');

    expect(service.selectRuntimeBinary()).toEqual({ binary: 'agi', source: 'path' });
    const status = await service.readDeveloperRuntimeStatus();

    expect(spawn).toHaveBeenCalledWith(ON_PATH, ['--version'], expect.anything());
    expect(status).toMatchObject({ path: ON_PATH, source: 'path' });
  });

  it('reports where it looked when the CLI is nowhere', async () => {
    const { service } = await loadService('');

    const status = await service.readDeveloperRuntimeStatus();

    expect(status).toMatchObject({ available: false, path: null, source: 'path' });
  });

  it('never treats Electron’s own resources directory as a bundle in a development run', async () => {
    electronApp.isPackaged = false;
    executables.add(BUNDLED).add(ON_PATH);
    const { service } = await loadService('');

    expect(service.selectRuntimeBinary()).toEqual({ binary: 'agi', source: 'path' });
    expect(accessSync).not.toHaveBeenCalledWith(BUNDLED, constants.X_OK);
  });
});

describe('the packaged app carries the CLI', () => {
  const builderConfig = readFileSync(resolve(process.cwd(), 'electron-builder.yml'), 'utf8');
  const bundler = readFileSync(resolve(process.cwd(), 'electron/bundleBinaries.mjs'), 'utf8');

  it('copies the per-architecture CLI into Contents/Resources as agi-cli/agi', () => {
    expect(builderConfig).toMatch(
      /extraResources:[\s\S]*- from: electron\/dist\/bin\/\$\{arch\}\/agi\n\s+to: agi-cli\/agi\n/,
    );
    expect(builderConfig).toContain("'!electron/dist/bin/**'");
  });

  it('builds the CLI for the architecture being packed, before electron-builder packs it', () => {
    expect(builderConfig).toMatch(/^beforePack: \.\/electron\/bundleBinaries\.mjs$/m);
    expect(bundler).toContain("rust: 'aarch64-apple-darwin'");
    expect(bundler).toContain("rust: 'x86_64-apple-darwin'");
    expect(bundler).toMatch(/'-p',\s+'agiworkforce-cli',\s+'--bin',\s+'agi'/);
    expect(bundler).toContain("path.join(__dirname, 'dist', 'bin', arch)");
  });
});
