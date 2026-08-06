/**
 * The progressive artifact view is display-only: it must show the partial
 * source text as it streams and must never claim the artifact is finished.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArtifactDraftView } from '../ArtifactDraftView';
import type { ArtifactDraft } from '@/stores/artifactStore';

function draft(overrides: Partial<ArtifactDraft> = {}): ArtifactDraft {
  return {
    key: 'msg-1:0',
    title: 'Pricing Table',
    artifactType: 'react',
    content: '',
    language: 'tsx',
    complete: false,
    openedPanel: true,
    ...overrides,
  };
}

describe('ArtifactDraftView', () => {
  it('shows the streaming title, type and a writing indicator', () => {
    render(<ArtifactDraftView draft={draft()} />);
    expect(screen.getByText('Pricing Table')).toBeInTheDocument();
    expect(screen.getByText('react')).toBeInTheDocument();
    expect(screen.getByText('Writing…')).toBeInTheDocument();
    expect(screen.getByTestId('artifact-draft-spinner')).toBeInTheDocument();
  });

  it('renders partial content verbatim rather than a rendered preview', () => {
    render(<ArtifactDraftView draft={draft({ content: '<div>half writ' })} />);
    const pre = screen.getByTestId('artifact-draft-content');
    expect(pre.textContent).toBe('<div>half writ');
    // Raw text, not an interpreted DOM node.
    expect(pre.querySelector('div')).toBeNull();
  });

  it('falls back to a placeholder before any content arrives', () => {
    render(<ArtifactDraftView draft={draft({ title: null, artifactType: null })} />);
    expect(screen.getByText('Untitled artifact')).toBeInTheDocument();
    expect(screen.queryByTestId('artifact-draft-content')).toBeNull();
  });

  it('reports a close request to the caller', () => {
    const onClose = vi.fn();
    render(<ArtifactDraftView draft={draft()} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close artifact panel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
