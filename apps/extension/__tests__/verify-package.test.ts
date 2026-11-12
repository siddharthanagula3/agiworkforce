// @vitest-environment node

import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { configureChromeManifest } from '../scripts/manifest-config.mjs';

const extensionRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const verifyPackageScript = join(extensionRoot, 'scripts', 'verify-package.mjs');
const sourceManifest = JSON.parse(readFileSync(join(extensionRoot, 'manifest.json'), 'utf8'));
const chromeExtensionPublicKey =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA5cGnbsCvSikskJTyhn/hqB8wtzGwhZDaa6PQTePWdmuxI7u2JR7dPuAcyOL8zYW8japmuv7P/SBJ/wr1CiFQAJIToFv3pbDbZDxrUy0ttLNpvZumZ/GPj/4kEMwlWV0PZIRHzF91Cm41O3iQUhctXifllGX5IMicNSwXj/I52fWAcHKLm7Ut6C/PP4s3RP26K/I+s4D9E8Q8PgVGmkgsxxwyxX0ct+N2tdDXVYhFiPSXyU3wPp1gyoD8FRzy+N+xEWNF/a/mm+TSjI3cxkNPL9jpY00IRy/gh7PywS3h5lNa8skhxy2OklT2k7br1xNBAMHJAZRKdmAf5z/1z12rxwIDAQAB';
const releaseEnvironment = {
  CLERK_PUBLISHABLE_KEY: 'pk_live_Y2xlcmstY2kuaW52YWxpZCQ',
  CLERK_FRONTEND_API: 'https://clerk-ci.invalid',
  CLERK_SYNC_HOST: 'https://clerk-ci.invalid',
  CHROME_EXTENSION_PUBLIC_KEY: chromeExtensionPublicKey,
};
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function run(command: string, args: string[], cwd: string) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
}

interface PackageOptions {
  readonly archiveName?: string;
  readonly withKey?: boolean;
  readonly manifestOverrides?: Record<string, unknown>;
  readonly iconSources?: Record<string, string>;
  readonly extraFiles?: Record<string, string>;
}

function createValidPackage({
  archiveName = 'extension.zip',
  withKey = true,
  manifestOverrides = {},
  iconSources = {},
  extraFiles = {},
}: PackageOptions = {}) {
  const root = mkdtempSync(join(tmpdir(), 'agi-chrome-package-verifier-'));
  temporaryRoots.push(root);
  const packageRoot = join(root, 'package');
  const archivePath = join(root, archiveName);
  mkdirSync(packageRoot);

  const manifest = {
    ...configureChromeManifest(sourceManifest, {
      clerkFrontendApi: releaseEnvironment.CLERK_FRONTEND_API,
      clerkSyncHost: releaseEnvironment.CLERK_SYNC_HOST,
      ...(withKey ? { chromeExtensionPublicKey } : {}),
    }),
    ...manifestOverrides,
  };
  writeFileSync(join(packageRoot, 'manifest.json'), `${JSON.stringify(manifest)}\n`);

  const icons = new Set<string>([
    ...Object.values((manifest.icons ?? {}) as Record<string, string>),
    ...Object.values((manifest.action?.default_icon ?? {}) as Record<string, string>),
  ]);
  for (const icon of icons) {
    const destination = join(packageRoot, icon);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(extensionRoot, iconSources[icon] ?? icon), destination);
  }
  for (const [file, contents] of Object.entries(extraFiles)) {
    const destination = join(packageRoot, file);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, contents);
  }

  const entryPoints = [
    manifest.background?.service_worker,
    ...manifest.content_scripts.flatMap((script: { js?: string[] }) => script.js ?? []),
    manifest.side_panel?.default_path,
    manifest.options_page,
  ];
  for (const entryPoint of new Set(entryPoints)) {
    if (typeof entryPoint !== 'string') throw new Error('fixture manifest entry point is unset');
    const destination = join(packageRoot, entryPoint);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, 'package verifier fixture\n');
  }

  run('zip', ['-q', '-r', archivePath, '.'], packageRoot);
  return { archivePath, packageRoot, root };
}

function verifyPackage(
  archivePath: string,
  {
    firstDraft = false,
    withConfiguredKey = !firstDraft,
    extensionId,
  }: { firstDraft?: boolean; withConfiguredKey?: boolean; extensionId?: string } = {},
) {
  const env: Record<string, string | undefined> = { ...process.env, ...releaseEnvironment };
  delete env['CWS_EXTENSION_ID'];
  if (extensionId) env['CWS_EXTENSION_ID'] = extensionId;
  if (!withConfiguredKey) delete env['CHROME_EXTENSION_PUBLIC_KEY'];
  return spawnSync(
    process.execPath,
    [verifyPackageScript, archivePath, ...(firstDraft ? ['--first-draft'] : [])],
    { cwd: extensionRoot, encoding: 'utf8', env },
  );
}

