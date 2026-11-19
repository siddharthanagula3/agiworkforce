import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mockIsParseable = jest.fn();
jest.mock('@/services/docParser', () => ({
  isParseableDocument: (...args: unknown[]) => mockIsParseable(...args),
}));

import { CHAT_ATTACHMENT_LIMITS, chatAttachmentLimitsToWire } from '@agiworkforce/cloud-contracts';
import {
  clearServerAttachmentLimits,
  applyServerAttachmentLimits,
} from '@/src/features/chat/upload/attachmentLimits';
import {
  MAX_ATTACHMENT_BYTES,
  maxAttachmentBytesFor,
  isAcceptableAttachment,
  validateAttachments,
  type ValidatableAttachment,
} from '@/src/features/chat/utils/attachmentValidation';

const MIB = 1024 * 1024;
const TWENTY_MB = 20 * MIB;
const MAX_CLOUD_ATTACHMENT_BYTES = CHAT_ATTACHMENT_LIMITS.maxFileBytes;
const MAX_CLOUD_IMAGE_ATTACHMENT_BYTES = CHAT_ATTACHMENT_LIMITS.maxImageBytes;
const PHOTO_OVER_CLOUD_LIMIT = MAX_CLOUD_IMAGE_ATTACHMENT_BYTES + 1;

function doc(overrides: Partial<ValidatableAttachment> = {}): ValidatableAttachment {
  return { fileName: 'big.pdf', mimeType: 'application/pdf', uri: 'file:///big.pdf', ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  clearServerAttachmentLimits();
  applyServerAttachmentLimits(chatAttachmentLimitsToWire(CHAT_ATTACHMENT_LIMITS));
  mockIsParseable.mockReturnValue(true);
});

