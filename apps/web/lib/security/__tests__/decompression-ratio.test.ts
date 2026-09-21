import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  DecompressionLimitError,
  MAX_ARCHIVE_MEMBERS,
  MAX_DECOMPRESSION_RATIO,
  decompressionBudget,
  readArchiveMember,
} from '../archive-bounds';
import {
  OfficeDocumentUnreadableError,
  extractOfficeDocumentText,
} from '@/lib/server/office-document-text';

const SHEET_XML = (rows: string): string =>
  `<?xml version="1.0"?><worksheet><sheetData>${rows}</sheetData></worksheet>`;

async function workbookXlsx(paddingBytes = 0): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    'xl/workbook.xml',
    '<workbook><sheets><sheet name="S1" r:id="rId1"/></sheets></workbook>',
  );
  zip.file('xl/_rels/workbook.xml.rels', '<Relationships/>');
  zip.file(
    'xl/worksheets/sheet1.xml',
    SHEET_XML('<row r="1"><c r="A1" t="inlineStr"><is><t>PLUM-VECTOR</t></is></c></row>'),
  );
  if (paddingBytes > 0) zip.file('xl/padding.bin', 'A'.repeat(paddingBytes));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

describe('decompressionBudget', () => {
  it('takes the ratio ceiling when it is tighter than the absolute cap', () => {
    const budget = decompressionBudget(1_000, 10_000_000);
    expect(budget.ceiling).toBe(1_000 * MAX_DECOMPRESSION_RATIO);
  });

  it('takes the absolute cap when the archive is already large', () => {
    const budget = decompressionBudget(10_000_000, 1_000_000);
    expect(budget.ceiling).toBe(1_000_000);
  });

  it('names the ratio as the limit a bomb crossed', () => {
    const budget = decompressionBudget(100, 10_000_000);
    expect(() => budget.spend(100 * MAX_DECOMPRESSION_RATIO + 1)).toThrow(DecompressionLimitError);
    try {
      decompressionBudget(100, 10_000_000).spend(100 * MAX_DECOMPRESSION_RATIO + 1);
    } catch (error) {
      expect((error as DecompressionLimitError).limit).toBe('ratio');
    }
  });

  it('refuses an archive with more members than the ceiling', () => {
    const budget = decompressionBudget(1_000, 10_000_000);
    expect(() => budget.admitMembers(MAX_ARCHIVE_MEMBERS + 1)).toThrow(DecompressionLimitError);
    expect(() => budget.admitMembers(MAX_ARCHIVE_MEMBERS)).not.toThrow();
  });

  it('counts inflated bytes rather than the size the header declares', async () => {
    const zip = new JSZip();
    zip.file('big.txt', 'A'.repeat(4_000_000));
    const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

    const entry = (await JSZip.loadAsync(archive)).file('big.txt');
    expect(entry).not.toBeNull();
    const budget = decompressionBudget(1_000, 10_000_000);
    await expect(readArchiveMember(entry!, budget)).rejects.toBeInstanceOf(DecompressionLimitError);
  });
});

describe('office documents from chat attachments and project sources', () => {
  it('refuses a workbook whose members inflate past the ratio', async () => {
    const bomb = await workbookXlsx(256 * 1024);
    const archive = await JSZip.loadAsync(bomb);
    const members = await Promise.all(
      Object.values(archive.files)
        .filter((entry) => !entry.dir)
        .map((entry) => entry.async('uint8array')),
    );
    const inflatedBytes = members.reduce((total, member) => total + member.byteLength, 0);
    expect(inflatedBytes / bomb.byteLength).toBeGreaterThan(MAX_DECOMPRESSION_RATIO);
    await expect(extractOfficeDocumentText(bomb, 'quarter.xlsx', 'xlsx')).rejects.toBeInstanceOf(
      OfficeDocumentUnreadableError,
    );
  });

  it('still reads an honest workbook', async () => {
    const text = await extractOfficeDocumentText(await workbookXlsx(), 'quarter.xlsx', 'xlsx');
    expect(text).toContain('PLUM-VECTOR');
  });
});
