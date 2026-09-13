import { createHash } from 'node:crypto';

import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => {
  class StoredObjectTooLargeError extends Error {
    constructor(
      readonly key: string,
      readonly maxBytes: number,
      readonly contentLength?: number,
    ) {
      super(`Stored object exceeds the permitted ${maxBytes} bytes`);
      this.name = 'StoredObjectTooLargeError';
    }
  }
  return {
    getObject: vi.fn(),
    getPrivateObject: vi.fn(),
    getBoundedObject: vi.fn(),
    getBoundedPrivateObject: vi.fn(),
    objectKeyFromStorageUri: vi.fn(),
    isObjectStorageConfigured: vi.fn(() => true),
    isPrivateObjectStorageConfigured: vi.fn(() => true),
    deleteObject: vi.fn(),
    deletePrivateObject: vi.fn(),
    StoredObjectTooLargeError,
  };
});
const pdfMocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  OPS: { paintImageXObject: 85 },
}));

const transcribeMocks = vi.hoisted(() => ({ transcribeScannedPages: vi.fn() }));

vi.mock('@/lib/server/object-storage', () => storageMocks);
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => pdfMocks);
vi.mock('./scanned-document-text', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./scanned-document-text')>()),
  transcribeScannedPages: (...args: unknown[]) =>
    transcribeMocks.transcribeScannedPages(...args) as unknown,
}));

import { extractProjectKnowledgeFile } from './project-knowledge-extraction';

