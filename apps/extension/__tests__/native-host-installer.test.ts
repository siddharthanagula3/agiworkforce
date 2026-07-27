import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
});
