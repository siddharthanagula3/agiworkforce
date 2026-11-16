import { MAX_PLAN_ATTACHMENT_BYTES } from '@agiworkforce/types';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { CHAT_LARGE_FILE_POLICY, MAX_CHAT_ATTACHMENT_BYTES } from '../chat-attachments';
import {
  CHAT_LARGE_FILE_MAX_BYTES,
  CHAT_LARGE_FILE_UPLOAD_KIND,
  ManagedCloudChatLargeFileCompleteResponseSchema,
  ManagedCloudChatLargeFileCreateRequestSchema,
  ManagedCloudResumableUploadAbortResponseSchema,
  ManagedCloudResumableUploadCompleteResponseSchema,
  ManagedCloudResumableUploadCreateRequestSchema,
  RESUMABLE_UPLOAD_KINDS,
  RESUMABLE_UPLOAD_LARGE_PART_BYTES,
  RESUMABLE_UPLOAD_LARGE_PART_THRESHOLD_BYTES,
  RESUMABLE_UPLOAD_MAX_BYTES,
  RESUMABLE_UPLOAD_PART_BYTES,
  RESUMABLE_UPLOAD_PART_CONCURRENCY,
  RESUMABLE_UPLOAD_RELAY_SEGMENT_BYTES,
  chatLargeFilePartBytes,
  resumableUploadPartCount,
} from '../resumable-uploads';

const MIB = 1024 * 1024;
const CHECKSUM = 'a'.repeat(64);
const STORAGE_MAX_PARTS = 10_000;
const ASSET_ID = '00000000-0000-4000-8000-000000000001';
const INTAKE_ID = '00000000-0000-4000-8000-0000000000aa';

describe("what today's clients compiled against stays as it is", () => {
  it('keeps the kinds, their ceilings and the part sizes', () => {
    expect(RESUMABLE_UPLOAD_KINDS).toEqual(['chat-attachment', 'knowledge-file']);
    expect(RESUMABLE_UPLOAD_MAX_BYTES).toEqual({
      'chat-attachment': MAX_CHAT_ATTACHMENT_BYTES,
      'knowledge-file': MAX_PLAN_ATTACHMENT_BYTES,
    });
    expect(RESUMABLE_UPLOAD_PART_BYTES).toBe(5 * MIB);
    expect(RESUMABLE_UPLOAD_RELAY_SEGMENT_BYTES).toBe(4 * MIB);
  });

  it('refuses the large kind in the existing create union', () => {
    expect(
      ManagedCloudResumableUploadCreateRequestSchema.safeParse({
        kind: CHAT_LARGE_FILE_UPLOAD_KIND,
        fileName: 'big.pdf',
        mimeType: 'application/pdf',
        byteCount: 100 * MIB,
        checksumSha256: CHECKSUM,
      }).success,
    ).toBe(false);
  });

  it('still parses a chat-attachment complete response with the existing union', () => {
    const response = {
      kind: 'chat-attachment',
      attachment: {
        id: ASSET_ID,
        name: 'a.pdf',
        mimeType: 'application/pdf',
        byteCount: 5 * MIB,
        type: 'file',
        url: `/api/files/${ASSET_ID}`,
      },
    };
    expect(ManagedCloudResumableUploadCompleteResponseSchema.parse(response)).toEqual(response);
    expect(
      ManagedCloudResumableUploadCompleteResponseSchema.safeParse({
        kind: 'chat-attachment-intake',
        intake: { id: INTAKE_ID, state: 'checking' },
      }).success,
    ).toBe(false);
  });
});

