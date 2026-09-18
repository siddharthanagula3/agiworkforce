import { describe, expect, it } from 'vitest';
import { GeneratedFileWireSchema, generatedFileReference } from '../generated-files';
import {
  ManagedCloudPublishedArtifactSchema,
  publishedArtifactFileReference,
} from '../artifact-index';
import { ManagedCloudChatAttachmentSchema, chatAttachmentFileReference } from '../chat-attachments';

const generated = GeneratedFileWireSchema.parse({
  id: 'gf-1',
  file_name: 'report.csv',
  mime_type: 'text/csv',
  uri: '/api/files/gf-1',
  byte_count: 120,
  kind: 'file',
  checksum_sha256: 'deadbeef',
});

const attachment = ManagedCloudChatAttachmentSchema.parse({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'notes.md',
  mimeType: 'text/markdown',
  byteCount: 44,
  type: 'file',
  url: '/api/files/att-1',
});

function publishedArtifact(visibility: unknown) {
  return ManagedCloudPublishedArtifactSchema.parse({
    token: 'tok',
    artifactId: 'art-1',
    title: 'Chart',
    kind: 'react',
    language: null,
    contentChars: 900,
    visibility,
    createdAt: '2026-09-18T00:00:00Z',
    updatedAt: '2026-09-18T00:00:00Z',
    shareUrl: 'https://example.test/a/tok',
    sandboxed: true,
  });
}

describe('the three file-carrying contracts speak one FileReference', () => {
  it('projects a generated file, keeping its checksum and resolving its uri', () => {
    const reference = generatedFileReference(generated, {
      apiBaseUrl: 'https://api.example.test/',
      sourceSurface: 'web',
    });

    expect(reference.origin).toBe('generated');
    expect(reference.storage).toBe('managed_cloud');
    expect(reference.uri).toBe('https://api.example.test/api/files/gf-1');
    expect(reference.checksumSha256).toBe('deadbeef');
    expect(reference.sourceSurface).toBe('web');
    expect(reference.visibility).toBe('private');
  });

  it('projects an upload and marks text-like bytes as still to be parsed', () => {
    const text = chatAttachmentFileReference(attachment, { sourceSurface: 'desktop' });
    expect(text.origin).toBe('upload');
    expect(text.parseStatus).toBe('pending');
    expect(text.sourceSurface).toBe('desktop');

    const binary = chatAttachmentFileReference({
      ...attachment,
      mimeType: 'application/pdf',
      type: 'file',
    });
    expect(binary.parseStatus).toBe('not_applicable');
  });

  it('carries the artifact visibility onto its file reference', () => {
    const reference = publishedArtifactFileReference(publishedArtifact('organization'), {
      mediaType: 'text/html',
      byteCount: 2048,
    });
    expect(reference.visibility).toBe('organization');
    expect(reference.uri).toBe('https://example.test/a/tok');
    expect(reference.byteCount).toBe(2048);
  });

  it('hides an artifact whose visibility this reader does not understand', () => {
    expect(publishedArtifact('team-of-the-future').visibility).toBe('private');
    expect(publishedArtifact('public').visibility).toBe('public');
  });
});
