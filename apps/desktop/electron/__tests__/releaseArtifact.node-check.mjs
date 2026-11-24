import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { URL } from 'node:url';
import verifyReleaseArtifact from '../verifyReleaseArtifact.mjs';

const isMac = process.platform === 'darwin';
const iconSource = new URL('../resources/icon.icns', import.meta.url);
const ribbonSource = new URL('../../../web/public/logo-512.png', import.meta.url);

function ownedMacBundle(root, icon) {
  const contents = path.join(root, 'Owned.app', 'Contents');
  mkdirSync(path.join(contents, 'Resources'), { recursive: true });
  writeFileSync(
    path.join(contents, 'Info.plist'),
    '<plist version="1.0"><dict><key>CFBundleIconFile</key><string>icon.icns</string></dict></plist>',
  );
  writeFileSync(path.join(contents, 'Resources', 'icon.icns'), icon);
  return contents;
}

function verifyOwnedArtifact(root, platform) {
  return verifyReleaseArtifact({
    electronPlatformName: platform,
    appOutDir: root,
    packager: { appInfo: { productFilename: 'Owned' } },
  });
}

for (const leaked of [false, true]) {
  test(`pre-upload artifact gate ${leaked ? 'refuses signing credentials' : 'accepts clean payloads'}`, async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'agi-pre-upload-'));
    try {
      const app = isMac ? ownedMacBundle(root, readFileSync(iconSource)) : root;
      writeFileSync(
        path.join(app, 'renderer.js'),
        leaked
          ? 'const env={TAURI_SIGNING_PRIVATE_KEY:"synthetic-signing-secret"};'
          : 'const endpoint="https://agiworkforce.com";',
      );
      const check = verifyOwnedArtifact(root, process.platform);
      if (leaked)
        await assert.rejects(
          check,
          (error) =>
            error.message.includes('refused before signing/notarization') &&
            !error.message.includes('synthetic-signing-secret'),
        );
      else await check;
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test(
  'pre-upload artifact gate refuses an outdated macOS icon rendition',
  { skip: !isMac },
  async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'agi-pre-upload-icon-'));
    try {
      const icon = readFileSync(iconSource);
      const ribbon = readFileSync(ribbonSource);
      const offset = icon.indexOf(ribbon);
      assert.ok(offset >= 8);
      icon.fill(0, offset, offset + ribbon.length);
      ownedMacBundle(root, icon);
      await assert.rejects(
        verifyOwnedArtifact(root, 'darwin'),
        /does not use the current AGI artwork/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
