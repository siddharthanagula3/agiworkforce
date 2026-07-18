import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  getObject: vi.fn(),
  objectKeyFromPublicUrl: vi.fn(),
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
    storageMocks.objectKeyFromPublicUrl.mockReturnValue(
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
    storageMocks.objectKeyFromPublicUrl.mockReturnValue(null);

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
    storageMocks.objectKeyFromPublicUrl.mockReturnValue(
      'knowledge-files/projects/project-1/object.pdf',
    );
    storageMocks.getObject.mockResolvedValue({ data, contentType: 'application/pdf' });
    const destroy = vi.fn().mockResolvedValue(undefined);
    pdfMocks.getDocument.mockReturnValue({
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
        destroy,
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
});
