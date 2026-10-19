import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const extensionRoot = resolve(__dirname, '..');

function read(relativePath: string): string {
  return readFileSync(resolve(extensionRoot, relativePath), 'utf8');
}

describe('native messaging host installers', () => {
  it('uses a platform-neutral manifest path placeholder', () => {
    const template = read('native-host/com.agiworkforce.browser.json.template');

    expect(template).toContain('"path": "<NATIVE_HOST_PATH_PLACEHOLDER>"');
    expect(template).not.toContain('/Applications/AGI');
  });

  it('uses the external unsandboxed macOS helper and installs Chromium support', () => {
    const installer = read('scripts/install-native-host.sh');

    expect(installer).toContain(
      '$HOME/Library/Application Support/com.agiworkforce.desktop/native_messaging_host',
    );
    expect(installer).toContain('$HOME/Library/Application Support/Chromium/NativeMessagingHosts');
    expect(installer).toContain('s|<NATIVE_HOST_PATH_PLACEHOLDER>|$HOST_PATH|g');
    expect(installer).not.toContain('/Applications/AGI.app/Contents/MacOS/native_messaging_host');
  });

  it('replaces the same native host placeholder on Windows', () => {
    const installer = read('scripts/install-native-host.ps1');

    expect(installer).toContain(
      "$json.Replace('<NATIVE_HOST_PATH_PLACEHOLDER>', $escapedHostPath)",
    );
  });

  it.runIf(process.platform === 'darwin' || process.platform === 'linux')(
    'registers the host for every installed Chromium browser and creates nothing for the rest',
    () => {
      const home = mkdtempSync(join(tmpdir(), 'agi-native-host-'));
      try {
        const darwin = process.platform === 'darwin';
        const dataRoot = darwin
          ? join(home, 'Library', 'Application Support')
          : join(home, '.config');
        const installed = darwin
          ? [join(dataRoot, 'BraveSoftware', 'Brave-Browser'), join(dataRoot, 'Comet')]
          : [join(dataRoot, 'BraveSoftware', 'Brave-Browser')];
        const absent = darwin ? join(dataRoot, 'Vivaldi') : join(dataRoot, 'vivaldi');
        for (const dir of installed) mkdirSync(dir, { recursive: true });
        const host = join(home, 'host');
        writeFileSync(host, '#!/bin/sh\n');
        chmodSync(host, 0o755);
        execFileSync(
          'bash',
          [resolve(extensionRoot, 'scripts/install-native-host.sh'), 'a'.repeat(32), host],
          { env: { ...process.env, HOME: home }, stdio: 'pipe' },
        );
        for (const dir of installed) {
          const manifest = JSON.parse(
            readFileSync(
              join(dir, 'NativeMessagingHosts', 'com.agiworkforce.browser.json'),
              'utf8',
            ),
          ) as { path: string; allowed_origins: string[] };
          expect(manifest.path).toBe(host);
          expect(manifest.allowed_origins).toEqual([`chrome-extension://${'a'.repeat(32)}/`]);
        }
        expect(existsSync(absent)).toBe(false);
      } finally {
        rmSync(home, { recursive: true, force: true });
      }
    },
  );
});