describe('the large chat file kind', () => {
  it('is its own kind, capped at the large policy ceiling', () => {
    expect(CHAT_LARGE_FILE_UPLOAD_KIND).toBe('chat-large-file');
    expect(RESUMABLE_UPLOAD_KINDS).not.toContain(CHAT_LARGE_FILE_UPLOAD_KIND);
    expect(CHAT_LARGE_FILE_MAX_BYTES).toBe(CHAT_LARGE_FILE_POLICY.largeFiles.maxBytes);
    expect(CHAT_LARGE_FILE_MAX_BYTES).toBe(500 * MIB);
  });

  const create = {
    kind: CHAT_LARGE_FILE_UPLOAD_KIND,
    fileName: 'big.pdf',
    mimeType: 'application/pdf',
    byteCount: 480 * MIB,
    checksumSha256: CHECKSUM,
  };

  it('accepts the conversation and the temporary flag, validated as on complete', () => {
    expect(
      ManagedCloudChatLargeFileCreateRequestSchema.parse({
        ...create,
        conversationId: 'conversation-1',
        temporary: true,
      }),
    ).toEqual({ ...create, conversationId: 'conversation-1', temporary: true });
    expect(ManagedCloudChatLargeFileCreateRequestSchema.parse(create)).toEqual(create);
    for (const extra of [
      { conversationId: '' },
      { conversationId: 'c'.repeat(201) },
      { temporary: 'yes' },
    ]) {
      expect(
        ManagedCloudChatLargeFileCreateRequestSchema.safeParse({ ...create, ...extra }).success,
        JSON.stringify(extra),
      ).toBe(false);
    }
  });

  it('refuses a byte over the large ceiling and admits the ceiling itself', () => {
    expect(
      ManagedCloudChatLargeFileCreateRequestSchema.safeParse({
        ...create,
        byteCount: CHAT_LARGE_FILE_MAX_BYTES,
      }).success,
    ).toBe(true);
    expect(
      ManagedCloudChatLargeFileCreateRequestSchema.safeParse({
        ...create,
        byteCount: CHAT_LARGE_FILE_MAX_BYTES + 1,
      }).success,
    ).toBe(false);
  });

  it('leaves a file within the inline limit to the chat-attachment kind', () => {
    expect(
      ManagedCloudChatLargeFileCreateRequestSchema.safeParse({
        ...create,
        byteCount: MAX_CHAT_ATTACHMENT_BYTES,
      }).success,
    ).toBe(false);
    expect(
      ManagedCloudChatLargeFileCreateRequestSchema.safeParse({
        ...create,
        byteCount: MAX_CHAT_ATTACHMENT_BYTES + 1,
      }).success,
    ).toBe(true);
  });

  it('requires the checksum and the other create fields', () => {
    for (const field of ['fileName', 'mimeType', 'byteCount', 'checksumSha256'] as const) {
      const { [field]: _omitted, ...rest } = create;
      expect(ManagedCloudChatLargeFileCreateRequestSchema.safeParse(rest).success, field).toBe(
        false,
      );
    }
    expect(
      ManagedCloudChatLargeFileCreateRequestSchema.safeParse({ ...create, checksumSha256: 'zz' })
        .success,
    ).toBe(false);
    expect(
      ManagedCloudChatLargeFileCreateRequestSchema.safeParse({ ...create, kind: 'chat-attachment' })
        .success,
    ).toBe(false);
  });

  it('answers complete with the intake to wait on', () => {
    const response = {
      kind: 'chat-attachment-intake',
      intake: { id: INTAKE_ID, state: 'checking' },
    };
    expect(ManagedCloudChatLargeFileCompleteResponseSchema.parse(response)).toEqual(response);
    expect(
      ManagedCloudChatLargeFileCompleteResponseSchema.safeParse({
        kind: 'chat-attachment',
        intake: { id: INTAKE_ID, state: 'checking' },
      }).success,
    ).toBe(false);
  });
});

describe('large file parts', () => {
  it("sends 8 MiB parts above 100 MiB and today's 5 MiB parts at or under it", () => {
    expect(RESUMABLE_UPLOAD_LARGE_PART_BYTES).toBe(8 * MIB);
    expect(RESUMABLE_UPLOAD_LARGE_PART_THRESHOLD_BYTES).toBe(100 * MIB);
    expect(chatLargeFilePartBytes(RESUMABLE_UPLOAD_LARGE_PART_THRESHOLD_BYTES)).toBe(
      RESUMABLE_UPLOAD_PART_BYTES,
    );
    expect(chatLargeFilePartBytes(RESUMABLE_UPLOAD_LARGE_PART_THRESHOLD_BYTES + 1)).toBe(
      RESUMABLE_UPLOAD_LARGE_PART_BYTES,
    );
    expect(chatLargeFilePartBytes(30 * MIB)).toBe(RESUMABLE_UPLOAD_PART_BYTES);
  });

  it('keeps the largest file well inside the storage part count', () => {
    expect(
      resumableUploadPartCount(
        CHAT_LARGE_FILE_MAX_BYTES,
        chatLargeFilePartBytes(CHAT_LARGE_FILE_MAX_BYTES),
      ),
    ).toBeLessThan(STORAGE_MAX_PARTS);
  });

  it('sends four parts at a time on the web and two on a phone', () => {
    expect(RESUMABLE_UPLOAD_PART_CONCURRENCY).toEqual({ web: 4, mobile: 2 });
    expect(Object.isFrozen(RESUMABLE_UPLOAD_PART_CONCURRENCY)).toBe(true);
  });
});

describe('the answer to cancelling an upload session', () => {
  it("accepts today's body and the body that names a late intake", () => {
    expect(ManagedCloudResumableUploadAbortResponseSchema.parse({ aborted: true })).toEqual({
      aborted: true,
    });
    expect(
      ManagedCloudResumableUploadAbortResponseSchema.parse({
        aborted: true,
        intake: { id: INTAKE_ID },
      }),
    ).toEqual({ aborted: true, intake: { id: INTAKE_ID } });
  });

  it('refuses an intake without an id and an answer that did not abort', () => {
    expect(
      ManagedCloudResumableUploadAbortResponseSchema.safeParse({ aborted: true, intake: {} })
        .success,
    ).toBe(false);
    expect(
      ManagedCloudResumableUploadAbortResponseSchema.safeParse({ aborted: false }).success,
    ).toBe(false);
  });

  it('is read by a client that still parses only aborted, which drops the new key', () => {
    const today = z.object({ aborted: z.literal(true) });

    expect(today.parse({ aborted: true, intake: { id: INTAKE_ID } })).toEqual({ aborted: true });
  });
});