function checksum(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

describe('extractProjectKnowledgeFile', () => {
  beforeEach(() => {
    transcribeMocks.transcribeScannedPages.mockReset();
    storageMocks.objectKeyFromStorageUri.mockReturnValue(
      'knowledge-files/projects/project-1/object.txt',
    );
  });

  it('reads, verifies, and extracts a project-owned text object', async () => {
    const data = Buffer.from('Launch date: October 4.\r\nOwner: Ada.');
    storageMocks.getBoundedPrivateObject.mockResolvedValue({ data, contentType: 'text/plain' });

    await expect(
      extractProjectKnowledgeFile({
        projectId: 'project-1',
        storageUri: 'https://files.example.test/knowledge-files/projects/project-1/object.txt',
        fileName: 'launch.txt',
        mimeType: 'text/plain',
        byteCount: data.byteLength,
        checksumSha256: checksum(data),
      }),
    ).resolves.toEqual({ extractedText: 'Launch date: October 4.\nOwner: Ada.' });

    expect(storageMocks.getBoundedPrivateObject).toHaveBeenCalledWith(
      'knowledge-files/projects/project-1/object.txt',
      data.byteLength,
    );
  });

  it('extracts a spreadsheet the project uploaded, sheet names and formulas included', async () => {
    const zip = new JSZip();
    zip.file(
      'xl/workbook.xml',
      '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Budget" sheetId="1" r:id="rId1"/></sheets></workbook>',
    );
    zip.file(
      'xl/_rels/workbook.xml.rels',
      '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    );
    zip.file(
      'xl/worksheets/sheet1.xml',
      '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Total</t></is></c><c r="B1"><f>SUM(B2:B4)</f></c></row></sheetData></worksheet>',
    );
    const data = await zip.generateAsync({ type: 'nodebuffer' });
    storageMocks.objectKeyFromStorageUri.mockReturnValue(
      'knowledge-files/projects/project-1/object.xlsx',
    );
    storageMocks.getBoundedPrivateObject.mockResolvedValue({
      data,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const result = await extractProjectKnowledgeFile({
      projectId: 'project-1',
      storageUri: 'https://files.example.test/knowledge-files/projects/project-1/object.xlsx',
      fileName: 'budget.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      byteCount: data.byteLength,
      checksumSha256: checksum(data),
    });

    expect(result.extractedText).toContain('## Sheet: Budget');
    expect(result.extractedText).toContain('=SUM(B2:B4)');
  });

  it('refuses to buffer a stored object that outgrew its declared byte count', async () => {
    storageMocks.getBoundedPrivateObject.mockRejectedValue(
      new storageMocks.StoredObjectTooLargeError(
        'knowledge-files/projects/project-1/object.txt',
        12,
        4 * 1024 * 1024 * 1024,
      ),
    );

    await expect(
      extractProjectKnowledgeFile({
        projectId: 'project-1',
        storageUri: 'https://files.example.test/knowledge-files/projects/project-1/object.txt',
        fileName: 'launch.txt',
        mimeType: 'text/plain',
        byteCount: 12,
        checksumSha256: 'a'.repeat(64),
      }),
    ).rejects.toMatchObject({ code: 'byte_count_mismatch' });
  });

  it('refuses a declared byte count above the attachment maximum before touching storage', async () => {
    await expect(
      extractProjectKnowledgeFile({
        projectId: 'project-1',
        storageUri: 'https://files.example.test/knowledge-files/projects/project-1/object.txt',
        fileName: 'launch.txt',
        mimeType: 'text/plain',
        byteCount: 4 * 1024 * 1024 * 1024,
        checksumSha256: 'a'.repeat(64),
      }),
    ).rejects.toMatchObject({ code: 'byte_count_mismatch' });

    expect(storageMocks.getBoundedPrivateObject).not.toHaveBeenCalled();
  });

  it('rejects a URL that is not a configured project object without fetching it', async () => {
    storageMocks.objectKeyFromStorageUri.mockReturnValue(null);

    await expect(
      extractProjectKnowledgeFile({
        projectId: 'project-1',
        storageUri: 'https://attacker.example/notes.txt',
        fileName: 'notes.txt',
        mimeType: 'text/plain',
        byteCount: 5,
        checksumSha256: checksum(Buffer.from('hello')),
      }),
    ).rejects.toMatchObject({ code: 'invalid_storage_uri' });
    expect(storageMocks.getBoundedPrivateObject).not.toHaveBeenCalled();
  });

  it('rejects an object whose bytes do not match the registered checksum', async () => {
    const data = Buffer.from('tampered');
    storageMocks.getBoundedPrivateObject.mockResolvedValue({ data, contentType: 'text/plain' });

    await expect(
      extractProjectKnowledgeFile({
        projectId: 'project-1',
        storageUri: 'https://files.example.test/knowledge-files/projects/project-1/object.txt',
        fileName: 'notes.txt',
        mimeType: 'text/plain',
        byteCount: data.byteLength,
        checksumSha256: checksum(Buffer.from('original')),
      }),
    ).rejects.toMatchObject({ code: 'checksum_mismatch' });
  });

  it('keeps image uploads but does not invent extractable text', async () => {
    const data = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    storageMocks.getBoundedPrivateObject.mockResolvedValue({ data, contentType: 'image/jpeg' });

    await expect(
      extractProjectKnowledgeFile({
        projectId: 'project-1',
        storageUri: 'https://files.example.test/knowledge-files/projects/project-1/object.jpg',
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
        byteCount: data.byteLength,
        checksumSha256: checksum(data),
      }),
    ).resolves.toEqual({ extractedText: null });
  });

  it('extracts an allowed text extension when the browser reports a generic MIME type', async () => {
    const data = Buffer.from('# Finder upload\n\nStill text.');
    storageMocks.getBoundedPrivateObject.mockResolvedValue({
      data,
      contentType: 'application/octet-stream',
    });

    await expect(
      extractProjectKnowledgeFile({
        projectId: 'project-1',
        storageUri: 'https://files.example.test/knowledge-files/projects/project-1/object.md',
        fileName: 'notes.md',
        mimeType: 'application/octet-stream',
        byteCount: data.byteLength,
        checksumSha256: checksum(data),
      }),
    ).resolves.toEqual({ extractedText: '# Finder upload\n\nStill text.' });
  });

  it('extracts bounded page text from a real PDF-shaped object', async () => {
    const data = Buffer.from('%PDF-1.7\nfixture');
    storageMocks.objectKeyFromStorageUri.mockReturnValue(
      'knowledge-files/projects/project-1/object.pdf',
    );
    storageMocks.getBoundedPrivateObject.mockResolvedValue({
      data,
      contentType: 'application/pdf',
    });
    const destroy = vi.fn().mockResolvedValue(undefined);
    pdfMocks.getDocument.mockReturnValue({
      destroy,
      promise: Promise.resolve({
        numPages: 2,
        getPage: vi
          .fn()
          .mockResolvedValueOnce({
            getTextContent: vi.fn().mockResolvedValue({ items: [{ str: 'Page one' }] }),
          })
          .mockResolvedValueOnce({
            getTextContent: vi.fn().mockResolvedValue({ items: [{ str: 'Page two' }] }),
          }),
      }),
    });

    await expect(
      extractProjectKnowledgeFile({
        projectId: 'project-1',
        storageUri: 'https://files.example.test/knowledge-files/projects/project-1/object.pdf',
        fileName: 'plan.pdf',
        mimeType: 'application/pdf',
        byteCount: data.byteLength,
        checksumSha256: checksum(data),
      }),
    ).resolves.toEqual({ extractedText: 'Page one\n\nPage two' });
    expect(destroy).toHaveBeenCalledOnce();
  });

  describe('Jupyter notebooks', () => {
    function notebook(cells: unknown[]): Buffer {
      return Buffer.from(JSON.stringify({ cells, metadata: {}, nbformat: 4 }));
    }

    async function extract(data: Buffer) {
      storageMocks.objectKeyFromStorageUri.mockReturnValue(
        'knowledge-files/projects/project-1/analysis.ipynb',
      );
      storageMocks.getBoundedPrivateObject.mockResolvedValue({
        data,
        contentType: 'application/x-ipynb+json',
      });
      return extractProjectKnowledgeFile({
        projectId: 'project-1',
        storageUri: 'https://files.example.test/knowledge-files/projects/project-1/analysis.ipynb',
        fileName: 'analysis.ipynb',
        mimeType: 'application/x-ipynb+json',
        byteCount: data.byteLength,
        checksumSha256: checksum(data),
      });
    }

    it('keeps markdown prose, source code, and text output in order', async () => {
      const data = notebook([
        { cell_type: 'markdown', source: ['# Revenue analysis\n', 'Q3 numbers.'] },
        {
          cell_type: 'code',
          source: 'df.describe()',
          outputs: [{ output_type: 'stream', text: ['count 42\n'] }],
        },
      ]);

      const { extractedText } = await extract(data);
      expect(extractedText).toContain('# Revenue analysis');
      expect(extractedText).toContain('df.describe()');
      expect(extractedText).toContain('count 42');
      expect(extractedText!.indexOf('Revenue analysis')).toBeLessThan(
        extractedText!.indexOf('df.describe()'),
      );
    });

    it('drops image outputs rather than feeding the model base64', async () => {
      const hugeBase64 = 'iVBORw0KGgo' + 'A'.repeat(5000);
      const data = notebook([
        {
          cell_type: 'code',
          source: 'plot()',
          outputs: [
            { output_type: 'display_data', data: { 'image/png': hugeBase64 } },
            { output_type: 'execute_result', data: { 'text/plain': '<Figure size 640x480>' } },
          ],
        },
      ]);

      const { extractedText } = await extract(data);
      expect(extractedText).toContain('plot()');
      expect(extractedText).toContain('<Figure size 640x480>');
      expect(extractedText).not.toContain('iVBORw0KGgo');
    });

    it('keeps error output, which is often the most informative cell', async () => {
      const data = notebook([
        {
          cell_type: 'code',
          source: 'x / 0',
          outputs: [
            { output_type: 'error', ename: 'ZeroDivisionError', evalue: 'division by zero' },
          ],
        },
      ]);

      const { extractedText } = await extract(data);
      expect(extractedText).toContain('ZeroDivisionError');
      expect(extractedText).toContain('division by zero');
    });

    it('rejects a file that is not a readable notebook', async () => {
      await expect(extract(Buffer.from('not json at all'))).rejects.toThrow(
        /readable Jupyter notebook/,
      );
    });

    it('rejects notebook-shaped JSON with no cells array', async () => {
      await expect(extract(Buffer.from(JSON.stringify({ nbformat: 4 })))).rejects.toThrow(
        /does not contain notebook cells/,
      );
    });

    it('returns null for a notebook with nothing readable in it', async () => {
      const { extractedText } = await extract(notebook([{ cell_type: 'code', source: '' }]));
      expect(extractedText).toBeNull();
    });
  });

  describe('a scanned PDF', () => {
    const SCAN_PIXELS = new Uint8Array(4 * 3).fill(200);

    function scannedDocument(): void {
      const data = Buffer.from('%PDF-1.7\nscan');
      storageMocks.objectKeyFromStorageUri.mockReturnValue(
        'knowledge-files/projects/project-1/scan.pdf',
      );
      storageMocks.getBoundedPrivateObject.mockResolvedValue({
        data,
        contentType: 'application/pdf',
      });
      const page = {
        getTextContent: vi.fn().mockResolvedValue({ items: [] }),
        getOperatorList: vi.fn().mockResolvedValue({
          fnArray: [pdfMocks.OPS.paintImageXObject],
          argsArray: [['img0']],
        }),
        objs: {
          get: (_name: string, resolve: (value: unknown) => void) =>
            resolve({ width: 2, height: 2, kind: 2, data: SCAN_PIXELS }),
        },
      };
      pdfMocks.getDocument.mockReturnValue({
        destroy: vi.fn().mockResolvedValue(undefined),
        promise: Promise.resolve({ numPages: 1, getPage: vi.fn().mockResolvedValue(page) }),
      });
    }

    function scanInput(extra: Record<string, unknown> = {}) {
      const data = Buffer.from('%PDF-1.7\nscan');
      return {
        projectId: 'project-1',
        storageUri: 'https://files.example.test/knowledge-files/projects/project-1/scan.pdf',
        fileName: 'invoice.pdf',
        mimeType: 'application/pdf',
        byteCount: data.byteLength,
        checksumSha256: checksum(data),
        ...extra,
      };
    }

    it('stores the recognised text, marked as read from the scan', async () => {
      scannedDocument();
      transcribeMocks.transcribeScannedPages.mockResolvedValue(
        'INVOICE 2026-09-13\nTotal: $412.00',
      );

      const result = await extractProjectKnowledgeFile(
        scanInput({
          transcribeScans: {
            db: {},
            userId: 'user-1',
            organizationId: null,
            planTier: 'pro',
            documentId: 'project-1:scan',
          },
        }),
      );

      expect(result.extractedText).toContain('Recognised from page images');
      expect(result.extractedText).toContain('Total: $412.00');
      expect(transcribeMocks.transcribeScannedPages).toHaveBeenCalledWith(
        expect.objectContaining({
          documentId: 'project-1:scan',
          pageImages: [expect.objectContaining({ mimeType: 'image/png' })],
        }),
      );
    });

    it('stores nothing rather than a note with no text behind it', async () => {
      scannedDocument();
      transcribeMocks.transcribeScannedPages.mockResolvedValue(null);

      const result = await extractProjectKnowledgeFile(
        scanInput({
          transcribeScans: {
            db: {},
            userId: 'user-1',
            organizationId: null,
            planTier: 'pro',
            documentId: 'project-1:scan',
          },
        }),
      );

      expect(result.extractedText).toBeNull();
    });

    it('does not read the pictures for a caller that cannot pay for it', async () => {
      scannedDocument();

      const result = await extractProjectKnowledgeFile(scanInput());

      expect(result.extractedText).toBeNull();
      expect(transcribeMocks.transcribeScannedPages).not.toHaveBeenCalled();
    });
  });
});
