import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkspaceConsolePointer } from './WorkspaceConsolePointer';

describe('WorkspaceConsolePointer', () => {
  it('renders a plain row linking to the workspace console, not a promotional card', () => {
    render(<WorkspaceConsolePointer />);

    const link = screen.getByRole('link', { name: /workspace administration/i });
    expect(link).toHaveAttribute('href', '/workspace');
    expect(screen.queryByText(/security posture, identity and sso/i)).toBeNull();
  });
});
