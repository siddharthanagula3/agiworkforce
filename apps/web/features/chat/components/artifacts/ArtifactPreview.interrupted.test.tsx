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
