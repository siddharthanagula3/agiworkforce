const mockParseDocument = jest.fn();
jest.mock('../services/docParser', () => ({
  parseDocument: (...args: unknown[]) => mockParseDocument(...args),
}));

import {
  ATTACHED_DOC_MAX_CHARS,
  PROJECT_SOURCES_MAX_CHARS,
  buildAttachedDocumentContext,
  buildProjectSourceContext,
} from '../services/attachmentContext';
import type { MessageAttachment } from '../types/chat';

function file(overrides: Partial<MessageAttachment> = {}): MessageAttachment {
  return {
    url: 'file:///tmp/notes.txt',
    mimeType: 'text/plain',
    fileName: 'notes.txt',
    ...overrides,
  } as MessageAttachment;
}

beforeEach(() => jest.clearAllMocks());

describe('buildAttachedDocumentContext', () => {
  it('includes the extracted text of a supported document', async () => {
    mockParseDocument.mockResolvedValue({ text: 'quarterly revenue is up 12%', metadata: {} });

    const [entry] = await buildAttachedDocumentContext([file()]);

    expect(mockParseDocument).toHaveBeenCalledWith('file:///tmp/notes.txt', 'text/plain');
    expect(entry).toContain('[Attached file: notes.txt (text/plain)]');
    expect(entry).toContain('quarterly revenue is up 12%');
  });

  it('fails closed to an honest reference (no fabricated content) for an unsupported/binary file', async () => {
    mockParseDocument.mockRejectedValue(new Error('UNSUPPORTED_FORMAT'));

    const [entry] = await buildAttachedDocumentContext([
      file({ fileName: 'deck.docx', mimeType: 'application/vnd.openxmlformats' }),
    ]);

    expect(entry).toBe(
      '[Attached file: deck.docx (application/vnd.openxmlformats), content could not be extracted on-device]',
    );
  });

  it('reports an empty document honestly rather than sending blank content', async () => {
    mockParseDocument.mockResolvedValue({ text: '   ', metadata: {} });

    const [entry] = await buildAttachedDocumentContext([file({ fileName: 'blank.csv' })]);

    expect(entry).toContain('no extractable text');
  });

  it('truncates oversized extracted text to protect the prompt budget', async () => {
    mockParseDocument.mockResolvedValue({
      text: 'x'.repeat(ATTACHED_DOC_MAX_CHARS + 500),
      metadata: {},
    });

    const [entry] = await buildAttachedDocumentContext([file()]);

    expect(entry).toContain('…[truncated]');
    expect(entry.length).toBeLessThan(ATTACHED_DOC_MAX_CHARS + 200);
  });

  it('tells the model when only part of a document could be read', async () => {
    mockParseDocument.mockResolvedValue({
      text: 'Introduction.',
      metadata: { docType: 'pdf', partial: true },
    });

    const [entry] = await buildAttachedDocumentContext([file({ mimeType: 'application/pdf' })]);

    expect(entry).toContain('Introduction.');
    expect(entry).toContain('only part of this file could be read');
  });

  it('adds no partial notice for a fully read document', async () => {
    mockParseDocument.mockResolvedValue({ text: 'whole', metadata: { docType: 'txt' } });

    const [entry] = await buildAttachedDocumentContext([file()]);

    expect(entry).not.toContain('only part of this file');
  });
});

describe('buildProjectSourceContext', () => {
  const source = (name: string) => ({
    name,
    mimeType: 'text/plain',
    uri: `file:///cache/${name}`,
  });

  it('labels each extracted source as project knowledge', async () => {
    mockParseDocument.mockResolvedValue({
      text: 'The shipment label is violet-742.',
      metadata: {},
    });

    const [entry] = await buildProjectSourceContext([source('label.txt')]);

    expect(mockParseDocument).toHaveBeenCalledWith('file:///cache/label.txt', 'text/plain');
    expect(entry).toBe(
      '[Project source: label.txt (text/plain)]\nThe shipment label is violet-742.',
    );
  });

  it('names a source that cannot be read instead of dropping it', async () => {
    mockParseDocument.mockRejectedValue(new Error('missing'));

    const [entry] = await buildProjectSourceContext([source('gone.txt')]);

    expect(entry).toBe(
      '[Project source: gone.txt (text/plain), content could not be extracted on-device]',
    );
  });

  it('tells the user to add a copy of a password protected PDF', async () => {
    mockParseDocument.mockRejectedValue(
      Object.assign(new Error('locked'), { code: 'ENCRYPTED_PDF' }),
    );

    const [entry] = await buildProjectSourceContext([source('locked.pdf')]);

    expect(entry).toContain('ask them to add a copy without a password');
  });

  it('shares one context budget across all sources and names the ones left out', async () => {
    mockParseDocument.mockResolvedValue({
      text: 'x'.repeat(PROJECT_SOURCES_MAX_CHARS),
      metadata: {},
    });

    const entries = await buildProjectSourceContext([source('a.txt'), source('b.txt')]);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toContain('x'.repeat(PROJECT_SOURCES_MAX_CHARS));
    expect(entries[1]).toBe(
      '[Project source: b.txt (text/plain), left out because the project sources exceed the context budget]',
    );
    expect(mockParseDocument).toHaveBeenCalledTimes(1);
  });
});
