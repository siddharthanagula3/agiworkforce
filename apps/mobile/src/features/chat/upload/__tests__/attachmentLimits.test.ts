import {
  CHAT_ATTACHMENT_LIMITS,
  CHAT_ATTACHMENT_LIMITS_WITHOUT_HANDSHAKE,
  chatAttachmentLimitsToWire,
  type ChatAttachmentLimits,
} from '@agiworkforce/cloud-contracts';
import {
  applyServerAttachmentLimits,
  clearServerAttachmentLimits,
  currentAttachmentLimits,
} from '../attachmentLimits';
import {
  MAX_ATTACHMENT_BYTES,
  attachmentLimitsFor,
} from '@/src/features/chat/utils/attachmentValidation';
import { photoSelectionLimitForPlan } from '@/src/features/chat/utils/photoSelectionLimit';

const RAISED: ChatAttachmentLimits = {
  maxFileBytes: CHAT_ATTACHMENT_LIMITS.maxFileBytes * 2,
  maxImageBytes: CHAT_ATTACHMENT_LIMITS.maxImageBytes * 2,
  maxMessageBytes: CHAT_ATTACHMENT_LIMITS.maxMessageBytes * 2,
  maxFilesPerMessage: CHAT_ATTACHMENT_LIMITS.maxFilesPerMessage * 2,
};

afterEach(() => {
  clearServerAttachmentLimits();
});

describe('the attachment limits the phone works to', () => {
  it('uses the conservative limits until the server sends its own', () => {
    expect(currentAttachmentLimits()).toEqual(CHAT_ATTACHMENT_LIMITS_WITHOUT_HANDSHAKE);
  });

  it('never lets a phone built with a raised limit offer more than an older server accepts', () => {
    const fallback = currentAttachmentLimits();

    expect(fallback.maxFilesPerMessage).toBeLessThanOrEqual(
      CHAT_ATTACHMENT_LIMITS.maxFilesPerMessage,
    );
    expect(fallback.maxFileBytes).toBeLessThanOrEqual(CHAT_ATTACHMENT_LIMITS.maxFileBytes);
    expect(fallback.maxImageBytes).toBeLessThanOrEqual(CHAT_ATTACHMENT_LIMITS.maxImageBytes);
    expect(fallback.maxMessageBytes).toBeLessThanOrEqual(CHAT_ATTACHMENT_LIMITS.maxMessageBytes);
    expect(fallback.largeFilesAvailable).toBeUndefined();
  });

  it('uses the server limits from the sign-in handshake', () => {
    applyServerAttachmentLimits(chatAttachmentLimitsToWire(RAISED));

    expect(currentAttachmentLimits()).toEqual(RAISED);
  });

  it('lets the server raise the file count above the fallback, within what the plan allows', () => {
    applyServerAttachmentLimits(chatAttachmentLimitsToWire(RAISED));

    const count = attachmentLimitsFor('cloud', 'max').filesPerMessage!;
    expect(count).toBe(Math.min(RAISED.maxFilesPerMessage, photoSelectionLimitForPlan('max')));
    expect(count).toBeGreaterThan(CHAT_ATTACHMENT_LIMITS_WITHOUT_HANDSHAKE.maxFilesPerMessage);
  });

  it('goes back to the conservative limits when the account signs out', () => {
    applyServerAttachmentLimits(chatAttachmentLimitsToWire(RAISED));
    clearServerAttachmentLimits();

    expect(currentAttachmentLimits()).toEqual(CHAT_ATTACHMENT_LIMITS_WITHOUT_HANDSHAKE);
  });

  it('falls back to the conservative limits when the handshake carries none or a broken block', () => {
    applyServerAttachmentLimits(chatAttachmentLimitsToWire(RAISED));
    applyServerAttachmentLimits(undefined);
    expect(currentAttachmentLimits()).toEqual(CHAT_ATTACHMENT_LIMITS_WITHOUT_HANDSHAKE);

    applyServerAttachmentLimits({ ...chatAttachmentLimitsToWire(RAISED), max_image_bytes: -1 });
    expect(currentAttachmentLimits()).toEqual(CHAT_ATTACHMENT_LIMITS_WITHOUT_HANDSHAKE);
  });

  it('holds a Cloud message to the fallback count when the server sent no limits', () => {
    const cloud = attachmentLimitsFor('cloud', 'max');

    expect(cloud.filesPerMessage).toBe(CHAT_ATTACHMENT_LIMITS_WITHOUT_HANDSHAKE.maxFilesPerMessage);
    expect(cloud.messageBytes).toBe(CHAT_ATTACHMENT_LIMITS_WITHOUT_HANDSHAKE.maxMessageBytes);
    expect(cloud.fileBytes('image/png')).toBe(
      CHAT_ATTACHMENT_LIMITS_WITHOUT_HANDSHAKE.maxImageBytes,
    );
    expect(cloud.fileBytes('application/pdf')).toBe(
      CHAT_ATTACHMENT_LIMITS_WITHOUT_HANDSHAKE.maxFileBytes,
    );
  });

  it('leaves Local Mode on its own device limit whether or not the server sent limits', () => {
    const without = attachmentLimitsFor('local', 'max');
    applyServerAttachmentLimits(chatAttachmentLimitsToWire(RAISED));
    const withServer = attachmentLimitsFor('local', 'max');

    for (const local of [without, withServer]) {
      expect(local.filesPerMessage).toBeNull();
      expect(local.messageBytes).toBeNull();
      expect(local.fileBytes('application/pdf')).toBe(MAX_ATTACHMENT_BYTES);
    }
  });
});
