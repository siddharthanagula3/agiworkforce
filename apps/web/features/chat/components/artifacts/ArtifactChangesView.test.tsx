import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ArtifactChangesView } from './ArtifactChangesView';

function renderChanges(previous: string, next: string) {
  return render(
    <ArtifactChangesView
      previous={previous}
      next={next}
      unit="word"
      fromVersion={1}
      toVersion={2}
    />,
  );
}

describe('ArtifactChangesView summary', () => {
  it('does not claim "No changes" for a punctuation-only edit', () => {
    renderChanges('Hello.', 'Hello!');

    const summary = screen.getByTestId('artifact-changes').querySelector('p')!;
    expect(summary.textContent).not.toContain('No changes');
    expect(summary.textContent).toContain('Since version 1');
    expect(screen.getByText('!')).toBeInTheDocument();
  });

  it('says "No changes" only when the two versions are identical', () => {
    renderChanges('Hello.', 'Hello.');

    expect(screen.getByText('No changes since version 1')).toBeInTheDocument();
  });
});
