import { describe, expect, it } from 'vitest';
import { deriveManagedFile } from '@agiworkforce/types';
import {
  ManagedCloudChatAttachmentSchema,
  chatAttachmentFileReference,
  chatAttachmentManagedFile,
} from '../chat-attachments';

const attachment = ManagedCloudChatAttachmentSchema.parse({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'quarterly.csv',
  mimeType: 'text/csv',
  byteCount: 2048,
  type: 'file',
  url: '/api/files/11111111-1111-4111-8111-111111111111',
});

describe('chatAttachmentManagedFile', () => {
  it('keeps every field of the reference it is built from', () => {
    const reference = chatAttachmentFileReference(attachment, { sourceSurface: 'web' });
    const managed = chatAttachmentManagedFile(attachment, { sourceSurface: 'web' });
    for (const key of Object.keys(reference) as Array<keyof typeof reference>) {
      expect(managed[key]).toEqual(reference[key]);
    }
  });

  it('starts an upload at version 1 with nothing it was derived from', () => {
    const managed = chatAttachmentManagedFile(attachment);
    expect(managed.version).toBe(1);
    expect(managed.parentVersionId).toBeNull();
    expect(managed.lineage.derivedFromFileId).toBeNull();
    expect(managed.parseStatus).toBe('pending');
  });

  it('records who uploaded it and which conversation it landed in', () => {
    const managed = chatAttachmentManagedFile(attachment, {
      lineage: { uploadedByUserId: 'user_1', conversationId: 'conv-1' },
    });
    expect(managed.lineage.uploadedByUserId).toBe('user_1');
    expect(managed.lineage.conversationId).toBe('conv-1');
  });

  it('is the source an export derived from the upload points back at', () => {
    const upload = chatAttachmentManagedFile(attachment, {
      lineage: { conversationId: 'conv-1' },
    });
    const exported = deriveManagedFile(upload, {
      id: 'export-1',
      name: 'quarterly.pdf',
      mediaType: 'application/pdf',
      byteCount: 900,
      uri: '/api/files/export-1',
      origin: 'generated',
      derivation: 'export',
    });

    expect(exported.lineage.derivedFromFileId).toBe(upload.id);
    expect(exported.lineage.conversationId).toBe('conv-1');
  });
});
