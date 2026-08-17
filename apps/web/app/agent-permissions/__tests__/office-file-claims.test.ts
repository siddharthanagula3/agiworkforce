import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createManagedOfficeFileToolDefinition } from '@/lib/services/managed-office-file-service';

/**
 * Claim guard for the "Create an Office file" row on /agent-permissions.
 *
 * The page shipped "Generates a document, spreadsheet, or deck inside the
 * sandbox" while create_office_file's discriminated union accepts only `docx`
 * and `pptx` — a public promise of a format the tool cannot produce. This
 * reads the page source as text (matching app/enterprise's claim guards) so it
 * trips on the words a future writer types, and derives the permitted formats
 * from the tool schema so adding xlsx to the union unblocks the copy on its
 * own.
 */

const PAGE = path.join(path.resolve(__dirname, '..'), 'page.tsx');

const OFFICE_FORMAT_WORDS: Readonly<Record<string, readonly RegExp[]>> = {
  docx: [/\.docx\b/iu, /\bword\b/iu],
  xlsx: [/\.xlsx?\b/iu, /\bexcel\b/iu, /\bspreadsheets?\b/iu, /\bworkbooks?\b/iu],
  pptx: [/\.pptx\b/iu, /\bpowerpoint\b/iu],
};

function officeFileRowCopy(): string {
  const source = readFileSync(PAGE, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^\s*\/\/.*$/gmu, '');
  const row = /k:\s*'Create an Office file',\s*v:\s*'((?:[^'\\]|\\.)*)'/u.exec(source);
  expect(row).not.toBeNull();
  return row![1]!;
}

describe('/agent-permissions — Office file creation claims', () => {
  it('names every format create_office_file accepts and no format it does not', () => {
    const accepted = (
      createManagedOfficeFileToolDefinition().function.parameters.properties.format as {
        enum: readonly string[];
      }
    ).enum;
    const copy = officeFileRowCopy();

    expect(accepted.length).toBeGreaterThan(0);
    for (const format of accepted) {
      expect(copy).toMatch(new RegExp(`\\.${format}\\b`, 'iu'));
    }

    for (const [format, patterns] of Object.entries(OFFICE_FORMAT_WORDS)) {
      if (accepted.includes(format)) continue;
      for (const pattern of patterns) {
        expect(copy).not.toMatch(pattern);
      }
    }
  });

  it('does not place generation inside the code sandbox, which never runs it', () => {
    expect(officeFileRowCopy()).not.toMatch(/\bsandbox\b/iu);
  });
});
