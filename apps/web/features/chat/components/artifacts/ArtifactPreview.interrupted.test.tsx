import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ArtifactPreview, type ArtifactData } from './ArtifactPreview';

const NOTICE = 'artifact-interrupted-notice';

function partialArtifact(overrides: Partial<ArtifactData> = {}): ArtifactData {
  return {
    id: 'artifact-1',
    type: 'html',
    language: 'html',
    title: 'Stopped artifact',
    content: '<!DOCTYPE html>\n<html>\n  <body>',
    ...overrides,
  };
}

describe('WEB-USE-STREAMING-ARTIFACT-INTERRUPTING-01 · panel marker', () => {
  it('says the document is a fragment when the stream was stopped', () => {
    render(<ArtifactPreview artifact={partialArtifact({ interrupted: true })} variant="panel" />);

    const notice = screen.getByTestId(NOTICE);
    expect(notice.textContent).toMatch(/stopped before it finished/i);
    expect(notice.textContent).toMatch(/regenerate/i);
  });

  it('stays silent for an artifact that finished', () => {
    render(<ArtifactPreview artifact={partialArtifact()} variant="panel" />);

    expect(screen.queryByTestId(NOTICE)).toBeNull();
  });
});


describe('transient approval presentation', () => {
  it('changes only the notice on metadata-only transitions and preserves source and title', () => {
    const artifact = partialArtifact({ interrupted: true, title: 'My renamed draft', type: 'code' });
    const before = { ...artifact };
    const { rerender, container } = render(<ArtifactPreview artifact={artifact} variant="panel" awaitingApproval />);
    expect(screen.getByTestId(NOTICE)).toHaveTextContent('partial while the response awaits approval');
    expect(screen.getByTestId(NOTICE)).not.toHaveTextContent(/stopped|regenerate/i);
    expect(screen.getByText('My renamed draft')).toBeInTheDocument();
    expect(container.textContent).toContain('<!DOCTYPE html>');
    rerender(<ArtifactPreview artifact={artifact} variant="panel" awaitingApproval={false} />);
    expect(screen.getByTestId(NOTICE)).toHaveTextContent(/regenerate/i);
    expect(artifact).toEqual(before);
  });

  it('keeps default card/gallery consumers unchanged without a panel notice', () => {
    const artifact = partialArtifact({ interrupted: true, type: 'code' });
    const before = { ...artifact };
    const { container } = render(<ArtifactPreview artifact={artifact} />);
    expect(screen.getByTestId('artifact-preview-card')).toBeInTheDocument();
    expect(screen.queryByTestId(NOTICE)).toBeNull();
    expect(screen.getByText('Stopped artifact')).toBeInTheDocument();
    expect(container.textContent).toContain('<!DOCTYPE html>');
    expect(artifact).toEqual(before);
  });

  it('requires actual interrupted evidence even when awaiting approval', () => {
    render(<ArtifactPreview artifact={partialArtifact()} variant="panel" awaitingApproval />);
    expect(screen.queryByTestId(NOTICE)).toBeNull();
  });
});
