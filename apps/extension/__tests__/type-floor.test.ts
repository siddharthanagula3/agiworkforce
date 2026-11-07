import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPanelStyles } from '../src/features/content/in-page-panel/panelStyles';

const FLOOR_PX = 14;
const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, '../src');
const SOURCE_EXTENSIONS = /\.(ts|css|html|js)$/;
const SKIPPED_FILES = /\.(d\.ts|test\.ts)$/;
const KEYWORD_SIZES = /^(xx-small|x-small|small|smaller)$/;
const PX_PER_UNIT: Record<string, number> = { px: 1, pt: 4 / 3, rem: 16, em: 16 };

type Finding = { line: number; text: string };

const toPx = (value: number, unit: string): number => value * (PX_PER_UNIT[unit] ?? 1);

const isUnderFloor = (raw: string): boolean => {
  const size = raw.trim().toLowerCase();
  if (KEYWORD_SIZES.test(size)) return true;
  const match = /^(\d*\.?\d+)(px|pt|rem|em)$/.exec(size);
  if (!match) return false;
  return toPx(Number(match[1]), match[2]) < FLOOR_PX;
};

const SIZE_DECLARATIONS: RegExp[] = [
  /(?<![\w-])font-size\s*:\s*([^;}"'`]+)/g,
  /(?<![\w-])fontSize\s*[:=]\s*['"`]?([^;,}"'`\s]+)/g,
  /font-size\s*=\s*"([^"]+)"/g,
  /--[\w-]*size\s*:\s*([^;}"'`]+)/g,
];

const SHORTHAND =
  /(?<![\w-])font\s*:\s*((?:(?:italic|oblique|normal|bold|bolder|lighter|small-caps|\d{3})\s+)*)(\d*\.?\d+(?:px|pt|rem|em)|xx-small|x-small|small|smaller)(?=[\s/;,}'"`])/g;

const findUndersizedText = (source: string): Finding[] => {
  const findings: Finding[] = [];
  const lineAt = (index: number): number => source.slice(0, index).split('\n').length;
  for (const pattern of SIZE_DECLARATIONS) {
    for (const match of source.matchAll(pattern)) {
      if (isUnderFloor(match[1])) {
        findings.push({ line: lineAt(match.index ?? 0), text: match[0].trim() });
      }
    }
  }
  for (const match of source.matchAll(SHORTHAND)) {
    if (isUnderFloor(match[2])) {
      findings.push({ line: lineAt(match.index ?? 0), text: match[0].trim() });
    }
  }
  return findings.sort((a, b) => a.line - b.line);
};

const listSources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listSources(path);
    return SOURCE_EXTENSIONS.test(entry.name) && !SKIPPED_FILES.test(entry.name) ? [path] : [];
  });

describe('Chrome extension type floor', () => {
  it('flags undersized declarations in every notation the scanner claims to read', () => {
    const sample = [
      '.a { font-size: 13px; }',
      '.b { font-size:12.5px }',
      '.c { font: 600 12px/1.5 ui-monospace; }',
      '.d { font-size: 0.8rem; }',
      '.e { font-size: smaller; }',
      '  --type-label-size: 11px;',
      "el.style.fontSize = '10px';",
      '.f { font-size: 9pt; }',
    ].join('\n');
    expect(findUndersizedText(sample).map((finding) => finding.line)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });

  it('accepts sizes at or above the floor and non-size font declarations', () => {
    const sample = [
      '.a { font-size: 14px; }',
      '.b { font-size: var(--type-body-size); }',
      '.c { font: inherit; }',
      '.d { font: 500 15px/1.4 system-ui; }',
      '.e { font-size: 0.875rem; }',
      '.f { font-size: 11pt; }',
      '--type-body-size: 14px;',
      '.g { font-family: inherit; font-size: 20px; }',
    ].join('\n');
    expect(findUndersizedText(sample)).toEqual([]);
  });

  it('reads the extension sources it is meant to guard', () => {
    const files = listSources(srcRoot).map((file) => relative(srcRoot, file));
    expect(files).toEqual(
      expect.arrayContaining([
        'side_panel.css',
        'side_panel.ts',
        'options.ts',
        'content.ts',
        'features/content/in-page-panel/panelStyles.ts',
      ]),
    );
    const tokens = readFileSync(join(srcRoot, 'side_panel.css'), 'utf8');
    expect(tokens.match(/--type-[\w-]*-size\s*:/g)?.length).toBeGreaterThanOrEqual(10);
  });

  it('keeps every font size in the extension sources at or above 14px', () => {
    const offenders = listSources(srcRoot).flatMap((file) =>
      findUndersizedText(readFileSync(file, 'utf8')).map(
        (finding) => `${relative(srcRoot, file)}:${finding.line} ${finding.text}`,
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('inherits existing readable type roles instead of defining smaller text', () => {
    const panelCss = readFileSync(join(srcRoot, 'side_panel.css'), 'utf8');
    for (const role of ['label', 'caption']) {
      expect(panelCss).toContain(`--type-${role}-size: var(--type-body-small-size)`);
    }
    const providerPillStyle = buildPanelStyles().match(/\.agi-provider-pill\s*\{([^}]+)\}/)?.[1];
    expect(providerPillStyle).toContain('font-size:inherit');
  });
});
