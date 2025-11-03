import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDocumentStore } from '../documentStore';
import { DocumentType } from '../../types/document';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

describe('useDocumentStore', () => {
  beforeEach(() => {
    useDocumentStore.getState().reset();
    invokeMock.mockReset();
  });

  it('loads a document and clears stale search results', async () => {
    const fakeDocument = {
      text: 'Example text',
      metadata: {
        file_path: '/tmp/example.docx',
        file_name: 'example.docx',
        file_size: 1024,
        document_type: DocumentType.Word,
      },
    };

    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'document_read') {
        return fakeDocument;
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    useDocumentStore.setState({
      currentDocument: null,
      searchResults: [{ context: 'old', match_text: 'old' }],
      loading: false,
      error: null,
    });

    await useDocumentStore.getState().readDocument('/tmp/example.docx');

    const state = useDocumentStore.getState();
    expect(state.currentDocument).toEqual(fakeDocument);
    expect(state.searchResults).toEqual([]);
    expect(state.loading).toBe(false);
    expect(invokeMock).toHaveBeenCalledWith('document_read', { filePath: '/tmp/example.docx' });
  });

  it('returns search results and stores them', async () => {
    const matches = [
      { context: 'foo', match_text: 'Foo', line: 1 },
      { context: 'bar', match_text: 'Bar', line: 2 },
    ];

    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'document_search') {
        return matches;
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    const results = await useDocumentStore.getState().search('/tmp/example.pdf', 'foo');

    expect(results).toEqual(matches);
    const state = useDocumentStore.getState();
    expect(state.searchResults).toEqual(matches);
    expect(state.loading).toBe(false);
    expect(invokeMock).toHaveBeenCalledWith('document_search', {
      filePath: '/tmp/example.pdf',
      query: 'foo',
    });
  });

  it('maps detectType responses to DocumentType enum', async () => {
    invokeMock.mockResolvedValue('Pdf');

    const detected = await useDocumentStore.getState().detectType('/tmp/example.pdf');

    expect(detected).toBe(DocumentType.Pdf);
    expect(invokeMock).toHaveBeenCalledWith('document_detect_type', {
      filePath: '/tmp/example.pdf',
    });
  });

  it('surfaces detectType errors for unknown values', async () => {
    invokeMock.mockResolvedValue('Unsupported');

    await expect(
      useDocumentStore.getState().detectType('/tmp/example.xyz'),
    ).rejects.toThrow('Unsupported document type: Unsupported');

    const state = useDocumentStore.getState();
    expect(state.error).toBe('Unsupported document type: Unsupported');
  });
});
