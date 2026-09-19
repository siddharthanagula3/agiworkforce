import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceConsolePointer } from './WorkspaceConsolePointer';
import { SettingsSectionNavigationProvider } from '../components/SettingsSectionLink';

describe('WorkspaceConsolePointer', () => {
  it('renders a plain row linking to the workspace console, not a promotional card', () => {
    render(<WorkspaceConsolePointer />);

    const link = screen.getByRole('link', { name: /workspace administration/i });
    expect(link).toHaveAttribute('href', '/workspace');
    expect(screen.queryByText(/security posture, identity and sso/i)).toBeNull();
  });
});

it('exits settings on same-tab navigation but preserves it for a new tab', () => {
  const onExit = vi.fn();
  render(
    <SettingsSectionNavigationProvider onNavigate={vi.fn()} onExit={onExit}>
      <WorkspaceConsolePointer />
    </SettingsSectionNavigationProvider>,
  );
  const link = screen.getByRole('link', { name: /workspace administration/i });
  fireEvent.click(link, { metaKey: true });
  expect(onExit).not.toHaveBeenCalled();
  fireEvent.click(link);
  expect(onExit).toHaveBeenCalledOnce();
});
