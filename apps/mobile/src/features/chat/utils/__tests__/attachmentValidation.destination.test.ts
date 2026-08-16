const mockIsParseable = jest.fn();
jest.mock('@/services/docParser', () => ({
  isParseableDocument: (...args: unknown[]) => mockIsParseable(...args),
}));

import {
  MAX_ATTACHMENT_BYTES,
  MAX_CLOUD_ATTACHMENT_BYTES,
  maxAttachmentBytesFor,
  isAcceptableAttachment,
  validateAttachments,
  type ValidatableAttachment,
} from '@/src/features/chat/utils/attachmentValidation';

const TWENTY_MB = 20 * 1024 * 1024;

function doc(overrides: Partial<ValidatableAttachment> = {}): ValidatableAttachment {
  return { fileName: 'big.pdf', mimeType: 'application/pdf', uri: 'file:///big.pdf', ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsParseable.mockReturnValue(true);
});

describe('the cloud ceiling is the upload contract, not the device ceiling', () => {
  it('is the 12 MiB managed-cloud contract, strictly below the device ceiling', () => {
    expect(MAX_CLOUD_ATTACHMENT_BYTES).toBe(12 * 1024 * 1024);
    expect(MAX_CLOUD_ATTACHMENT_BYTES).toBeLessThan(MAX_ATTACHMENT_BYTES);
    expect(maxAttachmentBytesFor('cloud')).toBe(MAX_CLOUD_ATTACHMENT_BYTES);
    expect(maxAttachmentBytesFor('local')).toBe(MAX_ATTACHMENT_BYTES);
  });

  it('refuses a 20 MB file bound for AGI Cloud, naming the real cause', () => {
    const verdict = isAcceptableAttachment(doc({ fileSize: TWENTY_MB }), 'cloud');

    expect(verdict).not.toBe(true);
    const reason = String(verdict);
    expect(reason).toContain('big.pdf');
    expect(reason).toContain('AGI Cloud');
    expect(reason).toContain('12 MB');
    expect(reason.toLowerCase()).not.toContain('connection');
  });

  it('refuses a file one byte over the cloud contract', () => {
    expect(
      isAcceptableAttachment(doc({ fileSize: MAX_CLOUD_ATTACHMENT_BYTES + 1 }), 'cloud'),
    ).not.toBe(true);
    expect(isAcceptableAttachment(doc({ fileSize: MAX_CLOUD_ATTACHMENT_BYTES }), 'cloud')).toBe(
      true,
    );
  });

  it('keeps the same 20 MB file usable on the local path, which never uploads', () => {
    expect(isAcceptableAttachment(doc({ fileSize: TWENTY_MB }), 'local')).toBe(true);
  });

  it('splits a mixed batch by the cloud ceiling', () => {
    const { accepted, rejected } = validateAttachments(
      [
        doc({ fileName: 'small.pdf', uri: 'file:///small.pdf', fileSize: 1024 }),
        doc({ fileName: 'huge.pdf', uri: 'file:///huge.pdf', fileSize: TWENTY_MB }),
      ],
      'cloud',
    );

    expect(accepted.map((a) => a.fileName)).toEqual(['small.pdf']);
    expect(rejected.map((r) => r.fileName)).toEqual(['huge.pdf']);
  });

  it('keeps the whole batch on the local path', () => {
    const { accepted, rejected } = validateAttachments(
      [
        doc({ fileName: 'small.pdf', uri: 'file:///small.pdf', fileSize: 1024 }),
        doc({ fileName: 'huge.pdf', uri: 'file:///huge.pdf', fileSize: TWENTY_MB }),
      ],
      'local',
    );

    expect(accepted.map((a) => a.fileName)).toEqual(['small.pdf', 'huge.pdf']);
    expect(rejected).toEqual([]);
  });

  it('still refuses anything past the device ceiling on the local path', () => {
    const verdict = isAcceptableAttachment(doc({ fileSize: MAX_ATTACHMENT_BYTES + 1 }), 'local');
    expect(verdict).not.toBe(true);
    expect(String(verdict)).toContain('25 MB');
    expect(String(verdict)).not.toContain('AGI Cloud');
  });

  it('falls back to the stricter cloud ceiling when no destination is given', () => {
    expect(isAcceptableAttachment(doc({ fileSize: TWENTY_MB }))).not.toBe(true);
  });
});
