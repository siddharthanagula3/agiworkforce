import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const FLOOR_PX = 14;
const ROOT_FONT_PX = 16;

const ROOT = resolve(import.meta.dirname, '../../..');

const FLOORED_COMPONENTS = [
  'packages/ui/ui/src/primitives/EmptyState.tsx',
  'packages/ui/unified-chat/src/components/tasks/TasksBoard.tsx',
  'apps/web/features/support/components/HelpArticleLink.tsx',
  'apps/web/features/chat/components/research/ResearchReportView.tsx',
  'apps/web/app/chat/projects/[id]/page.tsx',
] as const;

const SUB_FLOOR_TOKEN_CLASSES = new Set(['text-2xs', 'text-xs', 'text-caption', 'text-metadata']);

function toPx(value: number, unit: string | undefined): number {
  return unit === 'px' ? value : value * ROOT_FONT_PX;
}

function findSubFloorText(source: string): string[] {
  const findings: string[] = [];
  const lineAt = (index: number) => source.slice(0, index).split('\n').length;

  for (const match of source.matchAll(/(?<![\w-])text-[a-z0-9]+(?![\w-[])/g)) {
    if (SUB_FLOOR_TOKEN_CLASSES.has(match[0])) {
      findings.push(`${lineAt(match.index)}: ${match[0]}`);
    }
  }
  for (const match of source.matchAll(/(?<![\w-])text-\[(\d*\.?\d+)(px|rem|em)\]/g)) {
    if (toPx(Number(match[1]), match[2]) < FLOOR_PX) {
      findings.push(`${lineAt(match.index)}: ${match[0]}`);
    }
  }
  for (const match of source.matchAll(/fontSize:\s*(\d*\.?\d+)(?=\s*[,}\n])/g)) {
    if (Number(match[1]) < FLOOR_PX) findings.push(`${lineAt(match.index)}: ${match[0]}`);
  }
  for (const match of source.matchAll(/fontSize:\s*['"`](\d*\.?\d+)(px|rem|em)['"`]/g)) {
    if (toPx(Number(match[1]), match[2]) < FLOOR_PX) {
      findings.push(`${lineAt(match.index)}: ${match[0]}`);
    }
  }
  return findings;
}

describe('the scanner', () => {
  it('flags every way these files have written text under 14px', () => {
    const source = [
      '<p className="text-xs" />',
      '<span className="rounded-full text-caption font-medium" />',
      '<span className="text-metadata" />',
      '<span className="block truncate text-[13px]" />',
      '<span className="text-[0.75rem]" />',
      '<p style={{ fontSize: 13, color: x }} />',
      "<p style={{ fontSize: '12px' }} />",
    ].join('\n');

    expect(findSubFloorText(source)).toEqual([
      '1: text-xs',
      '2: text-caption',
      '3: text-metadata',
      '4: text-[13px]',
      '5: text-[0.75rem]',
      '6: fontSize: 13',
      "7: fontSize: '12px'",
    ]);
  });

  it('passes text at or above the floor', () => {
    const source = [
      '<p className="text-sm text-muted-foreground" />',
      '<p className="text-base" />',
      '<span className="text-[14px] text-foreground" />',
      '<p style={{ fontSize: 14 }} />',
      "<p style={{ fontSize: '1rem' }} />",
    ].join('\n');

    expect(findSubFloorText(source)).toEqual([]);
  });
});

describe('components held to the 14px text floor', () => {
  for (const file of FLOORED_COMPONENTS) {
    it(`${file} draws no text under ${FLOOR_PX}px`, () => {
      expect(findSubFloorText(readFileSync(join(ROOT, file), 'utf8'))).toEqual([]);
    });
  }
});
