import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StreamingArtifactView } from './StreamingArtifactView';
import type { StreamingArtifact } from '../../stores/streaming-artifact-store';

function makeArtifact(content: string): StreamingArtifact {
  return {
    artifactId: 'a1',
    messageId: 'm1',
    conversationId: 'c1',
    type: 'html',
    language: 'html',
    title: 'Emoji Popper',
    content,
  };
}

describe('StreamingArtifactView · progressive render from a simulated stream', () => {
  it('renders the partial content, title, type label, and writing indicator', () => {
    render(<StreamingArtifactView artifact={makeArtifact('<!DOCTYPE html>\n<html>')} />);

    expect(screen.getByText('Emoji Popper')).toBeInTheDocument();
    expect(screen.getByText('· HTML')).toBeInTheDocument();
    expect(screen.getByText('Writing…')).toBeInTheDocument();
    expect(screen.getByTestId('streaming-artifact-code').textContent).toContain(
      '<!DOCTYPE html>\n<html>',
    );
  });

  it('appends content across simulated stream chunks', () => {
    const { rerender } = render(<StreamingArtifactView artifact={makeArtifact('<!DOCTYPE')} />);
    const code = () => screen.getByTestId('streaming-artifact-code').textContent ?? '';
    expect(code()).toContain('<!DOCTYPE');
    expect(code()).not.toContain('<body>');

    rerender(<StreamingArtifactView artifact={makeArtifact('<!DOCTYPE html>\n<html>\n<body>')} />);
    expect(code()).toContain('<!DOCTYPE html>');
    expect(code()).toContain('<body>');
    expect(screen.getByText('Writing…')).toBeInTheDocument();
  });
});
