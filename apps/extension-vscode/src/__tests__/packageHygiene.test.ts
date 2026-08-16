import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  PACKAGED_RUNTIME_OUTPUT_ALLOWLIST,
  validatePackagedRuntimeOutput,
}: {
  PACKAGED_RUNTIME_OUTPUT_ALLOWLIST: readonly string[];
  validatePackagedRuntimeOutput: (files: string[], options?: { requireAll?: boolean }) => void;
} = require('../../scripts/vsce-package.js');

const EXPECTED_RUNTIME_OUTPUT = [
  'out/extension.js',
  'out/webview/render.js',
  'out/codicons/codicon.css',
  'out/codicons/codicon.ttf',
];

describe('VSIX package hygiene', () => {
  it('cleans previous compiler output before creating a production package', async () => {
    const manifest = (await import('../../package.json')) as {
      scripts: { package: string };
    };

    expect(manifest.scripts.package).toMatch(/^pnpm run clean && /u);
  });

  it('only lists the explicitly required runtime output files', () => {
    expect(PACKAGED_RUNTIME_OUTPUT_ALLOWLIST).toEqual(EXPECTED_RUNTIME_OUTPUT);

    const extensionRoot = resolve(__dirname, '../..');
    const result = spawnSync(
      process.execPath,
      [resolve(extensionRoot, 'scripts/vsce-package.js'), 'ls', '--no-dependencies'],
      {
        cwd: extensionRoot,
        encoding: 'utf8',
      },
    );

    expect(result.status, result.stderr || result.stdout).toBe(0);
    const runtimeFiles = result.stdout.split(/\r?\n/u).filter((file) => file.startsWith('out/'));
    expect(runtimeFiles.every((file) => PACKAGED_RUNTIME_OUTPUT_ALLOWLIST.includes(file))).toBe(
      true,
    );
  });

  it('packages the Marketplace README but not the contributor notes', { timeout: 60_000 }, () => {
    const extensionRoot = resolve(__dirname, '../..');
    const result = spawnSync(
      process.execPath,
      [resolve(extensionRoot, 'scripts/vsce-package.js'), 'ls', '--no-dependencies'],
      { cwd: extensionRoot, encoding: 'utf8' },
    );

    expect(result.status, result.stderr || result.stdout).toBe(0);
    const files = result.stdout.split(/\r?\n/u).map((file) => file.trim());
    expect(files).toContain('README.md');
    expect(files.filter((file) => file.startsWith('docs/'))).toEqual([]);
  });

  it('rejects stale compiled files even when all release outputs are present', () => {
    expect(() =>
      validatePackagedRuntimeOutput([
        ...PACKAGED_RUNTIME_OUTPUT_ALLOWLIST,
        'out/features/stale.js',
      ]),
    ).toThrow(/out\/features\/stale\.js/u);
  });

  it('requires every runtime asset when creating a release package', () => {
    expect(() => validatePackagedRuntimeOutput(['out/extension.js'])).toThrow(
      /out\/webview\/render\.js/u,
    );
    expect(() =>
      validatePackagedRuntimeOutput([...PACKAGED_RUNTIME_OUTPUT_ALLOWLIST]),
    ).not.toThrow();
  });
});
