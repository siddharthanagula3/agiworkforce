import { describe, expect, it } from 'vitest';

import {
  LARGE_PASTE_THRESHOLD,
  dataTransferCarriesFiles,
  decideComposerPaste,
  filesFromDataTransfer,
} from '../composerPaste';

type FakeItem = { kind: string; getAsFile: () => File | null };

function fakeTransfer(options: {
  items?: FakeItem[];
  files?: File[];
  text?: string;
  types?: string[];
}): DataTransfer {
  const items = options.items ?? [];
  const indexed = Object.assign(
    { length: items.length },
    Object.fromEntries(items.map((item, index) => [index, item])),
  );
  const files = options.files;
  return {
    items: options.items === undefined && files ? undefined : indexed,
    ...(files
      ? {
          files: Object.assign(
            { length: files.length },
            Object.fromEntries(files.map((file, index) => [index, file])),
          ),
        }
      : {}),
    types: options.types ?? [],
    getData: (type: string) => (type === 'text/plain' ? (options.text ?? '') : ''),
  } as unknown as DataTransfer;
}

function fileItem(file: File): FakeItem {
  return { kind: 'file', getAsFile: () => file };
}

describe('composer paste policy', () => {
  it('reports pasted files regardless of their MIME type', () => {
    const png = new File([new Uint8Array([1])], 'shot.png', { type: 'image/png' });
    const pdf = new File([new Uint8Array([1])], 'spec.pdf', { type: 'application/pdf' });

    const decision = decideComposerPaste(
      fakeTransfer({
        items: [fileItem(png), { kind: 'string', getAsFile: () => null }, fileItem(pdf)],
      }),
    );

    expect(decision).toEqual({ kind: 'files', files: [png, pdf] });
  });

  it('turns a book-sized text paste into a numbered .txt attachment', () => {
    const decision = decideComposerPaste(
      fakeTransfer({ text: 'x'.repeat(LARGE_PASTE_THRESHOLD) }),
      {
        existingFileNames: ['Pasted text.txt', 'diagram.png'],
      },
    );

    expect(decision.kind).toBe('attachment');
    if (decision.kind !== 'attachment') return;
    expect(decision.file.name).toBe('Pasted text 2.txt');
    expect(decision.file.type).toBe('text/plain');
  });

  it('leaves an ordinary text paste to the textarea', () => {
    expect(
      decideComposerPaste(fakeTransfer({ text: 'x'.repeat(LARGE_PASTE_THRESHOLD - 1) })),
    ).toEqual({ kind: 'text' });
    expect(decideComposerPaste(null)).toEqual({ kind: 'text' });
  });

  it('extracts only file entries from a drop', () => {
    const png = new File([new Uint8Array([1])], 'shot.png', { type: 'image/png' });

    expect(
      filesFromDataTransfer(
        fakeTransfer({ items: [{ kind: 'string', getAsFile: () => null }, fileItem(png)] }),
      ),
    ).toEqual([png]);
    expect(filesFromDataTransfer(null)).toEqual([]);
  });

  it('reads a drop that populates only `files`', () => {
    const png = new File([new Uint8Array([1])], 'dropped.png', { type: 'image/png' });

    expect(filesFromDataTransfer(fakeTransfer({ files: [png], types: ['Files'] }))).toEqual([png]);
  });

  it('detects a file drag only when the drag carries Files', () => {
    expect(dataTransferCarriesFiles(fakeTransfer({ types: ['text/plain', 'Files'] }))).toBe(true);
    expect(dataTransferCarriesFiles(fakeTransfer({ types: ['text/plain'] }))).toBe(false);
    expect(dataTransferCarriesFiles(undefined)).toBe(false);
  });
});
