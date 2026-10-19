import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ArtifactPreview } from '../ArtifactPreview';
import { useArtifactsStore } from '../../../stores/artifacts-store';
import { buildChangeReview, resolveReview } from './change-review';

const ID = '7b6a5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d';
const BEFORE = '# Plan\n\nWe ship in March. The team is small.';
const AFTER = '# Plan\n\nWe ship in April. The team is growing.';

describe('reviewing changes one by one', () => {
  beforeEach(() => {
    useArtifactsStore.getState().reset();
  });

  it('rebuilds either version exactly and any mix of choices', () => {
    const review = buildChangeReview(BEFORE, AFTER)!;
    expect(review.changeCount).toBe(2);
    expect(resolveReview(review, new Set())).toBe(AFTER);
    expect(resolveReview(review, null)).toBe(BEFORE);
    expect(resolveReview(review, new Set([1]))).toBe(
      '# Plan\n\nWe ship in April. The team is small.',
    );
  });

  it('undoes one suggested change and saves the result as a new version', () => {
    useArtifactsStore.getState().addArtifact({
      id: ID,
      type: 'document',
      title: 'Plan',
      language: 'markdown',
      content: BEFORE,
      messageId: 'm1',
      conversationId: 'c1',
    });
    const stored = () => useArtifactsStore.getState().artifacts.find((a) => a.id === ID)!;
    useArtifactsStore.getState().upsertArtifact({ ...stored(), content: AFTER });
    render(
      <ArtifactPreview
        artifact={stored()}
        variant="panel"
        versionHistory={useArtifactsStore.getState().getArtifactVersions(ID)}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'More artifact actions' }));
    fireEvent.click(screen.getByTestId('artifact-review-changes'));
    const review = screen.getByTestId('artifact-changes-review');
    expect(within(review).getByRole('status')).toHaveTextContent('2 changes, keeping 2');
    fireEvent.click(within(review).getByRole('button', { name: 'Undo change 1' }));
    fireEvent.click(within(review).getByTestId('artifact-review-apply'));
    expect(stored().content).toBe('# Plan\n\nWe ship in March. The team is growing.');
    expect(useArtifactsStore.getState().getArtifactVersions(ID)).toHaveLength(3);
  });
});
