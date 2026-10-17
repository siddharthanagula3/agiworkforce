import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import verifyReleaseArtifact from '../verifyReleaseArtifact.mjs';

for (const leaked of [false, true]) {
  test(`pre-upload artifact gate ${leaked ? 'refuses signing credentials' : 'accepts clean payloads'}`, async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'agi-pre-upload-'));
    try {
      const app = path.join(root, 'Owned.app');
      mkdirSync(app);
      writeFileSync(
        path.join(app, 'renderer.js'),
        leaked
          ? 'const env={TAURI_SIGNING_PRIVATE_KEY:"synthetic-signing-secret"};'
          : 'const endpoint="https://agiworkforce.com";',
      );
      const check = verifyReleaseArtifact({
        electronPlatformName: 'darwin',
        appOutDir: root,
        packager: { appInfo: { productFilename: 'Owned' } },
      });
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
