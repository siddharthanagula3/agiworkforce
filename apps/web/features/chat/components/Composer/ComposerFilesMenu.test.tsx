import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LibraryItem } from '@agiworkforce/cloud-contracts';

import {
  COMPOSER_FILES_BROWSE_LABEL,
  COMPOSER_FILES_EMPTY_COPY,
  COMPOSER_FILES_SEARCH_LABEL,
  COMPOSER_FILES_UPLOAD_LABEL,
  ComposerFilesMenu,
  LIBRARY_PATH,
  libraryFileGlyph,
  libraryItemToFile,
  libraryListHref,
  type ComposerFilesMenuProps,
} from './ComposerFilesMenu';

const TRIGGER_LABEL = 'Files';

function item(id: string, patch: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id,
    file_name: `${id}.pdf`,
    mime_type: 'application/pdf',
    kind: 'file',
    byte_count: 10,
    uri: `/api/files/${id}`,
    surface: 'file',
    previewable: false,
    origin: 'uploaded',
    source_surface: null,
    provider: null,
    model: null,
    prompt: null,
    created_at: '2026-09-05T00:00:00.000Z',
    ...patch,
  };
}

function stubLibrary(items: LibraryItem[]) {
  const calls: string[] = [];
  const fetchMock = vi.fn((input: string) => {
    calls.push(input);
    if (input.startsWith('/api/library')) {
      const query = new URL(input, 'http://localhost').searchParams.get('q');
      const matched = query ? items.filter((entry) => entry.file_name.includes(query)) : items;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: matched, has_more: false, next_offset: null }),
      });
    }
    return Promise.resolve({
      ok: true,
      blob: () => Promise.resolve(new Blob(['pdf-bytes'], { type: 'application/pdf' })),
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderMenu(overrides: Partial<ComposerFilesMenuProps> = {}) {
  const props: ComposerFilesMenuProps = {
    children: <button type="button">{TRIGGER_LABEL}</button>,
    onAttach: vi.fn(),
    onUploadFromDevice: vi.fn(),
    open: true,
    ...overrides,
  };
  render(<ComposerFilesMenu {...props} />);
  return props;
}

describe('library requests', () => {
  it('asks for the six most recent files and passes the search through q', () => {
    expect(libraryListHref('')).toBe('/api/library?limit=6&sort=modified');
    expect(libraryListHref(' report ')).toBe('/api/library?q=report&limit=6&sort=modified');
  });

  it('wraps the fetched bytes in a file that keeps its name and type', async () => {
    stubLibrary([]);
    const file = await libraryItemToFile(item('deck', { file_name: 'deck.pdf' }));
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('deck.pdf');
    expect(file.type).toBe('application/pdf');
    expect(file.size).toBe('pdf-bytes'.length);
  });

  it('picks a glyph by kind and treats video by its mime type', () => {
    expect(libraryFileGlyph({ file_name: 'a.png', mime_type: 'image/png' })).toBeTruthy();
    expect(libraryFileGlyph({ file_name: 'a.mp4', mime_type: 'video/mp4' })).not.toBe(
      libraryFileGlyph({ file_name: 'a.pdf', mime_type: 'application/pdf' }),
    );
  });
});

describe('ComposerFilesMenu populated', () => {
  it('lists the recent files with a search field, Browse all and Upload from device', async () => {
    const calls = stubLibrary([
      item('a'),
      item('b', { file_name: 'b.png', mime_type: 'image/png' }),
    ]);
    renderMenu();
    expect(screen.getByLabelText(COMPOSER_FILES_SEARCH_LABEL)).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Attach a.pdf' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Attach b.png' })).toBeTruthy();
    expect(calls[0]).toBe('/api/library?limit=6&sort=modified');
    expect(
      screen.getByRole('link', { name: COMPOSER_FILES_BROWSE_LABEL }).getAttribute('href'),
    ).toBe(LIBRARY_PATH);
    expect(screen.getByRole('button', { name: COMPOSER_FILES_UPLOAD_LABEL })).toBeTruthy();
  });

  it('searches the library through q after the field settles', async () => {
    const calls = stubLibrary([item('report'), item('deck')]);
    renderMenu();
    await screen.findByRole('button', { name: 'Attach report.pdf' });
    fireEvent.change(screen.getByLabelText(COMPOSER_FILES_SEARCH_LABEL), {
      target: { value: 'deck' },
    });
    await waitFor(() => expect(calls.at(-1)).toBe('/api/library?q=deck&limit=6&sort=modified'));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Attach report.pdf' })).toBeNull(),
    );
    expect(screen.getByRole('button', { name: 'Attach deck.pdf' })).toBeTruthy();
  });

  it('fetches the chosen file and hands it to the composer as an attachment', async () => {
    const calls = stubLibrary([item('deck')]);
    const props = renderMenu();
    fireEvent.click(await screen.findByRole('button', { name: 'Attach deck.pdf' }));
    await waitFor(() => expect(props.onAttach).toHaveBeenCalledTimes(1));
    const file = (props.onAttach as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as File;
    expect(file.name).toBe('deck.pdf');
    expect(file.type).toBe('application/pdf');
    expect(calls).toContain('/api/files/deck');
  });

  it('clicks the device file input from Upload from device', async () => {
    stubLibrary([item('deck')]);
    const props = renderMenu();
    await screen.findByRole('button', { name: 'Attach deck.pdf' });
    fireEvent.click(screen.getByRole('button', { name: COMPOSER_FILES_UPLOAD_LABEL }));
    expect(props.onUploadFromDevice).toHaveBeenCalledTimes(1);
  });
});

describe('ComposerFilesMenu empty', () => {
  it('says the library is empty and keeps Browse all and Upload from device', async () => {
    stubLibrary([]);
    renderMenu();
    expect(await screen.findByText(COMPOSER_FILES_EMPTY_COPY)).toBeTruthy();
    expect(screen.getByRole('link', { name: COMPOSER_FILES_BROWSE_LABEL })).toBeTruthy();
    expect(screen.getByRole('button', { name: COMPOSER_FILES_UPLOAD_LABEL })).toBeTruthy();
  });

  it('does not touch the library until it opens', async () => {
    const calls = stubLibrary([item('deck')]);
    render(
      <ComposerFilesMenu onAttach={vi.fn()} onUploadFromDevice={vi.fn()}>
        <button type="button">{TRIGGER_LABEL}</button>
      </ComposerFilesMenu>,
    );
    expect(calls).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: TRIGGER_LABEL }));
    expect(await screen.findByRole('button', { name: 'Attach deck.pdf' })).toBeTruthy();
  });
});
