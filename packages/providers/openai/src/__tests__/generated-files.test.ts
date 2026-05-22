import { describe, expect, it } from 'vitest';
import {
  buildOpenAIContainerGeneratedFileBundles,
  extractOpenAIContainerFileCitations,
} from '../generated-files';

const responsePayload = {
  id: 'resp_123',
  output: [
    {
      id: 'msg_123',
      type: 'message',
      content: [
        {
          type: 'output_text',
          text: 'Created report.csv',
          annotations: [
            {
              type: 'container_file_citation',
              file_id: 'cfile_report',
              container_id: 'cntr_abc',
              filename: 'report.csv',
              start_index: 0,
              end_index: 0,
            },
            {
              type: 'container_file_citation',
              file_id: 'cfile_report',
              container_id: 'cntr_abc',
              filename: 'report.csv',
            },
          ],
        },
      ],
    },
  ],
};

describe('OpenAI generated file adapter', () => {
  it('extracts and dedupes container file citations from response payloads', () => {
    const citations = extractOpenAIContainerFileCitations(responsePayload);

    expect(citations).toEqual([
      expect.objectContaining({
        type: 'container_file_citation',
        file_id: 'cfile_report',
        container_id: 'cntr_abc',
        filename: 'report.csv',
      }),
    ]);
  });

  it('builds AGI generated-file manifests from materialized OpenAI container files', () => {
    const citations = extractOpenAIContainerFileCitations(responsePayload);
    const [bundle] = buildOpenAIContainerGeneratedFileBundles({
      responseId: 'resp_123',
      ownerUserId: 'user-1',
      sourceSurface: 'web',
      privacyMode: 'byok',
      providerMode: 'DirectByok',
      storageScope: 'direct_byok_provider',
      sourceConversationId: 'conversation-1',
      sourceMessageId: 'message-1',
      citations,
      files: [
        {
          fileId: 'cfile_report',
          uri: 'openai://containers/cntr_abc/files/cfile_report',
          byteCount: 2048,
          checksumSha256: 'a'.repeat(64),
          mimeType: 'text/csv',
        },
      ],
      createdAt: '2026-05-21T00:00:00.000Z',
      retentionExpiresAt: '2026-05-22T00:00:00.000Z',
      ttlSeconds: 86_400,
    });

    expect(bundle?.computeSession).toMatchObject({
      id: 'openai-container-cntr_abc',
      provider: 'openai',
      sourceSurface: 'web',
      privacyMode: 'byok',
      providerMode: 'DirectByok',
      status: 'completed',
      workdirUri: 'openai://containers/cntr_abc',
    });
    expect(bundle?.generatedFiles[0]).toMatchObject({
      id: 'openai-file-cfile_report',
      kind: 'csv',
      fileName: 'report.csv',
      mimeType: 'text/csv',
      privacyMode: 'byok',
      providerMode: 'DirectByok',
      byteCount: 2048,
      checksumSha256: 'a'.repeat(64),
    });
    expect(bundle?.artifactManifest).toMatchObject({
      type: 'generated_file_bundle',
      sourceConversationId: 'conversation-1',
      sourceMessageId: 'message-1',
      sourceSessionId: 'resp_123',
      storageScope: 'direct_byok_provider',
      generatedFileIds: ['openai-file-cfile_report'],
    });
  });

  it('fails closed when privacy mode is inferred incorrectly', () => {
    const citations = extractOpenAIContainerFileCitations(responsePayload);

    expect(() =>
      buildOpenAIContainerGeneratedFileBundles({
        responseId: 'resp_123',
        ownerUserId: 'user-1',
        sourceSurface: 'web',
        privacyMode: 'local',
        providerMode: 'DirectByok',
        storageScope: 'direct_byok_provider',
        citations,
        files: [],
      }),
    ).toThrow(/privacy mismatch/);
  });

  it('requires materialized file metadata before creating GeneratedFile records', () => {
    const citations = extractOpenAIContainerFileCitations(responsePayload);

    expect(() =>
      buildOpenAIContainerGeneratedFileBundles({
        responseId: 'resp_123',
        ownerUserId: 'user-1',
        sourceSurface: 'web',
        privacyMode: 'managed',
        providerMode: 'ManagedGateway',
        storageScope: 'managed_compute',
        citations,
        files: [],
      }),
    ).toThrow(/Missing materialized file metadata/);
  });
});
