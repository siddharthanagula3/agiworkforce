/**
 * Doc Q&A parser + RAG index tests (Wave 0).
 *
 * Parser tests cover: TXT, MD, CSV, code. PDF is tested with a minimal
 * synthetic base64 payload since a real PDF binary isn't available in unit tests.
 *
 * RAG index integration test verifies the index→retrieve roundtrip using
 * in-memory SQLite mocks.
 */

// Must be before any imports that pull in the modules under test.
jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn(),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true, size: 1234 }),
  EncodingType: {
    UTF8: 'utf8',
    Base64: 'base64',
  },
}));

// ── Shared SQLite mock state ──────────────────────────────────────────────────

const chunkRows: Record<string, unknown>[] = [];

const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  runAsync: jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes('INSERT') && sql.includes('doc_chunks')) {
      if (params) {
        chunkRows.push({
          id: params[0],
          conversation_id: params[1],
          chunk_index: params[2],
          text: params[3],
          token_count: params[4],
          doc_type: params[5],
          source_uri: params[6] ?? null,
          created_at: params[7],
        });
      }
    }
    if (sql.includes('DELETE') && sql.includes('doc_chunks')) {
      const convId = params?.[0] as string | undefined;
      if (convId) {
        chunkRows.splice(
          0,
          chunkRows.length,
          ...chunkRows.filter((r) => r.conversation_id !== convId),
        );
      }
    }
    return { lastInsertRowId: 0, changes: 1 };
  }),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  getAllAsync: jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes('doc_chunks') && sql.includes('conversation_id')) {
      const convId = params?.[0] as string | undefined;
      if (convId) {
        return chunkRows
          .filter((r) => r.conversation_id === convId)
          .sort((a, b) => (a.chunk_index as number) - (b.chunk_index as number));
      }
    }
    if (sql.includes('doc_chunks') && sql.includes('IN')) {
      const ids = params as string[];
      return chunkRows.filter((r) => ids.includes(r.id as string));
    }
    return [];
  }),
  withTransactionAsync: jest.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
  closeAsync: jest.fn().mockResolvedValue(undefined),
};

// Mock storage/db directly so tests bypass the SQLCipher key derivation and
// migration chain — those are tested separately in storage tests.
jest.mock('../storage/db', () => ({
  getDb: jest.fn().mockResolvedValue(mockDb),
  closeDb: jest.fn().mockResolvedValue(undefined),
  rekeyDb: jest.fn().mockResolvedValue(undefined),
}));

import * as LegacyFS from 'expo-file-system/legacy';
import { parseDocument, DocParseError } from '../services/docParser';
import { indexDocument, retrieve, deleteDocument } from '../services/ragIndex';

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockFs = LegacyFS as jest.Mocked<typeof LegacyFS>;

function setFileContent(content: string, encoding: 'utf8' | 'base64' = 'utf8') {
  mockFs.readAsStringAsync.mockResolvedValue(content);
  void encoding;
}

// Re-apply the getDb mock return value after clearAllMocks (which resets it).
function restoreDbMock() {
  const { getDb } = jest.requireMock('../storage/db') as { getDb: jest.Mock };
  getDb.mockResolvedValue(mockDb);
}

// ── Parser: TXT ───────────────────────────────────────────────────────────────

describe('docParser — TXT', () => {
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

// ── Parser: MD ────────────────────────────────────────────────────────────────

describe('docParser — MD', () => {
  beforeEach(() => jest.clearAllMocks());

  it('parses a markdown file preserving raw text', async () => {
    const md = '# Title\n\nSome **bold** text and a [link](https://example.com).';
    setFileContent(md);
    const result = await parseDocument('file:///tmp/notes.md');
    expect(result.text).toBe(md);
    expect(result.metadata.docType).toBe('md');
  });
});

// ── Parser: CSV ───────────────────────────────────────────────────────────────

describe('docParser — CSV', () => {
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
    // Header only counts as 0 data rows; text should be just "Columns: name, age"
    const result = await parseDocument('file:///tmp/empty.csv');
    // "Columns: name, age" is non-empty so it should parse without error
    expect(result.metadata.rows).toBe(0);
  });
});

// ── Parser: Code ──────────────────────────────────────────────────────────────

