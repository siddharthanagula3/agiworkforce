import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  NOTICES_FILE_NAME,
  bundledModuleRoots,
  desktopNoticesText,
  writeDesktopNotices,
} from '../openSourceNotices.mjs';
import {
  OPEN_SOURCE_NOTICES_FILE,
  openOpenSourceNotices,
  openSourceNoticesPath,
} from '../openSourceNoticesFile';

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sandboxes: string[] = [];

afterAll(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

function sandbox(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'desktop-notices-'));
  sandboxes.push(dir);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), text);
  }
  return dir;
}

const MIT = [
  'MIT License',
  '',
  'Permission is hereby granted, free of charge, to any person obtaining a copy.',
].join('\n');

function npmPackage(name: string, version: string, license: string): Record<string, string> {
  return {
    [`node_modules/${name}/package.json`]: JSON.stringify({ name, version, license }),
    [`node_modules/${name}/LICENSE`]: `Copyright (c) 2024 ${name} authors\n\n${license} text for ${name}`,
  };
}

describe('desktop open-source notices', () => {
  it('finds the packages an esbuild bundle pulled in and ignores first-party files', () => {
    const metafile = {
      inputs: {
        'node_modules/.pnpm/ws@8.0.0/node_modules/ws/lib/ws.js': {},
        'node_modules/.pnpm/ws@8.0.0/node_modules/ws/lib/other.js': {},
        'node_modules/.pnpm/x/node_modules/@scope/pkg/dist/a.js': {},
        'electron/main.ts': {},
      },
    };

    expect(bundledModuleRoots([metafile], '/work/app').sort()).toEqual([
      '/work/app/node_modules/.pnpm/ws@8.0.0/node_modules/ws',
      '/work/app/node_modules/.pnpm/x/node_modules/@scope/pkg',
    ]);
  });

  it('lists each bundled package with its copyright, then appends the command-line notices', () => {
    const root = sandbox({
      ...npmPackage('left-pad', '1.3.0', 'MIT'),
      ...npmPackage('electron', '41.0.0', 'MIT'),
      'cli-notices.txt': 'Command-line tool open-source notices\n\nserde 1.0.0 (MIT)\n',
    });

    const text = desktopNoticesText({
      moduleRoots: [path.join(root, 'node_modules/left-pad')],
      extraRoots: [path.join(root, 'node_modules/electron')],
      bundledNoticesFiles: [path.join(root, 'cli-notices.txt')],
    });

    expect(text).toContain('Packages (2)');
    expect(text).toContain('left-pad 1.3.0 (MIT)');
    expect(text).toContain('electron 41.0.0 (MIT)');
    expect(text).toContain('Copyright (c) 2024 left-pad authors');
    expect(text).toContain('MIT text for left-pad');
    expect(text.indexOf('Command-line tool open-source notices')).toBeGreaterThan(
      text.indexOf('License texts'),
    );
    expect(text.endsWith('serde 1.0.0 (MIT)\n')).toBe(true);
  });

  it('fails the build when a bundled notices file is missing', () => {
    const root = sandbox({ ...npmPackage('left-pad', '1.3.0', 'MIT') });

    expect(() =>
      desktopNoticesText({
        moduleRoots: [path.join(root, 'node_modules/left-pad')],
        extraRoots: [],
        bundledNoticesFiles: [path.join(root, 'absent.txt')],
      }),
    ).toThrow(/ENOENT/);
  });

  it('writes the notices where the packager picks them up', () => {
    const root = sandbox({ ...npmPackage('left-pad', '1.3.0', 'MIT'), 'cli.txt': 'cli\n' });
    const out = path.join(root, 'dist', NOTICES_FILE_NAME);

    const text = writeDesktopNotices(out, {
      moduleRoots: [path.join(root, 'node_modules/left-pad')],
      extraRoots: [],
      bundledNoticesFiles: [path.join(root, 'cli.txt')],
    });

    expect(readFileSync(out, 'utf8')).toBe(text);
  });

  it('keeps the file name the same in the build, the shell and the packager', () => {
    expect(OPEN_SOURCE_NOTICES_FILE).toBe(NOTICES_FILE_NAME);
    const builder = readFileSync(path.join(desktopRoot, 'electron-builder.yml'), 'utf8');
    expect(builder).toContain(
      `from: electron/dist/${NOTICES_FILE_NAME}\n    to: ${NOTICES_FILE_NAME}`,
    );
    expect(builder).toContain(`'!electron/dist/${NOTICES_FILE_NAME}'`);
  });
});

describe('opening the notices from the shell', () => {
  it('reads the packaged file from the resources folder and the built one in development', () => {
    const base = { resourcesPath: '/App/Resources', buildOutputDir: '/repo/electron/dist' };

    expect(openSourceNoticesPath({ ...base, isPackaged: true })).toBe(
      `/App/Resources/${OPEN_SOURCE_NOTICES_FILE}`,
    );
    expect(openSourceNoticesPath({ ...base, isPackaged: false })).toBe(
      `/repo/electron/dist/${OPEN_SOURCE_NOTICES_FILE}`,
    );
  });

  it('reports the failure text when the system cannot open the file', async () => {
    const opened = vi.fn(async () => '');
    const failed = vi.fn(async () => 'Failed to open path');

    expect(await openOpenSourceNotices('/a/notices.txt', opened)).toBeNull();
    expect(opened).toHaveBeenCalledWith('/a/notices.txt');
    expect(await openOpenSourceNotices('/a/notices.txt', failed)).toBe('Failed to open path');
  });
});
