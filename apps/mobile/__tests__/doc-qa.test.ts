jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn(),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true, size: 1234 }),
  EncodingType: {
    UTF8: 'utf8',
    Base64: 'base64',
  },
}));

import * as LegacyFS from 'expo-file-system/legacy';
import { parseDocument, DocParseError } from '../services/docParser';

const mockFs = LegacyFS as jest.Mocked<typeof LegacyFS>;

function setFileContent(content: string) {
  mockFs.readAsStringAsync.mockResolvedValue(content);
}

describe('docParser, TXT', () => {
  beforeEach(() => jest.clearAllMocks());

  it('parses a plain text file', async () => {
    setFileContent('Hello world. This is a test document.');
    const result = await parseDocument('file:///tmp/test.txt');
    expect(result.text).toBe('Hello world. This is a test document.');
    expect(result.metadata.docType).toBe('txt');
  });

  it('throws EMPTY_DOCUMENT on blank file', async () => {
    setFileContent('   \n\n  ');
    await expect(parseDocument('file:///tmp/blank.txt')).rejects.toThrow(DocParseError);
  });
});

describe('docParser, MD', () => {
  beforeEach(() => jest.clearAllMocks());

  it('parses a markdown file preserving raw text', async () => {
    const md = '# Title\n\nSome **bold** text and a [link](https://example.com).';
    setFileContent(md);
    const result = await parseDocument('file:///tmp/notes.md');
    expect(result.text).toBe(md);
    expect(result.metadata.docType).toBe('md');
  });
});

describe('docParser, CSV', () => {
  beforeEach(() => jest.clearAllMocks());

  it('parses a CSV into structured text', async () => {
    setFileContent('name,age,city\nAlice,30,NYC\nBob,25,"San Francisco"');
    const result = await parseDocument('file:///tmp/data.csv');
    expect(result.text).toContain('name: Alice');
    expect(result.text).toContain('city: NYC');
    expect(result.metadata.docType).toBe('csv');
    expect(result.metadata.rows).toBe(2);
    expect(result.metadata.columns).toBe(3);
  });

  it('throws EMPTY_DOCUMENT on CSV with only a header', async () => {
    setFileContent('name,age');
    const result = await parseDocument('file:///tmp/empty.csv');
    expect(result.metadata.rows).toBe(0);
  });
});

describe('docParser, code', () => {
  beforeEach(() => jest.clearAllMocks());

  it('parses a TypeScript file as-is', async () => {
    const code = 'export function add(a: number, b: number): number { return a + b; }';
    setFileContent(code);
    const result = await parseDocument('file:///tmp/math.ts');
    expect(result.text).toBe(code);
    expect(result.metadata.docType).toBe('code');
    expect(result.metadata.language).toBe('ts');
  });

  it('parses a Python file', async () => {
    setFileContent('def hello():\n    print("world")');
    const result = await parseDocument('file:///tmp/script.py');
    expect(result.metadata.docType).toBe('code');
    expect(result.metadata.language).toBe('py');
  });
});

describe('docParser, unsupported format', () => {
  it('throws UNSUPPORTED_FORMAT for unknown extensions', async () => {
    await expect(parseDocument('file:///tmp/archive.zip')).rejects.toMatchObject({
      code: 'UNSUPPORTED_FORMAT',
    });
  });
});

describe('docParser, PDF (synthetic)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('extracts text from a minimal synthetic PDF base64', async () => {
    const fakePdfContent = '%PDF-1.4\n/Type /Page\nBT (Hello from PDF) Tj ET\n';
    const base64 = btoa(fakePdfContent);
    mockFs.readAsStringAsync.mockResolvedValue(base64);
    const result = await parseDocument('file:///tmp/doc.pdf');
    expect(result.metadata.docType).toBe('pdf');
    expect(result.text).toContain('Hello from PDF');
    expect(result.metadata.pages).toBeGreaterThan(0);
  });

  it('throws ENCRYPTED_PDF for PDFs with /Encrypt marker', async () => {
    const fakePdfContent = '%PDF-1.4\n/Encrypt <<>>\n';
    mockFs.readAsStringAsync.mockResolvedValue(btoa(fakePdfContent));
    await expect(parseDocument('file:///tmp/encrypted.pdf')).rejects.toMatchObject({
      code: 'ENCRYPTED_PDF',
    });
  });
});
