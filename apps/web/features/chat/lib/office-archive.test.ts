import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  DecompressionLimitError,
  MAX_ARCHIVE_MEMBERS,
  decompressionBudget,
} from '@/lib/security/archive-budget';
import {
  officeMemberText,
  openOfficeArchive,
  readOfficeMember,
  storedOfficeArchive,
} from './office-archive';

describe('browser Office archive bounds', () => {
  it('reads UTF-8 text and keeps missing members distinct from empty members', async () => {
    const zip = new JSZip();
    zip.file('text.xml', '日本語 🌍');
    zip.file('empty.xml', '');
    const archive = await openOfficeArchive(await zip.generateAsync({ type: 'arraybuffer' }));
    expect(await officeMemberText(archive, 'text.xml')).toBe('日本語 🌍');
    expect(await officeMemberText(archive, 'empty.xml')).toBe('');
    expect(await officeMemberText(archive, 'missing.xml')).toBeUndefined();
  });

  it('charges each member once against the same total budget', async () => {
    const zip = new JSZip();
    zip.file('first', new Uint8Array(6));
    zip.file('second', new Uint8Array(5));
    const budget = decompressionBudget(100, 10);
    expect(await readOfficeMember(zip.file('first')!, budget)).toHaveLength(6);
    expect(budget.spent).toBe(6);
    await expect(readOfficeMember(zip.file('second')!, budget)).rejects.toMatchObject({
      limit: 'total_bytes',
    });
  });

  it('charges an oversized image before skipping it', async () => {
    const zip = new JSZip();
    zip.file('image', new Uint8Array(11));
    const budget = decompressionBudget(100, 100);
    expect(await readOfficeMember(zip.file('image')!, budget, 10)).toBeNull();
    expect(budget.spent).toBe(11);
  });

  it('does not hide an archive budget failure behind an image skip', async () => {
    const zip = new JSZip();
    zip.file('image', new Uint8Array(11));
    await expect(
      readOfficeMember(zip.file('image')!, decompressionBudget(100, 10), 5),
    ).rejects.toBeInstanceOf(DecompressionLimitError);
  });

  it('rejects actual inflated bytes above the ratio ceiling', async () => {
    const zip = new JSZip();
    zip.file('bomb.xml', 'A'.repeat(1_000_000));
    const archive = await openOfficeArchive(
      await zip.generateAsync({
        type: 'arraybuffer',
        compression: 'DEFLATE',
        comment: 'Office package',
      }),
    );
    await expect(officeMemberText(archive, 'bomb.xml')).rejects.toMatchObject({ limit: 'ratio' });
  });

  it('counts non-directory members before opening any member', async () => {
    const zip = new JSZip();
    for (let index = 0; index <= MAX_ARCHIVE_MEMBERS; index++) zip.file(`part-${index}`, '');
    await expect(
      openOfficeArchive(await zip.generateAsync({ type: 'arraybuffer' })),
    ).rejects.toMatchObject({ limit: 'members' });
    const directories = new JSZip();
    for (let index = 0; index <= MAX_ARCHIVE_MEMBERS; index++) directories.folder(`dir-${index}`);
    await expect(
      openOfficeArchive(await directories.generateAsync({ type: 'arraybuffer' })),
    ).resolves.toBeDefined();
  });

  it('rebuilds admitted DOCX parts using STORE and preserves their bytes', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', '<document>日本語</document>', { createFolders: false });
    const stored = await storedOfficeArchive(
      await zip.generateAsync({
        type: 'arraybuffer',
        compression: 'DEFLATE',
        comment: 'Office package',
      }),
    );
    expect(new DataView(stored).getUint16(8, true)).toBe(0);
    const accepted = await JSZip.loadAsync(stored);
    expect(Reflect.get(accepted, 'comment')).toBe('Office package');
    expect(await accepted.file('word/document.xml')!.async('string')).toBe(
      '<document>日本語</document>',
    );
  });

  it('rejects an oversized unreferenced DOCX part during STORE rebuilding', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', '<document>Text</document>');
    zip.file('unreferenced.bin', 'A'.repeat(1_000_000));
    await expect(
      storedOfficeArchive(
        await zip.generateAsync({
          type: 'arraybuffer',
          compression: 'DEFLATE',
          comment: 'Office package',
        }),
      ),
    ).rejects.toBeInstanceOf(DecompressionLimitError);
  });
});
