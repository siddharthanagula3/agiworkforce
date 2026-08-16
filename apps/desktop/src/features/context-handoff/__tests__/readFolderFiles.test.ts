import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FolderCandidate } from '../folderCandidates';
import { readFolderFiles } from '../readFolderFiles';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('../../../lib/tauri-mock', () => ({ invoke: invokeMock }));

const folderGrantId = '11111111-1111-4111-8111-111111111111';
const readCandidates = (candidates: readonly FolderCandidate[]) =>
  readFolderFiles(folderGrantId, candidates);

function candidate(overrides: Partial<FolderCandidate> = {}): FolderCandidate {
  return {
    path: '/Users/siddhartha/repo/src/index.ts',
    relativePath: 'src/index.ts',
    mimeType: 'text/plain',
    byteCount: 5,
    ...overrides,
  };
}

describe('readFolderFiles', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('reads through the opaque-grant, root-relative native command', async () => {
    invokeMock.mockResolvedValue(new TextEncoder().encode('hello'));

    const [approved] = await readCandidates([candidate()]);

    expect(invokeMock).toHaveBeenCalledWith('read_cloud_handoff_file', {
      grantId: folderGrantId,
      relativePath: 'src/index.ts',
    });
    expect(approved?.content).toBe('hello');
  });

  it('names the uploaded file by its root-relative path, never the home directory', async () => {
    invokeMock.mockResolvedValue(new TextEncoder().encode('hello'));

    const [approved] = await readCandidates([candidate()]);

    expect(approved?.file.name).toBe('src/index.ts');
    expect(approved?.file.name).not.toContain('siddhartha');
    expect(approved?.file.name).not.toContain('/Users/');
  });

  it('hands text bytes to the scanner verbatim', async () => {
    invokeMock.mockResolvedValue(new TextEncoder().encode('AWS_SECRET=abc123'));

    const [approved] = await readCandidates([
      candidate({ relativePath: '.env', mimeType: 'text/plain' }),
    ]);

    expect(approved?.content).toBe('AWS_SECRET=abc123');
    expect(approved?.secretScanStatus).toBe('scanned');
  });

  it('replaces listing metadata with the size and checksum of the bytes actually read', async () => {
    invokeMock.mockResolvedValue(new Uint8Array([0x00, 0x01, 0x02, 0x03]));

    const [approved] = await readCandidates([
      candidate({ relativePath: 'changed.bin', mimeType: 'application/pdf', byteCount: 99 }),
    ]);

    expect(approved?.candidate.byteCount).toBe(4);
    expect(approved?.file.size).toBe(4);
    expect(approved?.checksumSha256).toBe(
      '054edec1d0211f624fed0cbca9d4f9400b0e491c43742af2c5b0abebf0c990d8',
    );
  });

  it('substitutes a bounded descriptor for binary rather than scanning bytes', async () => {
    invokeMock.mockResolvedValue(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));

    const [approved] = await readCandidates([
      candidate({ relativePath: 'logo.png', mimeType: 'image/png', byteCount: 4 }),
    ]);

    expect(approved?.content).toBe('[image/png · 4 bytes]');
    expect(approved?.secretScanStatus).toBe('unscanned-binary');
    expect(approved?.file.type).toBe('image/png');
  });

  it('decodes BOM-marked UTF-16 text before secret scanning', async () => {
    const secret = 'OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456';
    const bytes = new Uint8Array(2 + secret.length * 2);
    bytes.set([0xff, 0xfe]);
    for (let index = 0; index < secret.length; index += 1) {
      const code = secret.charCodeAt(index);
      bytes[2 + index * 2] = code & 0xff;
      bytes[3 + index * 2] = code >> 8;
    }
    invokeMock.mockResolvedValue(bytes);

    const [approved] = await readCandidates([
      candidate({ relativePath: 'utf16.txt', mimeType: 'text/plain' }),
    ]);

    expect(approved?.secretScanStatus).toBe('scanned');
    expect(approved?.content).toContain('OPENAI_API_KEY=');
  });

  it('does not award a clean scan status to invalid text encoding', async () => {
    invokeMock.mockResolvedValue(new Uint8Array([0xff, 0x00, 0xfe, 0x00, 0xfd]));

    const [approved] = await readCandidates([
      candidate({ relativePath: 'mislabelled.txt', mimeType: 'text/plain' }),
    ]);

    expect(approved?.secretScanStatus).toBe('unscanned-binary');
    expect(approved?.content).toMatch(/^\[text\/plain/);
  });

  it('drops a file that vanished between listing and confirmation, keeping the rest', async () => {
    invokeMock
      .mockRejectedValueOnce(new Error('ENOENT'))
      .mockResolvedValueOnce(new TextEncoder().encode('still here'));

    const approved = await readCandidates([
      candidate({ relativePath: 'gone.ts' }),
      candidate({ relativePath: 'present.ts' }),
    ]);

    expect(approved).toHaveLength(1);
    expect(approved[0]?.candidate.relativePath).toBe('present.ts');
  });

  it('drops a file that grew beyond the upload limit after discovery', async () => {
    invokeMock.mockResolvedValue(new Uint8Array(12 * 1024 * 1024 + 1));

    const approved = await readCandidates([candidate({ relativePath: 'grew.bin' })]);

    expect(approved).toEqual([]);
  });

  it('returns nothing for an empty selection without touching the filesystem', async () => {
    await expect(readCandidates([])).resolves.toEqual([]);
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
