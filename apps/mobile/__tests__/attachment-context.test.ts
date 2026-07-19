/**
 * buildAttachedDocumentContext turns non-image chat attachments into REAL text
 * (via the shared on-device docParser) instead of a bare reference stub, and
 * fails closed to an honest reference for unsupported/binary files.
 */
const mockParseDocument = jest.fn();
jest.mock('../services/docParser', () => ({
  parseDocument: (...args: unknown[]) => mockParseDocument(...args),
}));

import {
  ATTACHED_DOC_MAX_CHARS,
  buildAttachedDocumentContext,
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
      '[Attached file: deck.docx (application/vnd.openxmlformats) — content could not be extracted on-device]',
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
});
