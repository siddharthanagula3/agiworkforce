import { MAX_ATTACHMENT_BYTES, MAX_PLAN_ATTACHMENT_BYTES } from '@agiworkforce/types';
import { describe, expect, it } from 'vitest';

import {
  CHAT_ATTACHMENT_LIMITS,
  CHAT_ATTACHMENT_NEEDS_PROJECT_MESSAGE,
  CHAT_IMAGE_ATTACHMENT_TOO_LARGE_MESSAGE,
  CHAT_LARGE_FILE_POLICY,
  CHAT_MODEL_IMAGE_ENVELOPE,
  ChatAttachmentLimitsWireSchema,
  MAX_CHAT_ATTACHMENT_COUNT,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_MESSAGE_BYTES,
  MAX_CHAT_IMAGE_ATTACHMENT_BYTES,
  ManagedCloudChatAttachmentCompleteRequestSchema,
  ManagedCloudChatAttachmentPresignRequestSchema,
  ManagedCloudUploadedChatAttachmentsSchema,
  SHARED_ATTACHMENTS_NOT_COPIED,
  chatAttachmentLimitsFromWire,
  chatAttachmentLimitsToWire,
  chatAttachmentMaxBytes,
  chatAttachmentSizeRefusal,
  chatLargeFileKind,
  chatLargeFileKindMaxBytes,
} from '../chat-attachments';
import { parseMeResponse } from '../me';
import {
  RESUMABLE_UPLOAD_MAX_BYTES,
  RESUMABLE_UPLOAD_PART_BYTES,
  RESUMABLE_UPLOAD_RELAY_SEGMENT_BYTES,
  shouldUploadInParts,
} from '../resumable-uploads';

const MIB = 1024 * 1024;

