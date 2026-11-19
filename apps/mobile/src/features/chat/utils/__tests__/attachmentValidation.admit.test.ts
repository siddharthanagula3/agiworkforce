const mockIsParseable = jest.fn();
jest.mock('@/services/docParser', () => ({
  isParseableDocument: (...args: unknown[]) => mockIsParseable(...args),
}));

import {
  clearServerAttachmentLimits,
  currentAttachmentLimits,
} from '@/src/features/chat/upload/attachmentLimits';
import {
  MAX_ATTACHMENT_BYTES,
  admitAttachments,
  attachmentLimitsFor,
  type ValidatableAttachment,
} from '@/src/features/chat/utils/attachmentValidation';
import { photoSelectionLimitForPlan } from '@/src/features/chat/utils/photoSelectionLimit';

const MIB = 1024 * 1024;
const MAX_CHAT_ATTACHMENT_COUNT = currentAttachmentLimits().maxFilesPerMessage;
const MAX_CHAT_ATTACHMENT_MESSAGE_BYTES = currentAttachmentLimits().maxMessageBytes;
const MAX_CLOUD_ATTACHMENT_BYTES = currentAttachmentLimits().maxFileBytes;
const MAX_CLOUD_IMAGE_ATTACHMENT_BYTES = currentAttachmentLimits().maxImageBytes;

function file(
  index: number,
  overrides: Partial<ValidatableAttachment> = {},
): ValidatableAttachment {
  return {
    fileName: `notes-${index}.pdf`,
    mimeType: 'application/pdf',
    uri: `file:///notes-${index}.pdf`,
    fileSize: MIB,
    ...overrides,
  };
}

function files(count: number, from = 0, overrides: Partial<ValidatableAttachment> = {}) {
  return Array.from({ length: count }, (_, offset) => file(from + offset, overrides));
}

beforeEach(() => {
  jest.clearAllMocks();
  clearServerAttachmentLimits();
  mockIsParseable.mockReturnValue(true);
});

describe('attachment limits come from the shared policy and the plan', () => {
  it('a Cloud message carries no more files than both the policy and the plan allow', () => {
    for (const tier of ['free', 'max', null]) {
      expect(attachmentLimitsFor('cloud', tier).filesPerMessage).toBe(
        Math.min(MAX_CHAT_ATTACHMENT_COUNT, photoSelectionLimitForPlan(tier)),
      );
    }
    expect(attachmentLimitsFor('cloud').messageBytes).toBe(MAX_CHAT_ATTACHMENT_MESSAGE_BYTES);
    expect(attachmentLimitsFor('cloud').fileBytes('image/png')).toBe(
      Math.min(MAX_ATTACHMENT_BYTES, MAX_CLOUD_IMAGE_ATTACHMENT_BYTES),
    );
    expect(attachmentLimitsFor('cloud').fileBytes('application/pdf')).toBe(
      Math.min(MAX_ATTACHMENT_BYTES, MAX_CLOUD_ATTACHMENT_BYTES),
    );
  });

  it('Local keeps its own device limit and sets no count or total', () => {
    const local = attachmentLimitsFor('local', 'free');
    expect(local.filesPerMessage).toBeNull();
    expect(local.messageBytes).toBeNull();
    expect(local.fileBytes('image/png')).toBe(MAX_ATTACHMENT_BYTES);
  });
});

describe('admitting files at attach time', () => {
  it('stops at the Cloud file count and names the limit for each file left out', () => {
    const limit = attachmentLimitsFor('cloud', 'free').filesPerMessage!;
    const staged = files(limit - 1, 0, { fileSize: 1 });
    const incoming = files(3, 100, { fileSize: 1 });

    const { accepted, rejected } = admitAttachments(staged, incoming, 'cloud', 'free');

    expect(accepted.map((item) => item.fileName)).toEqual(['notes-100.pdf']);
    expect(rejected.map((item) => item.reason)).toEqual([
      `“notes-101.pdf” was not added. A message can carry up to ${limit} files.`,
      `“notes-102.pdf” was not added. A message can carry up to ${limit} files.`,
    ]);
  });

  it('stops at the Cloud total for one message, in megabytes from the policy', () => {
    const perFile = Math.min(MAX_CLOUD_ATTACHMENT_BYTES, MAX_ATTACHMENT_BYTES);
    const fitting = Math.floor(MAX_CHAT_ATTACHMENT_MESSAGE_BYTES / perFile);
    const incoming = files(fitting + 1, 0, { fileSize: perFile });
    const limitMb = MAX_CHAT_ATTACHMENT_MESSAGE_BYTES / MIB;

    const { accepted, rejected } = admitAttachments([], incoming, 'cloud', 'max');

    expect(accepted).toHaveLength(fitting);
    expect(rejected).toEqual([
      {
        fileName: `notes-${fitting}.pdf`,
        reason: `“notes-${fitting}.pdf” was not added. Files in one message can add up to ${limitMb} MB.`,
      },
    ]);
  });

  it('a smaller file later in the pick still goes in when a larger one did not fit', () => {
    const staged = [file(0, { fileSize: MAX_CHAT_ATTACHMENT_MESSAGE_BYTES - 2 * MIB })];
    const incoming = [file(1, { fileSize: 3 * MIB }), file(2, { fileSize: MIB })];

    const { accepted, rejected } = admitAttachments(staged, incoming, 'cloud', 'max');

    expect(accepted.map((item) => item.fileName)).toEqual(['notes-2.pdf']);
    expect(rejected.map((item) => item.fileName)).toEqual(['notes-1.pdf']);
  });

  it('refuses a file over its own size limit before it counts against the message', () => {
    const tooBig = file(1, {
      fileName: 'scan.png',
      mimeType: 'image/png',
      fileSize: MAX_CLOUD_IMAGE_ATTACHMENT_BYTES + 1,
    });

    const { accepted, rejected } = admitAttachments([], [tooBig, file(2)], 'cloud', 'max');

    expect(accepted.map((item) => item.fileName)).toEqual(['notes-2.pdf']);
    expect(rejected[0]?.reason).toContain('“scan.png” is too large for AGI Cloud');
  });

  it('pasted text never counts as a file or toward the total', () => {
    const limit = attachmentLimitsFor('cloud', 'free').filesPerMessage!;
    const pasted = file(0, { fileName: 'Pasted text', pastedText: 'hello', fileSize: 10 * MIB });
    const staged = [pasted, ...files(limit - 1, 1, { fileSize: 1 })];

    const { accepted } = admitAttachments(staged, files(1, 100, { fileSize: 1 }), 'cloud', 'free');

    expect(accepted).toHaveLength(1);
  });

  it('Local admits any number of files within the device limit', () => {
    const many = files(MAX_CHAT_ATTACHMENT_COUNT + 5, 0, { fileSize: MIB });

    const { accepted, rejected } = admitAttachments(many, files(3, 100), 'local', 'free');

    expect(accepted).toHaveLength(3);
    expect(rejected).toEqual([]);
  });
});
