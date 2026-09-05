import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '../Sidebar';
import type { SidebarSession } from '../types';

const RATE_LIMIT_DETAIL = 'Too many requests. Please wait before trying again.';
const EMPTY_STATE = 'No conversations yet';
const LOAD_FAILED = "Couldn't load conversations";

const loadedSessions: SidebarSession[] = [
  { id: 'a', title: 'Release notes', updatedAt: new Date().toISOString() },
  { id: 'b', title: 'Design review', updatedAt: new Date().toISOString() },
];

function renderSidebar(overrides: {
  sessions?: SidebarSession[];
  error?: string | null;
  onRetryLoad?: () => void;
}) {
  render(
    <Sidebar
      sessions={overrides.sessions ?? []}
      projects={[]}
      error={overrides.error ?? null}
      {...(overrides.onRetryLoad ? { onRetryLoad: overrides.onRetryLoad } : {})}
      onNewChat={vi.fn()}
      onSelect={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
      onTogglePin={vi.fn()}
    />,
  );
}

describe('Sidebar conversation-list states', () => {
  it('loaded empty: offers the empty state and no load failure', () => {
    renderSidebar({});

    expect(screen.getByText(EMPTY_STATE)).not.toBeNull();
    expect(screen.queryByText(LOAD_FAILED)).toBeNull();
  });

  it('error with a prior list: keeps the rows and shows neither empty state nor failure card', () => {
    renderSidebar({ sessions: loadedSessions, error: RATE_LIMIT_DETAIL });

    expect(screen.getByText('Release notes')).not.toBeNull();
    expect(screen.getByText('Design review')).not.toBeNull();
    expect(screen.queryByText(EMPTY_STATE)).toBeNull();
    expect(screen.queryByText(LOAD_FAILED)).toBeNull();
  });

  it('error with no prior list: shows the failure card and never the empty state', () => {
    renderSidebar({ error: RATE_LIMIT_DETAIL });

    expect(screen.getByText(LOAD_FAILED)).not.toBeNull();
    expect(screen.getByText(RATE_LIMIT_DETAIL)).not.toBeNull();
    expect(screen.queryByText(EMPTY_STATE)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start a new chat' })).toBeNull();
  });

  it('error with no prior list: retry re-runs the list fetch', async () => {
    const onRetryLoad = vi.fn();
    renderSidebar({ error: RATE_LIMIT_DETAIL, onRetryLoad });

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(onRetryLoad).toHaveBeenCalledTimes(1);
  });
});
