import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PublishResult } from '@agiworkforce/artifacts';
import { ArtifactPreview } from './ArtifactPreview';
import { useArtifactsStore } from '../../stores/artifacts-store';

const ARTIFACT_ID = 'artifact-publish-version-1';

function seedVersions() {
  const store = useArtifactsStore.getState();
  store.addArtifact({
    id: ARTIFACT_ID,
    type: 'html',
    title: 'Landing page',
    language: 'html',
    content: '<p>v1</p>',
    messageId: 'msg-1',
    conversationId: 'conv-1',
  });
  store.upsertArtifact({
    id: ARTIFACT_ID,
    type: 'html',
    title: 'Landing page',
    language: 'html',
    content: '<p>v2</p>',
    messageId: 'msg-1',
    conversationId: 'conv-1',
  });
}

describe('publishing from an older artifact version', () => {
  beforeEach(() => {
    useArtifactsStore.getState().reset();
    seedVersions();
  });

  it('hands the viewed version to the publisher instead of the latest content', async () => {
    const publishArtifact = vi.fn(
      async (): Promise<PublishResult> => ({
        kind: 'cloud',
        shareUrl: 'https://agiworkforce.com/shared-artifact/cccccccccccccccccccccccc',
      }),
    );
    const artifact = useArtifactsStore.getState().artifacts.find((a) => a.id === ARTIFACT_ID)!;
    render(
      <ArtifactPreview
        artifact={artifact}
        variant="panel"
        versionHistory={useArtifactsStore.getState().getArtifactVersions(ARTIFACT_ID)}
        publishArtifact={publishArtifact}
      />,
    );

    fireEvent.click(screen.getByLabelText('Previous version'));
    fireEvent.click(screen.getByLabelText('Publish artifact to a public link'));

    await waitFor(() => expect(publishArtifact).toHaveBeenCalledTimes(1));
    expect(publishArtifact).toHaveBeenCalledWith({ content: '<p>v1</p>', versionIndex: 0 });
  });

  it('publishes the latest content when no older version is selected', async () => {
    const publishArtifact = vi.fn(
      async (): Promise<PublishResult> => ({
        kind: 'cloud',
        shareUrl: 'https://agiworkforce.com/shared-artifact/dddddddddddddddddddddddd',
      }),
    );
    const artifact = useArtifactsStore.getState().artifacts.find((a) => a.id === ARTIFACT_ID)!;
    render(
      <ArtifactPreview
        artifact={artifact}
        variant="panel"
        versionHistory={useArtifactsStore.getState().getArtifactVersions(ARTIFACT_ID)}
        publishArtifact={publishArtifact}
      />,
    );

    fireEvent.click(screen.getByLabelText('Publish artifact to a public link'));

    await waitFor(() => expect(publishArtifact).toHaveBeenCalledTimes(1));
    expect(publishArtifact).toHaveBeenCalledWith({ content: '<p>v2</p>', versionIndex: 1 });
  });
});
