import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  getObject: vi.fn(),
  objectKeyFromStorageUri: vi.fn(),
  isObjectStorageConfigured: vi.fn(() => true),
}));
const pdfMocks = vi.hoisted(() => ({ getDocument: vi.fn() }));

vi.mock('@/lib/server/object-storage', () => storageMocks);
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => pdfMocks);

import { extractProjectKnowledgeFile } from './project-knowledge-extraction';

function checksum(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

describe('extractProjectKnowledgeFile', () => {
  beforeEach(() => {
    storageMocks.objectKeyFromStorageUri.mockReturnValue(
      'knowledge-files/projects/project-1/object.txt',
    );
  });

  it('reads, verifies, and extracts a project-owned text object', async () => {
    const data = Buffer.from('Launch date: October 4.\r\nOwner: Ada.');
    storageMocks.getObject.mockResolvedValue({ data, contentType: 'text/plain' });

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

    expect(storageMocks.getObject).toHaveBeenCalledWith(
      'knowledge-files/projects/project-1/object.txt',
    );
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
    expect(storageMocks.getObject).not.toHaveBeenCalled();
  });

  it('rejects an object whose bytes do not match the registered checksum', async () => {
    const data = Buffer.from('tampered');
    storageMocks.getObject.mockResolvedValue({ data, contentType: 'text/plain' });

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
    storageMocks.getObject.mockResolvedValue({ data, contentType: 'image/jpeg' });

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
    storageMocks.getObject.mockResolvedValue({
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
    storageMocks.getObject.mockResolvedValue({ data, contentType: 'application/pdf' });
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

  // Notebooks were not accepted at all. Accepting them via the plain-text path
  // would have been worse than useless: it feeds the model the notebook's
  // entire serialized form — base64 PNG outputs, execution counts, kernel
  // metadata — which on a notebook with a few plots is megabytes of noise that
  // crowds out the analysis and burns the project's context budget.
  describe('Jupyter notebooks', () => {
    function notebook(cells: unknown[]): Buffer {
      return Buffer.from(JSON.stringify({ cells, metadata: {}, nbformat: 4 }));
    }

    async function extract(data: Buffer) {
      storageMocks.objectKeyFromStorageUri.mockReturnValue(
        'knowledge-files/projects/project-1/analysis.ipynb',
      );
      storageMocks.getObject.mockResolvedValue({
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
      // Sequential meaning: prose before the code it introduces.
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
});