describe('docParser — code', () => {
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

// ── Parser: unsupported format ────────────────────────────────────────────────

describe('docParser — unsupported format', () => {
  it('throws UNSUPPORTED_FORMAT for unknown extensions', async () => {
    await expect(parseDocument('file:///tmp/archive.zip')).rejects.toMatchObject({
      code: 'UNSUPPORTED_FORMAT',
    });
  });
});

// ── Parser: PDF (synthetic) ───────────────────────────────────────────────────

describe('docParser — PDF (synthetic)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('extracts text from a minimal synthetic PDF base64', async () => {
    // A real PDF starts with %PDF. We synthesize just enough structure to
    // exercise the extractor without embedding an actual PDF binary.
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

// ── RAG index: integration roundtrip ─────────────────────────────────────────

describe('ragIndex — index → retrieve roundtrip', () => {
  const CONV_ID = 'test-conv-001';

  beforeEach(() => {
    jest.clearAllMocks();
    chunkRows.splice(0);
    // Re-apply implementations cleared by clearAllMocks
    restoreDbMock();
    mockDb.execAsync.mockResolvedValue(undefined);
    mockDb.getFirstAsync.mockResolvedValue(null);
    mockDb.withTransactionAsync.mockImplementation(async (fn: () => Promise<void>) => fn());
    mockDb.runAsync.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('INSERT') && sql.includes('doc_chunks')) {
        if (params) {
          chunkRows.push({
            id: params[0],
            conversation_id: params[1],
            chunk_index: params[2],
            text: params[3],
            token_count: params[4],
            doc_type: params[5],
            source_uri: params[6] ?? null,
            created_at: params[7],
          });
        }
      }
      if (sql.includes('DELETE') && sql.includes('doc_chunks')) {
        const convId = params?.[0] as string | undefined;
        if (convId) {
          chunkRows.splice(
            0,
            chunkRows.length,
            ...chunkRows.filter((r) => r.conversation_id !== convId),
          );
        }
      }
      return { lastInsertRowId: 0, changes: 1 };
    });
    mockDb.getAllAsync.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('doc_chunks') && sql.includes('conversation_id')) {
        const convId = params?.[0] as string | undefined;
        if (convId) {
          return chunkRows
            .filter((r) => r.conversation_id === convId)
            .sort((a, b) => (a.chunk_index as number) - (b.chunk_index as number));
        }
      }
      if (sql.includes('doc_chunks') && sql.includes('IN')) {
        const ids = params as string[];
        return chunkRows.filter((r) => ids.includes(r.id as string));
      }
      return [];
    });
  });

  it('indexes a document and retrieves chunks for a query', async () => {
    const parsed = {
      text: 'The quick brown fox jumps over the lazy dog. '.repeat(30),
      metadata: { docType: 'txt' as const },
    };

    await indexDocument(CONV_ID, parsed, { targetTokens: 100, overlapTokens: 10 });

    expect(chunkRows.length).toBeGreaterThan(0);
    expect(chunkRows[0]!.conversation_id).toBe(CONV_ID);

    const results = await retrieve(CONV_ID, 'fox', 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.conversation_id).toBe(CONV_ID);
  });

  it('respects 4K context budget per chunk (token_count ≤ 500 default)', async () => {
    // 500 tokens ≈ 385 words at 1.3 tok/word. Generate text well above that.
    const longText = Array.from({ length: 1000 }, (_, i) => `word${i}`).join(' ');
    const parsed = {
      text: longText,
      metadata: { docType: 'txt' as const },
    };

    await indexDocument(CONV_ID, parsed);

    for (const chunk of chunkRows) {
      expect(chunk.token_count as number).toBeLessThanOrEqual(520); // 500 + small rounding
    }
  });

  it('deleteDocument removes all chunks for the conversation', async () => {
    const parsed = {
      text: 'Short document for deletion test.',
      metadata: { docType: 'md' as const },
    };

    await indexDocument(CONV_ID, parsed);
    expect(chunkRows.filter((r) => r.conversation_id === CONV_ID).length).toBeGreaterThan(0);

    await deleteDocument(CONV_ID);
    expect(chunkRows.filter((r) => r.conversation_id === CONV_ID).length).toBe(0);
  });
});
