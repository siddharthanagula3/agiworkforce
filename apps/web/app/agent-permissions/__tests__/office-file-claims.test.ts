import { describe, expect, it } from 'vitest';

import { createManagedOfficeFileToolDefinition } from '@/lib/services/managed-office-file-service';
import { buildToolApprovalToolRows } from '@/lib/tool-approval-view';

/**
 * Claim guard for the "Create a document file" row on /agent-permissions.
 *
 * The page shipped "Generates a document, spreadsheet, or deck inside the
 * sandbox" while create_office_file's discriminated union accepted only `docx`
 * and `pptx`, a public promise of a format the tool cannot produce. The
 * permitted formats are derived from the tool schema, so adding one to the
 * union unblocks the copy on its own.
 */

const OFFICE_FORMAT_WORDS: Readonly<Record<string, readonly RegExp[]>> = {
  docx: [/\.docx\b/iu, /\bword\b/iu],
  xlsx: [/\.xlsx?\b/iu, /\bexcel\b/iu, /\bspreadsheets?\b/iu, /\bworkbooks?\b/iu],
  pptx: [/\.pptx\b/iu, /\bpowerpoint\b/iu],
  pdf: [/\.pdf\b/iu],
  csv: [/\.csv\b/iu],
};

function officeFileRowCopy(): string {
  const row = buildToolApprovalToolRows().find((entry) => entry.name === 'create_office_file');
  expect(row, 'create_office_file needs a published row').toBeDefined();
  return row!.description;
}

describe('/agent-permissions, document file creation claims', () => {
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