describe('chat attachment limits', () => {
  it('lets a chat file be 25 MB, the most every upload path can scan and send', () => {
    expect(MAX_CHAT_ATTACHMENT_BYTES).toBe(25 * MIB);
    expect(MAX_CHAT_ATTACHMENT_BYTES).toBeLessThanOrEqual(MAX_ATTACHMENT_BYTES);
    expect(MAX_CHAT_ATTACHMENT_BYTES).toBeLessThanOrEqual(MAX_PLAN_ATTACHMENT_BYTES);
    expect(MAX_CHAT_ATTACHMENT_MESSAGE_BYTES).toBeGreaterThanOrEqual(MAX_CHAT_ATTACHMENT_BYTES);
    expect(RESUMABLE_UPLOAD_MAX_BYTES['chat-attachment']).toBe(MAX_CHAT_ATTACHMENT_BYTES);
  });

  it('takes an image of 20 MB, never less than the 12 MB it took before', () => {
    expect(MAX_CHAT_IMAGE_ATTACHMENT_BYTES).toBe(20 * MIB);
    expect(MAX_CHAT_IMAGE_ATTACHMENT_BYTES).toBeGreaterThanOrEqual(12 * MIB);
    expect(MAX_CHAT_IMAGE_ATTACHMENT_BYTES).toBeLessThanOrEqual(MAX_CHAT_ATTACHMENT_BYTES);
    expect(chatAttachmentMaxBytes('image/png')).toBe(MAX_CHAT_IMAGE_ATTACHMENT_BYTES);
    expect(chatAttachmentMaxBytes('IMAGE/JPEG; charset=binary')).toBe(
      MAX_CHAT_IMAGE_ATTACHMENT_BYTES,
    );
    expect(chatAttachmentMaxBytes('application/pdf')).toBe(MAX_CHAT_ATTACHMENT_BYTES);
  });

  it('hands a model each image re-encoded to fit the strictest route, 5 MB of base64 and 8000 pixels', () => {
    expect(CHAT_MODEL_IMAGE_ENVELOPE.maxBase64Bytes).toBe(5_000_000);
    expect(CHAT_MODEL_IMAGE_ENVELOPE.maxEdgePixels).toBe(8000);
    expect(CHAT_MODEL_IMAGE_ENVELOPE.mediaTypes).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  });

  it('sends a file one relayed request could not carry through the multi-part path', () => {
    expect(RESUMABLE_UPLOAD_RELAY_SEGMENT_BYTES).toBeLessThan(4_500_000);
    expect(RESUMABLE_UPLOAD_RELAY_SEGMENT_BYTES).toBeLessThan(RESUMABLE_UPLOAD_PART_BYTES);
    expect(shouldUploadInParts(RESUMABLE_UPLOAD_RELAY_SEGMENT_BYTES)).toBe(false);
    expect(shouldUploadInParts(RESUMABLE_UPLOAD_RELAY_SEGMENT_BYTES + 1)).toBe(true);
    expect(shouldUploadInParts(RESUMABLE_UPLOAD_PART_BYTES + 1)).toBe(true);
    expect(shouldUploadInParts(MAX_CHAT_ATTACHMENT_BYTES)).toBe(true);
  });

  it('refuses one byte over each ceiling and admits the ceiling itself', () => {
    expect(chatAttachmentSizeRefusal('a.pdf', 'application/pdf', MAX_CHAT_ATTACHMENT_BYTES)).toBe(
      null,
    );
    expect(
      chatAttachmentSizeRefusal('a.pdf', 'application/pdf', MAX_CHAT_ATTACHMENT_BYTES + 1),
    ).toBe('"a.pdf" is larger than the 25 MB chat attachment limit.');
    expect(chatAttachmentSizeRefusal('b.png', 'image/png', MAX_CHAT_IMAGE_ATTACHMENT_BYTES)).toBe(
      null,
    );
    expect(
      chatAttachmentSizeRefusal('b.png', 'image/png', MAX_CHAT_IMAGE_ATTACHMENT_BYTES + 1),
    ).toBe(`"b.png" is too large. ${CHAT_IMAGE_ATTACHMENT_TOO_LARGE_MESSAGE}`);
  });

  it('caps the presign and completion requests at the chat limit', () => {
    const request = {
      kind: 'chat-attachment' as const,
      fileName: 'a.pdf',
      mimeType: 'application/pdf',
      byteCount: MAX_CHAT_ATTACHMENT_BYTES,
    };
    expect(ManagedCloudChatAttachmentPresignRequestSchema.safeParse(request).success).toBe(true);
    expect(
      ManagedCloudChatAttachmentPresignRequestSchema.safeParse({
        ...request,
        byteCount: MAX_CHAT_ATTACHMENT_BYTES + 1,
      }).success,
    ).toBe(false);
    const completion = { storageKey: 'k', fileName: 'a.pdf', mimeType: 'application/pdf' };
    expect(
      ManagedCloudChatAttachmentCompleteRequestSchema.safeParse({
        ...completion,
        byteCount: MAX_CHAT_ATTACHMENT_BYTES + 1,
      }).success,
    ).toBe(false);
  });

  it('refuses an uploaded image reference over the image ceiling', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const reference = (byteCount: number) => [
      {
        id,
        name: 'b.png',
        mimeType: 'image/png',
        byteCount,
        type: 'image',
        url: `/api/files/${id}`,
      },
    ];
    expect(
      ManagedCloudUploadedChatAttachmentsSchema.safeParse(
        reference(MAX_CHAT_IMAGE_ATTACHMENT_BYTES),
      ).success,
    ).toBe(true);
    expect(
      ManagedCloudUploadedChatAttachmentsSchema.safeParse(
        reference(MAX_CHAT_IMAGE_ATTACHMENT_BYTES + 1),
      ).success,
    ).toBe(false);
  });

  it('takes twenty uploaded files on one message and refuses a twenty-first', () => {
    const references = (count: number) =>
      Array.from({ length: count }, (_, index) => {
        const id = `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
        return {
          id,
          name: `f${index}.txt`,
          mimeType: 'text/plain',
          byteCount: 1,
          type: 'file',
          url: `/api/files/${id}`,
        };
      });
    expect(ManagedCloudUploadedChatAttachmentsSchema.safeParse(references(20)).success).toBe(true);
    expect(ManagedCloudUploadedChatAttachmentsSchema.safeParse(references(21)).success).toBe(false);
  });

  it('names the limit in the sentence that sends larger files to a project', () => {
    expect(CHAT_ATTACHMENT_NEEDS_PROJECT_MESSAGE).toBe(
      'Files over 25 MB go into a project, where AGI reads and searches them.',
    );
  });

  it('names the limits the server sent rather than the ones the client was built with', () => {
    const raised = { ...CHAT_ATTACHMENT_LIMITS, maxFileBytes: 50 * MIB, maxImageBytes: 30 * MIB };
    expect(chatAttachmentSizeRefusal('a.pdf', 'application/pdf', 40 * MIB, raised)).toBe(null);
    expect(chatAttachmentSizeRefusal('a.pdf', 'application/pdf', 50 * MIB + 1, raised)).toBe(
      '"a.pdf" is larger than the 50 MB chat attachment limit.',
    );
    expect(chatAttachmentSizeRefusal('b.png', 'image/png', 30 * MIB + 1, raised)).toBe(
      '"b.png" is too large. Images can be up to 30 MB each. Attach a smaller image.',
    );
  });

  it('carries the attachment limits in the sign-in handshake and reads a bad block as absent', () => {
    const wire = chatAttachmentLimitsToWire(CHAT_ATTACHMENT_LIMITS);
    expect(wire).toEqual({
      max_file_bytes: MAX_CHAT_ATTACHMENT_BYTES,
      max_image_bytes: MAX_CHAT_IMAGE_ATTACHMENT_BYTES,
      max_message_bytes: MAX_CHAT_ATTACHMENT_MESSAGE_BYTES,
      max_files_per_message: MAX_CHAT_ATTACHMENT_COUNT,
    });
    expect(chatAttachmentLimitsFromWire(wire)).toEqual(CHAT_ATTACHMENT_LIMITS);
    const me = {
      id: 'u',
      email: null,
      name: 'U',
      avatar_url: null,
      created_at: null,
      updated_at: 0,
      plan: { tier: 'free', display_name: 'Free', status: 'none', current_period_end: null },
      feature_flags: { advanced_model_access: false },
      routing_preferences: {},
    };
    expect(parseMeResponse({ ...me, attachment_limits: wire }).attachment_limits).toEqual(wire);
    expect(
      parseMeResponse({ ...me, attachment_limits: { max_file_bytes: 'lots' } }).attachment_limits,
    ).toBeUndefined();
    expect(parseMeResponse(me).attachment_limits).toBeUndefined();
  });
});

describe('large chat file policy', () => {
  const me = {
    id: 'u',
    email: null,
    name: 'U',
    avatar_url: null,
    created_at: null,
    updated_at: 0,
    plan: { tier: 'pro', display_name: 'Pro', status: 'active', current_period_end: null },
    feature_flags: { advanced_model_access: true },
    routing_preferences: {},
  };
  const todayWire = {
    max_file_bytes: 25 * MIB,
    max_image_bytes: 20 * MIB,
    max_message_bytes: 25 * MIB,
    max_files_per_message: 20,
  };

  it('keeps the inline ceilings every compiled client uses, twenty files to a message', () => {
    expect(CHAT_ATTACHMENT_LIMITS).toStrictEqual({
      maxFileBytes: 25 * MIB,
      maxImageBytes: 20 * MIB,
      maxMessageBytes: 25 * MIB,
      maxFilesPerMessage: 20,
    });
    expect(MAX_CHAT_ATTACHMENT_COUNT).toBe(20);
    expect(MAX_CHAT_ATTACHMENT_MESSAGE_BYTES).toBe(25 * MIB);
    expect(chatAttachmentLimitsToWire(CHAT_ATTACHMENT_LIMITS)).toStrictEqual(todayWire);
  });

  it('carries the built values for large files', () => {
    expect(CHAT_LARGE_FILE_POLICY.largeFiles).toEqual({
      maxBytes: 500 * MIB,
      maxCount: 20,
      maxMessageBytes: 2048 * MIB,
      cellularConfirmBytes: 50 * MIB,
      sandboxStagedBytesMax: 1024 * MIB,
      maxPackageInflatedBytes: 1024 * MIB,
    });
    expect(CHAT_LARGE_FILE_POLICY.kinds).toEqual({
      pdf: {
        maxBytes: 500 * MIB,
        maxTextPages: 1000,
        maxScanPages: 100_000,
        maxScanMs: 1_800_000,
        pagesPerStep: 100,
        maxOcrPagesPerFile: 100,
        ocrPagesPerTurn: 8,
        ocrBatchPages: 4,
        bufferedMaxBytes: 200 * MIB,
        rangeLoading: true,
      },
      office: { maxBytes: 100 * MIB, maxSlides: 200 },
      spreadsheet: { maxBytes: 50 * MIB, sampleRows: 200 },
      delimited: {
        maxBytes: 500 * MIB,
        sampleRows: 200,
        typeInferenceRows: 10_000,
        bytesPerStep: 64 * MIB,
      },
      text: { maxBytes: 500 * MIB, bytesPerStep: 64 * MIB },
      html: { maxBytes: 40 * MIB },
      notebook: { maxBytes: 50 * MIB },
    });
    expect(CHAT_LARGE_FILE_POLICY.preparation).toEqual({
      maxTextChars: 8_000_000,
      segmentBytes: 4 * MIB,
      maxIndexedChars: 2_000_000,
      maxIndexedCharsPerUser: 200_000_000,
      embedChatFiles: false,
      preparerVersion: 1,
      stallMs: 7_200_000,
    });
    expect(CHAT_LARGE_FILE_POLICY.turnBudget).toEqual({
      maxAttachmentTokensPerTurn: 120_000,
      contextShare: 0.25,
      maxInputCentsPerTurn: 10,
      cardsShare: 0.25,
      laterTurnFileTokens: 5000,
      laterTurnTotalTokens: 20_000,
      cardMaxTokens: 1500,
      passageWindows: 10,
      passageChars: 1400,
    });
    expect(CHAT_LARGE_FILE_POLICY.intake).toEqual({
      maxScanAttempts: 4,
      scanGiveUpMs: 1_800_000,
      scanPollScheduleMs: [5000, 10_000, 20_000, 30_000],
      awaitingPartsIdleMs: 7_200_000,
      abandonAfterMs: 86_400_000,
      terminalRetentionMs: 604_800_000,
      statusPollMinMs: 2000,
      statusPollMaxMs: 10_000,
      scanUnavailableRefundsPerDay: 3,
      budgetWaitMaxMs: 7_200_000,
      leaseMs: { uploaded: 300_000, inspecting: 300_000, scanningExtra: 300_000, sealing: 900_000 },
    });
  });

  it('cannot be changed by a consumer', () => {
    expect(Object.isFrozen(CHAT_LARGE_FILE_POLICY)).toBe(true);
    expect(Object.isFrozen(CHAT_LARGE_FILE_POLICY.kinds.pdf)).toBe(true);
    expect(Object.isFrozen(CHAT_LARGE_FILE_POLICY.intake.scanPollScheduleMs)).toBe(true);
    expect(Object.isFrozen(CHAT_LARGE_FILE_POLICY.intake.leaseMs)).toBe(true);
  });

  it('caps every kind at most at the large ceiling and above the inline one', () => {
    const { largeFiles, kinds } = CHAT_LARGE_FILE_POLICY;
    expect(largeFiles.maxBytes).toBeGreaterThan(MAX_CHAT_ATTACHMENT_BYTES);
    expect(largeFiles.maxCount).toBeGreaterThanOrEqual(MAX_CHAT_ATTACHMENT_COUNT);
    expect(largeFiles.maxMessageBytes).toBeGreaterThanOrEqual(largeFiles.maxBytes);
    for (const [kind, policy] of Object.entries(kinds)) {
      expect(policy.maxBytes, kind).toBeLessThanOrEqual(largeFiles.maxBytes);
      expect(policy.maxBytes, kind).toBeGreaterThan(MAX_CHAT_ATTACHMENT_BYTES);
    }
    expect(kinds.pdf.bufferedMaxBytes).toBeLessThanOrEqual(kinds.pdf.maxBytes);
  });

  it('sorts each accepted file into the kind that caps it', () => {
    const cases: [string, string, string | null][] = [
      ['photo.png', 'image/png', 'image'],
      ['report.pdf', 'application/pdf', 'pdf'],
      ['report.pdf', '', 'pdf'],
      [
        'notes.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'office',
      ],
      [
        'deck.pptx',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'office',
      ],
      [
        'book.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'spreadsheet',
      ],
      ['rows.csv', 'text/csv', 'delimited'],
      ['rows.tsv', 'text/tab-separated-values', 'delimited'],
      ['rows.csv', 'text/plain', 'delimited'],
      ['rows.csv', 'text/comma-separated-values', 'delimited'],
      ['page.html', 'text/html', 'html'],
      ['page.html', 'text/plain', 'html'],
      ['notes.txt', 'text/html', 'html'],
      ['run.ipynb', 'application/x-ipynb+json', 'notebook'],
      ['run.ipynb', 'application/json', 'notebook'],
      ['report.pdf', 'text/plain', 'pdf'],
      ['run.ipynb', '', 'notebook'],
      ['data.json', 'application/json', 'text'],
      ['main.rs', '', 'text'],
      ['main.py', 'text/x-python', 'text'],
      ['readme.md', 'text/markdown', 'text'],
      ['song.mp3', 'audio/mpeg', null],
      ['bundle.zip', 'application/zip', null],
      ['old.doc', 'application/msword', null],
    ];
    for (const [fileName, mimeType, kind] of cases) {
      expect(chatLargeFileKind(fileName, mimeType), `${fileName} ${mimeType}`).toBe(kind);
    }
  });

  it('holds a file to the strictest kind its name or its type implies', () => {
    const { kinds } = CHAT_LARGE_FILE_POLICY;
    expect(chatLargeFileKindMaxBytes('report.pdf', 'application/pdf')).toBe(kinds.pdf.maxBytes);
    expect(chatLargeFileKindMaxBytes('page.html', 'text/plain')).toBe(kinds.html.maxBytes);
    expect(chatLargeFileKindMaxBytes('run.ipynb', 'application/json')).toBe(
      kinds.notebook.maxBytes,
    );
    expect(chatLargeFileKindMaxBytes('book.xlsx', 'application/octet-stream')).toBe(
      kinds.spreadsheet.maxBytes,
    );
    expect(chatLargeFileKindMaxBytes('photo.png', 'image/png')).toBe(
      MAX_CHAT_IMAGE_ATTACHMENT_BYTES,
    );
    expect(chatLargeFileKindMaxBytes('main.rs', '')).toBe(kinds.text.maxBytes);
    expect(chatLargeFileKindMaxBytes('song.mp3', 'audio/mpeg')).toBeNull();
  });

  it("reads a payload from an old server as today's limits, with no new field", () => {
    const parsed = parseMeResponse({ ...me, attachment_limits: todayWire }).attachment_limits;
    expect(parsed).toStrictEqual(todayWire);
    expect(chatAttachmentLimitsFromWire(parsed!)).toStrictEqual(CHAT_ATTACHMENT_LIMITS);
  });

  it('carries the large offer through the handshake and back', () => {
    const offered = {
      ...CHAT_ATTACHMENT_LIMITS,
      maxFileBytes: 500 * MIB,
      maxMessageBytes: 2048 * MIB,
      maxFilesPerMessage: 20,
      largeFilesAvailable: true,
      storageRemainingBytes: null,
      inlineMessageBytes: MAX_CHAT_ATTACHMENT_MESSAGE_BYTES,
    };
    const wire = chatAttachmentLimitsToWire(offered);
    expect(wire).toStrictEqual({
      max_file_bytes: 500 * MIB,
      max_image_bytes: 20 * MIB,
      max_message_bytes: 2048 * MIB,
      max_files_per_message: 20,
      large_files_available: true,
      storage_remaining_bytes: null,
      inline_message_bytes: MAX_CHAT_ATTACHMENT_MESSAGE_BYTES,
    });
    const parsed = parseMeResponse({ ...me, attachment_limits: wire }).attachment_limits;
    expect(parsed).toStrictEqual(wire);
    expect(chatAttachmentLimitsFromWire(parsed!)).toStrictEqual(offered);
    expect(
      chatAttachmentLimitsFromWire(
        ChatAttachmentLimitsWireSchema.parse({ ...wire, storage_remaining_bytes: 3 * MIB }),
      ).storageRemainingBytes,
    ).toBe(3 * MIB);
  });

  it('reads an offer it cannot act on safely as absent, so the client keeps its own limits', () => {
    const offered = {
      ...todayWire,
      max_file_bytes: 500 * MIB,
      large_files_available: true,
      storage_remaining_bytes: null,
      inline_message_bytes: 25 * MIB,
    };
    for (const broken of [
      { ...offered, inline_message_bytes: undefined },
      { ...offered, storage_remaining_bytes: undefined },
      { ...offered, inline_message_bytes: offered.max_message_bytes + 1 },
      { ...offered, storage_remaining_bytes: -1 },
      { ...offered, large_files_available: 'yes' },
    ]) {
      expect(
        parseMeResponse({ ...me, attachment_limits: broken }).attachment_limits,
        JSON.stringify(broken),
      ).toBeUndefined();
    }
  });
});

describe('the shared chat attachment notice', () => {
  it('is one sentence every surface shows before the names of files it did not copy', () => {
    expect(SHARED_ATTACHMENTS_NOT_COPIED).toBe(
      'Attached in the shared chat and kept private to the person who shared it:',
    );
  });
});
