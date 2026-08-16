import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TOOL_APPROVAL_RESUME_PATH } from '@agiworkforce/cloud-contracts';

/**
 * The durable tool-approval resume endpoint has exactly one address:
 * `TOOL_APPROVAL_RESUME_PATH`, exported by `@agiworkforce/cloud-contracts`.
 *
 * Two things can silently break a surface here, and neither shows up in a
 * build. The constant can drift away from the Next.js route that actually
 * serves it, and a client can retype the literal so a server-side move leaves
 * that one surface posting approvals at a dead URL — the run stays suspended
 * and the user sees a turn that never resumes. Mobile carried such a copy
 * until 68591008c; Web and Desktop carried theirs until this test landed.
 */
const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');
const WEB_APP_DIR = path.resolve(import.meta.dirname, '../../app');

const SCANNED_DIRS = [
  'apps/web/lib',
  'apps/web/components',
  'apps/desktop/src',
  'apps/mobile/services',
  'apps/mobile/stores',
  'apps/extension/src',
];

const SOURCE_EXT = /\.(ts|tsx)$/;
const SKIP_DIRS = new Set([
  'node_modules',
  '__tests__',
  '__mocks__',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
]);

const QUOTED_LITERAL = new RegExp(`['"\`}]${TOOL_APPROVAL_RESUME_PATH.replace(/\//g, '\\/')}`);

function collectSourceFiles(dir: string, found: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectSourceFiles(full, found);
      continue;
    }
    if (!SOURCE_EXT.test(entry.name)) continue;
    if (/\.(test|spec)\.tsx?$/.test(entry.name)) continue;
    found.push(full);
  }
  return found;
}

describe('TOOL_APPROVAL_RESUME_PATH is the single address for approval resume', () => {
  it('resolves to a real Next.js route handler', () => {
    const routeFile = path.join(WEB_APP_DIR, TOOL_APPROVAL_RESUME_PATH, 'route.ts');

    expect(
      fs.existsSync(routeFile),
      `${TOOL_APPROVAL_RESUME_PATH} has no handler at ${path.relative(REPO_ROOT, routeFile)}. ` +
        'Move the constant and the route together.',
    ).toBe(true);
    expect(fs.readFileSync(routeFile, 'utf8')).toMatch(
      /export\s+(?:const|async\s+function)\s+POST\b/,
    );
  });

  it('is not retyped as a string literal by any surface client', () => {
    const offenders: string[] = [];

    for (const rel of SCANNED_DIRS) {
      for (const file of collectSourceFiles(path.join(REPO_ROOT, rel))) {
        if (QUOTED_LITERAL.test(fs.readFileSync(file, 'utf8'))) {
          offenders.push(path.relative(REPO_ROOT, file));
        }
      }
    }

    expect(
      offenders,
      `These files retype ${TOOL_APPROVAL_RESUME_PATH} instead of importing ` +
        'TOOL_APPROVAL_RESUME_PATH from @agiworkforce/cloud-contracts:\n' +
        offenders.join('\n'),
    ).toEqual([]);
  });
});
