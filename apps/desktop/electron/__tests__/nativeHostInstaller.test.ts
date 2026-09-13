import {
  existsSync,
  mkdirSync,
  promises as fs,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NATIVE_MESSAGING_HOST_NAME } from '@agiworkforce/types';

let userData: string;
let appPath: string;
let home: string;

vi.mock('electron', () => ({
  app: {
    getPath: () => userData,
    getAppPath: () => appPath,
  },
}));

const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';

beforeAll(async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'agi-host-'));
  userData = path.join(base, 'userData');
  appPath = path.join(base, 'app');
  home = path.join(base, 'home');
  mkdirSync(userData, { recursive: true });
  mkdirSync(path.join(appPath, 'electron', 'dist'), { recursive: true });
  writeFileSync(path.join(appPath, 'electron', 'dist', 'native-host.cjs'), '// host\n');
});

afterAll(async () => {
  await fs.rm(path.dirname(userData), { recursive: true, force: true });
});

async function installer() {
  vi.resetModules();
  const store = await import('../browser/pairingStore');
  store.resetPairingCacheForTests();
  return import('../browser/hostInstaller');
}

describe('native messaging host installation', () => {
  it('names every Chromium-family manifest directory on this Mac', async () => {
    const { browserManifestDirectories } = await installer();
    const directories = browserManifestDirectories('/Users/someone');
    expect(directories).toContain(
      '/Users/someone/Library/Application Support/Google/Chrome/NativeMessagingHosts',
    );
    expect(directories).toContain(
      '/Users/someone/Library/Application Support/Chromium/NativeMessagingHosts',
    );
  });

  it('writes a launcher that runs the bundled host through Electron as Node', async () => {
    const { launcherScript } = await installer();
    const script = launcherScript({
      electronPath: '/Applications/AGI Cloud.app/Contents/MacOS/AGI Cloud',
      hostBundle: '/tmp/native-host.cjs',
      tokenFile: '/tmp/host-token',
      port: 8787,
    });
    expect(script.startsWith('#!/bin/sh')).toBe(true);
    expect(script).toContain('ELECTRON_RUN_AS_NODE=1');
    expect(script).toContain('AGI_CLOUD_BRIDGE_PORT=8787');
    expect(script).toContain("exec '/Applications/AGI Cloud.app/Contents/MacOS/AGI Cloud'");
    expect(script).toContain('"$@"');
  });

  it('allows only the paired extension in the manifest it writes', async () => {
    const { manifestDocument } = await installer();
    const parsed = JSON.parse(manifestDocument(EXTENSION_ID, '/tmp/agi-native-host')) as {
      name: string;
      type: string;
      allowed_origins: string[];
    };
    expect(parsed.name).toBe(NATIVE_MESSAGING_HOST_NAME);
    expect(parsed.type).toBe('stdio');
    expect(parsed.allowed_origins).toEqual([`chrome-extension://${EXTENSION_ID}/`]);
  });

  it('installs into an explicit profile directory and removes everything on uninstall', async () => {
    const { installNativeHost, installedManifestPaths, uninstallNativeHost, tokenFilePath } =
      await installer();
    const profile = path.join(home, 'chromium-profile', 'NativeMessagingHosts');

    const result = installNativeHost({
      extensionId: EXTENSION_ID,
      port: 8787,
      extraManifestDirectories: [profile],
      home,
    });

    const manifest = path.join(profile, `${NATIVE_MESSAGING_HOST_NAME}.json`);
    expect(result.manifestPaths).toContain(manifest);
    expect(existsSync(result.launcher)).toBe(true);
    expect(statSync(result.launcher).mode & 0o777).toBe(0o700);
    expect(statSync(tokenFilePath()).mode & 0o777).toBe(0o600);
    expect(readFileSync(manifest, 'utf8')).toContain(result.launcher);
    expect(installedManifestPaths([profile], home)).toContain(manifest);

    uninstallNativeHost([profile], home);
    expect(existsSync(manifest)).toBe(false);
    expect(existsSync(result.launcher)).toBe(false);
  });

  it('refuses to install when the host was not built into the app', async () => {
    const { installNativeHost } = await installer();
    const missing = path.join(appPath, 'electron', 'dist', 'native-host.cjs');
    await fs.rename(missing, `${missing}.bak`);
    try {
      expect(() => installNativeHost({ extensionId: EXTENSION_ID, port: 8787, home })).toThrow(
        /not built into this app/,
      );
    } finally {
      await fs.rename(`${missing}.bak`, missing);
    }
  });
});
