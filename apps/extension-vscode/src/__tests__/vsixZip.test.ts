import * as fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TextReader,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipWriter,
} from '@zip.js/zip.js/index-native.js';
import { afterEach, describe, expect, it } from 'vitest';
import manifest from '../../package.json';

const require = createRequire(import.meta.url);
const extensionRoot = fileURLToPath(new URL('../..', import.meta.url));
const { PACKAGED_RUNTIME_OUTPUT_ALLOWLIST } = require('../../scripts/vsce-package.js') as {
  PACKAGED_RUNTIME_OUTPUT_ALLOWLIST: string[];
};
const {
  inspectVsixArchive,
}: {
  inspectVsixArchive: (
    vsixPath: string,
    options?: { extractTo?: string },
  ) => Promise<{ entries: string[]; packagedManifest?: Buffer }>;
} = require('../../scripts/vsix-zip.js') as {
  inspectVsixArchive: (
    vsixPath: string,
    options?: { extractTo?: string },
  ) => Promise<{ entries: string[]; packagedManifest?: Buffer }>;
};

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-vsix-zip-test-'));
  temporaryRoots.push(root);
  return root;
}

async function makeStoredArchive(): Promise<Uint8Array> {
  const writer = new ZipWriter(new Uint8ArrayWriter(), {
    useCompressionStream: false,
    useUnicodeFileNames: true,
    useWebWorkers: false,
  });
  await writer.add('extension/package.json', new TextReader('{"name":"fixture"}\n'), { level: 0 });
  await writer.add('extension/out/extension.js', new TextReader('verified fixture bytes\n'), {
    level: 0,
  });
  return writer.close();
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    fs.rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
  }
});

describe('portable VSIX ZIP inspection', () => {
  it('checks every entry and extracts only verified regular bytes', async () => {
    const root = temporaryRoot();
    const archivePath = path.join(root, 'fixture.vsix');
    fs.writeFileSync(archivePath, await makeStoredArchive());
    const extractionRoot = path.join(root, 'extracted');

    const inspected = await inspectVsixArchive(archivePath, { extractTo: extractionRoot });

    expect(inspected.entries).toEqual(['extension/package.json', 'extension/out/extension.js']);
    expect(inspected.packagedManifest?.toString('utf8')).toBe('{"name":"fixture"}\n');
    expect(fs.readFileSync(path.join(extractionRoot, 'extension/out/extension.js'), 'utf8')).toBe(
      'verified fixture bytes\n',
    );
  });

  it('rejects an entry whose stored bytes no longer match its CRC', async () => {
    const root = temporaryRoot();
    const archivePath = path.join(root, 'corrupt.vsix');
    const archive = Buffer.from(await makeStoredArchive());
    const marker = Buffer.from('verified fixture bytes\n');
    const markerOffset = archive.indexOf(marker);
    expect(markerOffset).toBeGreaterThanOrEqual(0);
    archive[markerOffset] ^= 0xff;
    fs.writeFileSync(archivePath, archive);

    await expect(inspectVsixArchive(archivePath)).rejects.toThrow(/Invalid CRC32/u);
  });

  it('verifies the extension icon bytes against the current listing artwork', async () => {
    const root = temporaryRoot();
    const archivePath = path.join(root, `${manifest.name}-${manifest.version}.vsix`);
    const artwork = fs.readFileSync(path.join(extensionRoot, manifest.icon));
    for (const icon of [artwork, Buffer.from('old icon fixture')]) {
      const writer = new ZipWriter(new Uint8ArrayWriter(), {
        useUnicodeFileNames: true,
        useWebWorkers: false,
      });
      await writer.add('extension.vsixmanifest', new TextReader('<PackageManifest />'));
      await writer.add('extension/package.json', new TextReader(JSON.stringify(manifest)));
      for (const file of [...PACKAGED_RUNTIME_OUTPUT_ALLOWLIST, 'readme.md', 'LICENSE.txt']) {
        await writer.add(`extension/${file}`, new TextReader('fixture'));
      }
      await writer.add(`extension/${manifest.icon}`, new Uint8ArrayReader(icon));
      fs.writeFileSync(archivePath, await writer.close());
      const check = spawnSync(
        process.execPath,
        [path.join(extensionRoot, 'scripts/verify-vsix.mjs'), archivePath],
        { encoding: 'utf8' },
      );
      if (icon === artwork) {
        expect(check.status, check.stderr).toBe(0);
      } else {
        expect(check.status, check.stderr).toBe(1);
        expect(check.stderr).toContain(
          'packaged extension icon differs from the current AGI Code artwork',
        );
      }
    }
  });

  // NOT COVERED HERE: the useCompressionStream bug fixed in scripts/vsix-zip.js.
  // Both fixtures above are tiny and STORED (level 0), so neither reaches the
  // inflater. Synthetic archives written by zip.js's own ZipWriter do not
  // reproduce it either, deflated payloads up to 1 MB compressed, with and
  // without data descriptors, all verify fine on the buggy path. Whatever vsce
  // emits differs in some way not yet identified, so no unit fixture here has
  // been shown to fail without the fix.
  //
  // The real guard is `pnpm test:integration:package` (the VS Code + CLI
  // clean-profile E2E job), which verifies the actual packaged VSIX. That is
  // where the bug surfaced and where a regression would surface again.
});