describe('the cloud ceiling is the upload contract, not the device ceiling', () => {
  it('is the 25 MiB managed-cloud contract for documents and 20 MiB for images', () => {
    expect(MAX_CLOUD_ATTACHMENT_BYTES).toBe(25 * MIB);
    expect(MAX_CLOUD_IMAGE_ATTACHMENT_BYTES).toBe(20 * MIB);
    expect(MAX_CLOUD_ATTACHMENT_BYTES).toBeLessThanOrEqual(MAX_ATTACHMENT_BYTES);
    expect(maxAttachmentBytesFor('cloud')).toBe(MAX_CLOUD_ATTACHMENT_BYTES);
    expect(maxAttachmentBytesFor('cloud', 'image/jpeg')).toBe(MAX_CLOUD_IMAGE_ATTACHMENT_BYTES);
    expect(maxAttachmentBytesFor('local')).toBe(MAX_ATTACHMENT_BYTES);
    expect(maxAttachmentBytesFor('local', 'image/jpeg')).toBe(MAX_ATTACHMENT_BYTES);
  });

  it('accepts a 20 MB document bound for AGI Cloud', () => {
    expect(isAcceptableAttachment(doc({ fileSize: TWENTY_MB }), 'cloud')).toBe(true);
  });

  it('refuses a photo over the image ceiling bound for AGI Cloud, naming the real cause', () => {
    const photo = doc({ fileName: 'IMG_1.jpg', mimeType: 'image/jpeg', uri: 'file:///IMG_1.jpg' });
    const verdict = isAcceptableAttachment({ ...photo, fileSize: PHOTO_OVER_CLOUD_LIMIT }, 'cloud');

    expect(verdict).not.toBe(true);
    const reason = String(verdict);
    expect(reason).toContain('IMG_1.jpg');
    expect(reason).toContain('AGI Cloud');
    expect(reason).toContain('images up to 20 MB');
    expect(reason.toLowerCase()).not.toContain('connection');
    expect(
      isAcceptableAttachment({ ...photo, fileSize: MAX_CLOUD_IMAGE_ATTACHMENT_BYTES }, 'cloud'),
    ).toBe(true);
    expect(isAcceptableAttachment({ ...photo, fileSize: PHOTO_OVER_CLOUD_LIMIT }, 'local')).toBe(
      true,
    );
  });

  it('enforces the limits the server published for this account, shown in KB and MB', () => {
    applyServerAttachmentLimits({
      max_file_bytes: 3 * MIB,
      max_image_bytes: 1.5 * MIB,
      max_message_bytes: 6 * MIB,
      max_files_per_message: 4,
    });
    const photo = doc({ fileName: 'IMG_2.jpg', mimeType: 'image/jpeg', uri: 'file:///IMG_2.jpg' });

    expect(maxAttachmentBytesFor('cloud')).toBe(3 * MIB);
    expect(maxAttachmentBytesFor('cloud', 'image/jpeg')).toBe(1.5 * MIB);
    expect(isAcceptableAttachment(doc({ fileSize: 3 * MIB }), 'cloud')).toBe(true);
    expect(isAcceptableAttachment(doc({ fileSize: 3 * MIB + 1 }), 'cloud')).toBe(
      '“big.pdf” is too large for AGI Cloud (max 3 MB).',
    );
    expect(isAcceptableAttachment({ ...photo, fileSize: 1.5 * MIB + 1 }, 'cloud')).toBe(
      '“IMG_2.jpg” is too large for AGI Cloud (images up to 1.5 MB).',
    );
  });

  it('shows a Local refusal in the same units as the enforced number', () => {
    expect(isAcceptableAttachment(doc({ fileSize: MAX_ATTACHMENT_BYTES + 1 }), 'local')).toBe(
      `“big.pdf” is too large (max ${MAX_ATTACHMENT_BYTES / MIB} MB).`,
    );
  });

  it('refuses a file one byte over the cloud contract', () => {
    expect(
      isAcceptableAttachment(doc({ fileSize: MAX_CLOUD_ATTACHMENT_BYTES + 1 }), 'cloud'),
    ).not.toBe(true);
    expect(isAcceptableAttachment(doc({ fileSize: MAX_CLOUD_ATTACHMENT_BYTES }), 'cloud')).toBe(
      true,
    );
  });

  it('splits a mixed batch by the cloud ceiling', () => {
    const { accepted, rejected } = validateAttachments(
      [
        doc({ fileName: 'small.pdf', uri: 'file:///small.pdf', fileSize: 1024 }),
        doc({
          fileName: 'huge.png',
          mimeType: 'image/png',
          uri: 'file:///huge.png',
          fileSize: PHOTO_OVER_CLOUD_LIMIT,
        }),
      ],
      'cloud',
    );

    expect(accepted.map((a) => a.fileName)).toEqual(['small.pdf']);
    expect(rejected.map((r) => r.fileName)).toEqual(['huge.png']);
  });

  it('keeps the whole batch on the local path', () => {
    const { accepted, rejected } = validateAttachments(
      [
        doc({ fileName: 'small.pdf', uri: 'file:///small.pdf', fileSize: 1024 }),
        doc({
          fileName: 'huge.png',
          mimeType: 'image/png',
          uri: 'file:///huge.png',
          fileSize: PHOTO_OVER_CLOUD_LIMIT,
        }),
      ],
      'local',
    );

    expect(accepted.map((a) => a.fileName)).toEqual(['small.pdf', 'huge.png']);
    expect(rejected).toEqual([]);
  });

  it('still refuses anything past the device ceiling on the local path', () => {
    const verdict = isAcceptableAttachment(doc({ fileSize: MAX_ATTACHMENT_BYTES + 1 }), 'local');
    expect(verdict).not.toBe(true);
    expect(String(verdict)).toContain('25 MB');
    expect(String(verdict)).not.toContain('AGI Cloud');
  });

  it('lets the share extension stage a file as large as AGI Cloud accepts', () => {
    const source = readFileSync(
      join(__dirname, '../../../../../native/ios/AGIShareExtension/ShareViewController.swift'),
      'utf8',
    );
    const megabytes = /maximumSharedFileBytes = (\d+) \* 1024 \* 1024/.exec(source)?.[1];
    expect(Number(megabytes) * MIB).toBe(maxAttachmentBytesFor('cloud'));
  });

  it('falls back to the stricter cloud ceiling when no destination is given', () => {
    expect(
      isAcceptableAttachment(
        doc({ fileName: 'p.png', mimeType: 'image/png', fileSize: PHOTO_OVER_CLOUD_LIMIT }),
      ),
    ).not.toBe(true);
  });
});
