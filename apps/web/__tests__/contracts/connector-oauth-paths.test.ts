import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  CONNECTOR_OAUTH_CALLBACK_PATH,
  CONNECTOR_OAUTH_START_PATH,
} from '@agiworkforce/cloud-contracts';
import { CONNECTOR_OAUTH_START_PATH as SHARED_UI_START_PATH } from '@agiworkforce/unified-chat';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');
const WEB_APP_DIR = path.resolve(import.meta.dirname, '../../app');

const SCANNED_DIRS = [
  'apps/web/lib',
  'apps/web/features',
  'apps/web/components',
  'apps/mobile/services',
  'apps/mobile/stores',
  'apps/desktop/src',
  'packages/ui/unified-chat/src',
];

const ALLOWED_RESTATEMENTS = new Set([
  'packages/ui/unified-chat/src/lib/connector-connect-required.ts',
]);

const SOURCE_EXT = /\.(ts|tsx)$/;
const SKIP_DIRS = new Set([
  'node_modules',
  '__tests__',
  '__mocks__',
  '__fixtures__',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
]);

function buildLiteralMatcher(routePath: string): RegExp {
  return new RegExp(`['"\`}]${routePath.replace(/\//g, '\\/')}`);
}

function stripCommentLines(source: string): string {
  return source
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith('*') && !trimmed.startsWith('//') && !trimmed.startsWith('/*');
    })
    .join('\n');
}

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

function findRetypedFiles(routePath: string): string[] {
  const matcher = buildLiteralMatcher(routePath);
  const offenders: string[] = [];
  for (const rel of SCANNED_DIRS) {
    for (const file of collectSourceFiles(path.join(REPO_ROOT, rel))) {
      const relative = path.relative(REPO_ROOT, file);
      if (ALLOWED_RESTATEMENTS.has(relative)) continue;
      if (matcher.test(stripCommentLines(fs.readFileSync(file, 'utf8')))) {
        offenders.push(relative);
      }
    }
  }
  return offenders;
}

describe('connector OAuth broker paths have one declaration', () => {
  it('pins the shared chat UI copy of the start path to the contract', () => {
    expect(
      SHARED_UI_START_PATH,
      'packages/ui/unified-chat restates the start path because it cannot depend on ' +
        '@agiworkforce/cloud-contracts. It has drifted: the Connect card validator will now ' +
        'reject genuine authorization prompts and the button will not render.',
    ).toBe(CONNECTOR_OAUTH_START_PATH);
  });

  it('resolves both paths to real Next.js route handlers', () => {
    for (const routePath of [CONNECTOR_OAUTH_START_PATH, CONNECTOR_OAUTH_CALLBACK_PATH]) {
      const routeFile = path.join(WEB_APP_DIR, routePath, 'route.ts');
      expect(
        fs.existsSync(routeFile),
        `${routePath} has no handler at ${path.relative(REPO_ROOT, routeFile)}. ` +
          'Move the constant and the route together — the callback path is also the redirect ' +
          'URI registered with every provider.',
      ).toBe(true);
      expect(fs.readFileSync(routeFile, 'utf8')).toMatch(
        /export\s+(?:const|async\s+function)\s+GET\b/,
      );
    }
  });

  it('is not retyped as a string literal by any surface client', () => {
    for (const routePath of [CONNECTOR_OAUTH_START_PATH, CONNECTOR_OAUTH_CALLBACK_PATH]) {
      const offenders = findRetypedFiles(routePath);
      expect(
        offenders,
        `These files retype ${routePath} instead of importing it from ` +
          '@agiworkforce/cloud-contracts:\n' +
          offenders.join('\n'),
      ).toEqual([]);
    }
  });
});
