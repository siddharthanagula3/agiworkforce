/// <reference types="@testing-library/jest-dom" />
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DynamicSidecar } from './DynamicSidecar';

vi.mock('./ArtifactRenderer', () => ({
  ArtifactRenderer: () => <div data-testid="artifact-renderer" />,
}));

describe('DynamicSidecar preview mode', () => {
  it('renders payload content when preview payload contains content', () => {
    render(<DynamicSidecar panelType="preview" payload={{ content: 'Preview body' }} />);
    expect(screen.getByText('Preview body')).toBeInTheDocument();
    expect(screen.queryByText('Awaiting panel content…')).not.toBeInTheDocument();
  });

  it('shows explicit fallback when preview has no payload', () => {
    render(<DynamicSidecar panelType="preview" />);
    expect(screen.getByText('No preview content is available yet.')).toBeInTheDocument();
  });
});
