import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_ROOT = path.join(__dirname, '..');
const SKIPPED_DIRECTORIES = new Set(['api', '__tests__', 'node_modules']);
const SOURCE_FILE = /\.tsx?$/;
const TEST_FILE = /\.(?:test|spec)\.tsx?$/;

const PHYSICAL_DIRECTION = [
  /(?<![\w-])-?(?:m|p|scroll-m|scroll-p)[lr]-(?:\d|\[|px\b|auto\b)/g,
  /(?<![\w-])-?(?:left|right|inset-[lr])-(?:\d|\[|px\b|auto\b|full\b)/g,
  /(?<![\w-])(?:border|rounded)-[lr](?:-|\b)/g,
  /(?<![\w-])rounded-[tb][lr](?:-|\b)/g,
  /(?<![\w-])(?:text|float|clear)-(?:left|right)\b/g,
  /\b(?:margin|padding)(?:Left|Right)\s*:/g,
  /\btextAlign\s*:\s*['"](?:left|right)['"]/g,
];

const FROZEN: Readonly<Record<string, { count: number; reason: string }>> = {
  [path.join('pricing', 'error.tsx')]: {
    count: 2,
    reason: 'pricing is read only by founder order; two icon margins wait for that to lift',
  },
  [path.join('pricing', 'page.tsx')]: {
    count: 3,
    reason: 'pricing is read only by founder order; three table header alignments wait for that',
  },
  [path.join('upgrade', '[plan]', 'UpgradeOrderScreen.tsx')]: {
    count: 1,
    reason: 'the upgrade order screen states a plan price, which is read only by founder order',
  },
};

function sourceFiles(directory: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) sourceFiles(full, found);
    else if (SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)) found.push(full);
  }
  return found;
}

function physicalDirectionUses(source: string): string[] {
  return PHYSICAL_DIRECTION.flatMap((pattern) => [...source.matchAll(pattern)].map((m) => m[0]));
}

const USES = new Map(
  sourceFiles(APP_ROOT)
    .map(
      (file) =>
        [
          path.relative(APP_ROOT, file),
          physicalDirectionUses(fs.readFileSync(file, 'utf8')),
        ] as const,
    )
    .filter(([, uses]) => uses.length > 0),
);

describe('page tree layout direction', () => {
  it('uses start and end rather than left and right, so a right-to-left document mirrors', () => {
    const unexpected = [...USES].filter(([file]) => !(file in FROZEN));
    expect(Object.fromEntries(unexpected)).toEqual({});
  });

  it('holds each frozen exception to its recorded size and reason', () => {
    for (const [file, exception] of Object.entries(FROZEN)) {
      expect(exception.reason.length, file).toBeGreaterThan(40);
      expect(USES.get(file)?.length ?? 0, file).toBe(exception.count);
    }
  });

  it('recognises every physical form it is meant to refuse', () => {
    const sample =
      "'ml-2 pr-4 -mr-1 left-0 right-[3px] inset-l-2 border-l rounded-r-lg rounded-tl text-left float-right' marginLeft: 4, textAlign: 'right'";
    expect(physicalDirectionUses(sample)).toHaveLength(13);
    expect(
      physicalDirectionUses("'ms-2 pe-4 start-0 end-2 text-start border-s rounded-e margin-left'"),
    ).toEqual([]);
  });
});
