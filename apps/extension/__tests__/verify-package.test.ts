// @vitest-environment node

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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

function createValidPackage() {
  const root = mkdtempSync(join(tmpdir(), 'agi-chrome-package-verifier-'));
  temporaryRoots.push(root);
  const packageRoot = join(root, 'package');
  const archivePath = join(root, 'extension.zip');
  mkdirSync(packageRoot);

  const manifest = configureChromeManifest(sourceManifest, {
    clerkFrontendApi: releaseEnvironment.CLERK_FRONTEND_API,
    clerkSyncHost: releaseEnvironment.CLERK_SYNC_HOST,
    chromeExtensionPublicKey,
  });
  writeFileSync(join(packageRoot, 'manifest.json'), `${JSON.stringify(manifest)}\n`);

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

function verifyPackage(archivePath: string) {
  return spawnSync(process.execPath, [verifyPackageScript, archivePath], {
    cwd: extensionRoot,
    encoding: 'utf8',
    env: { ...process.env, ...releaseEnvironment },
  });
}

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
