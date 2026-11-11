import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { connectorsReleased } from '@agiworkforce/types';
import { ArtifactPreview } from './ArtifactPreview';
import { useArtifactsStore } from '../../stores/artifacts-store';

const ID = '8c7b6a5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d';

beforeEach(() => {
  useArtifactsStore.getState().reset();
  useArtifactsStore.getState().addArtifact({
    id: ID,
    type: 'document',
    title: 'Plan',
    language: 'markdown',
    content: '# Plan\n\nShip.',
    messageId: 'm',
    conversationId: 'c',
  });
});

describe('cloud save entries while connectors are unreleased', () => {
  it('does not offer Google Docs, Google Drive or OneDrive saves', () => {
    expect(connectorsReleased()).toBe(false);
    const artifact = useArtifactsStore.getState().artifacts[0]!;
    render(<ArtifactPreview artifact={artifact} variant="panel" versionHistory={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'More artifact actions' }));

    expect(screen.getByTestId('artifact-save-template')).toBeInTheDocument();
    expect(screen.queryByTestId('artifact-save-google-docs')).toBeNull();
    expect(screen.queryByTestId('artifact-save-drive')).toBeNull();
    expect(screen.queryByTestId('artifact-save-onedrive')).toBeNull();
  });
});