describe('Chrome package verifier store requirements', () => {
  it('refuses a summary longer than the 132 characters the store shows', () => {
    const { archivePath } = createValidPackage({
      manifestOverrides: { description: 'a'.repeat(133) },
    });

    const result = verifyPackage(archivePath);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/description has 133 characters; the limit is 132/);
  });

  it('measures a localized summary by the message the store will show', () => {
    const localized = (message: string) =>
      createValidPackage({
        manifestOverrides: { description: '__MSG_storeSummary__' },
        extraFiles: {
          '_locales/en/messages.json': JSON.stringify({ storeSummary: { message } }),
        },
      });

    const accepted = verifyPackage(localized('a'.repeat(132)).archivePath);
    const refused = verifyPackage(localized('a'.repeat(133)).archivePath);

    expect(accepted.status, accepted.stderr).toBe(0);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toMatch(/description has 133 characters/);
  });

  it('refuses an icon whose pixels do not match its declared size', () => {
    const { archivePath } = createValidPackage({
      iconSources: { 'icons/icon48.png': 'icons/icon32.png' },
    });

    const result = verifyPackage(archivePath);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/icons\/icon48\.png is 32x32, declared as 48x48/);
  });

  it('refuses a package whose key is not the configured store item', () => {
    const { archivePath } = createValidPackage();

    const matching = verifyPackage(archivePath, {
      extensionId: 'bpokepadbideikgldoabhakaeglpkgdg',
    });
    const other = verifyPackage(archivePath, { extensionId: 'abcdefghijklmnopabcdefghijklmnop' });

    expect(matching.status, matching.stderr).toBe(0);
    expect(other.status).toBe(1);
    expect(other.stderr).toMatch(/not CWS_EXTENSION_ID abcdefghijklmnopabcdefghijklmnop/);
  });

  it('refuses a package without the 128 pixel store icon', () => {
    const icons = { ...(sourceManifest.icons as Record<string, string>) };
    delete icons['128'];
    const { archivePath } = createValidPackage({ manifestOverrides: { icons } });

    const result = verifyPackage(archivePath);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/declares no 128x128 icon/);
  });
});

describe('Chrome package verifier first-draft mode', () => {
  it('accepts a keyless first draft built before the store item exists', () => {
    const { archivePath } = createValidPackage({
      archiveName: 'extension-first-draft.zip',
      withKey: false,
    });

    const result = verifyPackage(archivePath, { firstDraft: true });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Verified first-draft extension-first-draft.zip');
  });

  it('never accepts a first draft as a release package', () => {
    const keyless = createValidPackage({ withKey: false });
    const renamedDraft = createValidPackage({ archiveName: 'extension-first-draft.zip' });

    const keylessResult = verifyPackage(keyless.archivePath);
    const renamedResult = verifyPackage(renamedDraft.archivePath);

    expect(keylessResult.status).toBe(1);
    expect(keylessResult.stderr).toMatch(/does not contain the configured stable CRX public key/);
    expect(renamedResult.status).toBe(1);
    expect(renamedResult.stderr).toMatch(/is a first-draft package/);
  });

  it('refuses a first draft once the item exists or when it carries a key', () => {
    const keyed = createValidPackage({ archiveName: 'extension-first-draft.zip' });
    const keyless = createValidPackage({
      archiveName: 'extension-first-draft.zip',
      withKey: false,
    });
    const misnamed = createValidPackage({ withKey: false });

    const keyedResult = verifyPackage(keyed.archivePath, { firstDraft: true });
    const configuredResult = verifyPackage(keyless.archivePath, {
      firstDraft: true,
      withConfiguredKey: true,
    });
    const misnamedResult = verifyPackage(misnamed.archivePath, { firstDraft: true });

    expect(keyedResult.status).toBe(1);
    expect(keyedResult.stderr).toMatch(/must not carry a manifest key/);
    expect(configuredResult.status).toBe(1);
    expect(configuredResult.stderr).toMatch(/store item already exists/);
    expect(misnamedResult.status).toBe(1);
    expect(misnamedResult.stderr).toMatch(/must be named \*-first-draft\.zip/);
  });
});

describe('Chrome package verifier archive hardening', () => {
  it('accepts a regular release-shaped package', () => {
    const { archivePath } = createValidPackage();

    const result = verifyPackage(archivePath);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Verified extension.zip');
  });

  it('rejects an archive entry preserved as a symbolic link', () => {
    const { archivePath, packageRoot } = createValidPackage();
    symlinkSync('src/options.html', join(packageRoot, 'options-link'));
    run('zip', ['-q', '-y', archivePath, 'options-link'], packageRoot);

    const result = verifyPackage(archivePath);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/non-file archive entry/i);
  });

  it('rejects case-colliding archive paths', () => {
    const { archivePath, root } = createValidPackage();
    const upperDirectory = join(root, 'upper');
    const lowerDirectory = join(root, 'lower');
    mkdirSync(upperDirectory);
    mkdirSync(lowerDirectory);
    writeFileSync(join(upperDirectory, 'Collision.txt'), 'upper\n');
    writeFileSync(join(lowerDirectory, 'collision.txt'), 'lower\n');
    run('zip', ['-q', '-j', archivePath, 'upper/Collision.txt', 'lower/collision.txt'], root);

    const result = verifyPackage(archivePath);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/case-colliding archive paths/i);
  });
});
