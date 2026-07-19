/**
 * Attach-time validation: unsupported/oversized files are rejected up front with
 * a specific reason (QA 1.3.53 / 2.3.45), images + parseable docs are accepted,
 * and pasted-text cards bypass file checks.
 */
const mockIsParseable = jest.fn();
jest.mock('@/services/docParser', () => ({
  isParseableDocument: (...args: unknown[]) => mockIsParseable(...args),
}));

import {
  MAX_ATTACHMENT_BYTES,
  isAcceptableAttachment,
  validateAttachments,
  type ValidatableAttachment,
} from '../src/features/chat/utils/attachmentValidation';

function att(overrides: Partial<ValidatableAttachment> = {}): ValidatableAttachment {
  return { fileName: 'f.txt', mimeType: 'text/plain', uri: 'file:///f.txt', ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsParseable.mockReturnValue(true);
});

describe('isAcceptableAttachment', () => {
  it('accepts images without consulting the doc parser', () => {
    expect(isAcceptableAttachment(att({ fileName: 'p.jpg', mimeType: 'image/jpeg' }))).toBe(true);
    expect(mockIsParseable).not.toHaveBeenCalled();
  });

  it('accepts a parseable document', () => {
    mockIsParseable.mockReturnValue(true);
    expect(isAcceptableAttachment(att({ fileName: 'r.pdf', mimeType: 'application/pdf' }))).toBe(
      true,
    );
  });

  it('rejects an unsupported type with a specific reason', () => {
    mockIsParseable.mockReturnValue(false);
    const verdict = isAcceptableAttachment(
      att({ fileName: 'deck.docx', mimeType: 'application/vnd.openxmlformats' }),
    );
    expect(verdict).not.toBe(true);
    expect(String(verdict)).toContain('deck.docx');
    expect(String(verdict)).toContain('supported');
  });

  it('rejects an oversized file before any type check', () => {
    const verdict = isAcceptableAttachment(
      att({ fileName: 'big.pdf', mimeType: 'application/pdf', fileSize: MAX_ATTACHMENT_BYTES + 1 }),
    );
    expect(verdict).not.toBe(true);
    expect(String(verdict)).toContain('too large');
    expect(mockIsParseable).not.toHaveBeenCalled();
  });

  it('accepts a pasted-text card unconditionally', () => {
    expect(
      isAcceptableAttachment(att({ pastedText: 'a big block', mimeType: 'application/zip' })),
    ).toBe(true);
  });
});

describe('validateAttachments', () => {
  it('splits accepted and rejected, preserving the accepted items', () => {
    mockIsParseable.mockImplementation((uri: string) => uri.endsWith('.txt'));
    const { accepted, rejected } = validateAttachments([
      att({ fileName: 'a.txt', uri: 'file:///a.txt' }),
      att({ fileName: 'b.bin', uri: 'file:///b.bin', mimeType: 'application/octet-stream' }),
    ]);
    expect(accepted.map((a) => a.fileName)).toEqual(['a.txt']);
    expect(rejected.map((r) => r.fileName)).toEqual(['b.bin']);
  });
});
