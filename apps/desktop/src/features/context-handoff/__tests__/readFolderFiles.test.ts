import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from '@tauri-apps/plugin-fs';
import type { FolderCandidate } from '../folderCandidates';
import { readFolderFiles } from '../readFolderFiles';

const readFileMock = vi.mocked(readFile);

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
    readFileMock.mockReset();
  });

  it('reads through the dialog-scoped fs plugin, not the allowed-directories command', async () => {
    // fsReadFileContent gates on settings.allowed_directories, which Cloud
    // deliberately never adds the folder to — so it cannot be the read path.
    readFileMock.mockResolvedValue(new TextEncoder().encode('hello'));

    const [approved] = await readFolderFiles([candidate()]);

    expect(readFileMock).toHaveBeenCalledWith('/Users/siddhartha/repo/src/index.ts');
    expect(approved?.content).toBe('hello');
  });

  it('names the uploaded file by its root-relative path, never the home directory', async () => {
    readFileMock.mockResolvedValue(new TextEncoder().encode('hello'));

    const [approved] = await readFolderFiles([candidate()]);

    expect(approved?.file.name).toBe('src/index.ts');
    expect(approved?.file.name).not.toContain('siddhartha');
    expect(approved?.file.name).not.toContain('/Users/');
  });

  it('hands text bytes to the scanner verbatim', async () => {
    readFileMock.mockResolvedValue(new TextEncoder().encode('AWS_SECRET=abc123'));

    const [approved] = await readFolderFiles([
      candidate({ relativePath: '.env', mimeType: 'text/plain' }),
    ]);

    // The scanner must see the real content, or a secret cannot be flagged.
    expect(approved?.content).toBe('AWS_SECRET=abc123');
  });

  it('substitutes a bounded descriptor for binary rather than scanning bytes', async () => {
    readFileMock.mockResolvedValue(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));

    const [approved] = await readFolderFiles([
      candidate({ relativePath: 'logo.png', mimeType: 'image/png', byteCount: 4 }),
    ]);

    expect(approved?.content).toBe('[image/png · 4 bytes]');
    // The File still carries the real bytes — only the scan input is bounded.
    expect(approved?.file.type).toBe('image/png');
  });

  it('drops a file that vanished between listing and confirmation, keeping the rest', async () => {
    readFileMock
      .mockRejectedValueOnce(new Error('ENOENT'))
      .mockResolvedValueOnce(new TextEncoder().encode('still here'));

    const approved = await readFolderFiles([
      candidate({ relativePath: 'gone.ts' }),
      candidate({ relativePath: 'present.ts' }),
    ]);

    expect(approved).toHaveLength(1);
    expect(approved[0]?.candidate.relativePath).toBe('present.ts');
  });

  it('returns nothing for an empty selection without touching the filesystem', async () => {
    await expect(readFolderFiles([])).resolves.toEqual([]);
    expect(readFileMock).not.toHaveBeenCalled();
  });
});
