import { describe, it, expect } from 'vitest';
import {
  MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH,
  managedCloudMetadataLength,
} from '@agiworkforce/cloud-contracts';
import { buildBoundedCloudMessageMetadata } from '../cloudMessageMetadata';

/** A 40 KB HTML artifact — the exact shape that used to 400 the whole turn. */
function bigHtml(): string {
  return `<!DOCTYPE html><html><body>${'<p>filler paragraph</p>'.repeat(2_000)}</body></html>`;
}

describe('buildBoundedCloudMessageMetadata (DES-C06)', () => {
  it('drops an artifact whose bytes the message body already carries', () => {
    const html = bigHtml();
    const content = `Here you go:\n\n\`\`\`html\n${html}\n\`\`\``;
    const metadata = {
      artifacts: [{ id: 'a1', type: 'html', title: 'Page', content: html }],
      finishReason: 'stop',
    };

    const result = buildBoundedCloudMessageMetadata(metadata, content);

    expect(result.droppedRederivableArtifacts).toBe(1);
    expect(result.trimmed).toEqual([]);
    expect(result.metadata).toEqual({ finishReason: 'stop' });
  });

  it('keeps the whole assistant turn inside the server budget instead of failing it', () => {
    const html = bigHtml();
    const content = `Here you go:\n\n\`\`\`html\n${html}\n\`\`\``;
    const metadata = {
      artifacts: [{ id: 'a1', type: 'html', title: 'Page', content: html }],
      thinking: 'x'.repeat(2_000),
      finishReason: 'stop',
    };

    // Precondition: the untrimmed payload really does blow the cap.
    expect(managedCloudMetadataLength(metadata)).toBeGreaterThan(
      MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH,
    );

    const result = buildBoundedCloudMessageMetadata(metadata, content);

    expect(managedCloudMetadataLength(result.metadata)).toBeLessThanOrEqual(
      MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH,
    );
    // Nothing was sacrificed: the artifact was re-derivable, so the thinking
    // trace survived.
    expect(result.trimmed).toEqual([]);
    expect(result.metadata?.['thinking']).toHaveLength(2_000);
  });

  it('sacrifices optional projections least-valuable-first when they alone overflow', () => {
    const metadata = {
      // Not re-derivable — its content is nowhere in the body.
      artifacts: [{ id: 'a1', type: 'html', title: 'Page', content: bigHtml() }],
      // Oversized on its own, so dropping the artifact alone cannot rescue it.
      thinking: 'y'.repeat(MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH),
      cloudApproval: { runId: 'run-1' },
      finishReason: 'stop',
    };

    const result = buildBoundedCloudMessageMetadata(metadata, 'no fenced block here');

    expect(result.trimmed).toEqual(['artifacts', 'thinking']);
    expect(managedCloudMetadataLength(result.metadata)).toBeLessThanOrEqual(
      MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH,
    );
    // Control state is never dropped — a lost approval strands a suspended turn.
    expect(result.metadata?.['cloudApproval']).toEqual({ runId: 'run-1' });
    expect(result.metadata?.['finishReason']).toBe('stop');
  });

  it('records the dropped fields so the transcript can tell the user', () => {
    const metadata = { thinking: 'z'.repeat(40_000), finishReason: 'stop' };

    const result = buildBoundedCloudMessageMetadata(metadata, '');

    expect(result.metadata?.['metadataTrimmed']).toEqual(['thinking']);
  });

  it('counts the metadataTrimmed note itself against the budget', () => {
    // Sized so that dropping `thinking` lands *just* under the cap; if the note
    // were not measured, adding it would push the payload back over and the
    // server would 400 exactly the message this function saved.
    const filler = 'q'.repeat(MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH - 40);
    const metadata = { webSearchResults: filler, thinking: 'z'.repeat(500) };

    const result = buildBoundedCloudMessageMetadata(metadata, '');

    expect(managedCloudMetadataLength(result.metadata)).toBeLessThanOrEqual(
      MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH,
    );
  });

  it('leaves a metadata object that already fits completely untouched', () => {
    const metadata = {
      thinking: 'short',
      toolCalls: [{ id: 't1', name: 'search', args: {}, status: 'completed' }],
      agentActivity: { lastSequence: 3 },
    };

    const result = buildBoundedCloudMessageMetadata(metadata, 'plain answer');

    expect(result.metadata).toEqual(metadata);
    expect(result.trimmed).toEqual([]);
    expect(result.droppedRederivableArtifacts).toBe(0);
  });

  it('returns undefined metadata when trimming leaves nothing worth sending', () => {
    const result = buildBoundedCloudMessageMetadata({}, 'plain answer');
    expect(result.metadata).toBeUndefined();
  });

  it('keeps a server-emitted artifact that is NOT in the body when it fits', () => {
    const metadata = {
      artifacts: [{ id: 'a1', type: 'html', title: 'Page', content: '<div>tiny</div>' }],
    };

    const result = buildBoundedCloudMessageMetadata(metadata, 'answer with no fenced block');

    expect(result.droppedRederivableArtifacts).toBe(0);
    expect(result.metadata?.['artifacts']).toHaveLength(1);
  });
});
