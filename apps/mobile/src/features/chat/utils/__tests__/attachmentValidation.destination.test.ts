/**
 * The attach-time size ceiling has to depend on where the file is going,
 * because the two destinations refuse at different sizes for different reasons:
 *
 *  - cloud: `api.uploadFile` POSTs `byteCount` to `/api/uploads/presign`, which
 *    refuses anything over 12 MiB (apps/web/app/api/uploads/presign/route.ts:100)
 *    and `api.uploadFile` refuses at the same number first
 *    (apps/mobile/services/api.ts:501). That is a DETERMINISTIC contract
 *    rejection. Before this, the composer accepted up to 25 MB regardless, so
 *    `uploadWithRetry` burned three exponential-backoff retries
 *    (stores/chat/chatExecutionStore.ts:503) and told the user to "check your
 *    connection".
 *  - local: `guardedFetch` throws `EgressBlockedError` for our-cloud hosts in
 *    Local mode (lib/egressGuard.ts:170-176), so no upload is even possible;
 *    `createLocalAttachmentReferences` (chatExecutionStore.ts:996) hands the
 *    file straight to docParser / on-device OCR. The 12 MiB cloud contract must
 *    NOT be applied here.
 */
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

/** Between the 12 MiB cloud contract and the 25 MB device ceiling. */
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
    // The whole point of the fix: the user must not be told this was a
    // network problem, which is what uploadWithRetry's alert says.
    expect(reason.toLowerCase()).not.toContain('connection');
  });

  it('refuses a file one byte over the cloud contract', () => {
    expect(
      isAcceptableAttachment(doc({ fileSize: MAX_CLOUD_ATTACHMENT_BYTES + 1 }), 'cloud'),
    ).not.toBe(true);
    // …and accepts one exactly at it, the value presign itself accepts.
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
