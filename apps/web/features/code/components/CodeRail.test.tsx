import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { CloudCodeSession } from '@agiworkforce/types';
import { AccountFooterProvider } from '@shared/components/layout/AccountFooter';
import {
  CODE_COPY,
  DEFAULT_CODE_FILTERS,
  filterAndSortSessions,
  type CodeSessionFilters,
} from '../code-surface';
import { CodeRail } from './CodeRail';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/code',
}));

function session(id: string, title: string): CloudCodeSession {
  return {
    id,
    title,
    state: 'ready',
    networkAccess: 'none',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  } as CloudCodeSession;
}

const SESSIONS = [session('a', 'Refactor billing'), session('b', 'Fix login redirect')];

function Harness() {
  const [filters, setFilters] = useState<CodeSessionFilters>(DEFAULT_CODE_FILTERS);
  return (
    <CodeRail
      sessions={filterAndSortSessions(SESSIONS, filters)}
      hiddenSessionsExist={false}
      selectedId={null}
      loading={false}
      filters={filters}
      onFiltersChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
      onNewSession={vi.fn()}
      onSelectSession={vi.fn()}
      onCollapse={vi.fn()}
    />
  );
}

describe('CodeRail search', () => {
  it('opens a search field from the header beside the collapse toggle', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const searchButton = screen.getByRole('button', { name: CODE_COPY.searchSessions });
    expect(searchButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: CODE_COPY.collapseRail })).toBeInTheDocument();

    await user.click(searchButton);

    const field = screen.getByRole('searchbox', { name: CODE_COPY.searchSessions });
    expect(field).toHaveFocus();
    expect(searchButton).toHaveAttribute('aria-expanded', 'true');
  });

  it('narrows the session list to titles holding the query', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const list = screen.getByRole('navigation', { name: CODE_COPY.recents });

    await user.click(screen.getByRole('button', { name: CODE_COPY.searchSessions }));
    await user.type(screen.getByRole('searchbox', { name: CODE_COPY.searchSessions }), 'LOGIN');

    expect(within(list).getByRole('button', { name: 'Fix login redirect' })).toBeInTheDocument();
    expect(within(list).queryByRole('button', { name: 'Refactor billing' })).toBeNull();
  });

  it('says when nothing matches rather than claiming there are no sessions', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: CODE_COPY.searchSessions }));
    await user.type(screen.getByRole('searchbox', { name: CODE_COPY.searchSessions }), 'zzz');

    expect(screen.getByText(CODE_COPY.noSearchMatches)).toBeInTheDocument();
    expect(screen.queryByText(CODE_COPY.noSessions)).toBeNull();
  });

  it('clears the query and returns focus to the button on Escape', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const searchButton = screen.getByRole('button', { name: CODE_COPY.searchSessions });

    await user.click(searchButton);
    await user.type(screen.getByRole('searchbox', { name: CODE_COPY.searchSessions }), 'zzz');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(searchButton).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Refactor billing' })).toBeInTheDocument();
  });
});

describe('CodeRail account footer', () => {
  it('renders the shell account footer at the bottom of the rail', () => {
    render(
      <AccountFooterProvider footer={<button type="button">Account menu for Ada</button>}>
        <Harness />
      </AccountFooterProvider>,
    );

    const footer = screen.getByTestId('code-rail-account-footer');
    expect(
      within(footer).getByRole('button', { name: 'Account menu for Ada' }),
    ).toBeInTheDocument();
  });

  it('renders no footer outside the shell', () => {
    render(<Harness />);
    expect(screen.queryByTestId('code-rail-account-footer')).toBeNull();
  });
});

describe('CodeRail session groups', () => {
  function renderSessions(sessions: CloudCodeSession[]) {
    render(
      <CodeRail
        sessions={sessions}
        hiddenSessionsExist={false}
        selectedId={null}
        loading={false}
        filters={DEFAULT_CODE_FILTERS}
        onFiltersChange={vi.fn()}
        onNewSession={vi.fn()}
        onSelectSession={vi.fn()}
      />,
    );
  }

  const sessionIn = (
    id: string,
    title: string,
    state: CloudCodeSession['state'],
    repositoryUrl: string | null,
  ): CloudCodeSession =>
    ({ ...session(id, title), state, repositoryUrl, archivedAt: null }) as CloudCodeSession;

  it('lists sessions under Ready and Idle with the repository under each title', () => {
    renderSessions([
      sessionIn('a', 'Refactor billing', 'ready', 'https://github.com/acme/billing.git'),
      sessionIn('b', 'Old spike', 'closed', 'https://github.com/acme/spike'),
    ]);

    const ready = screen.getByRole('region', { name: CODE_COPY.sessionsReady });
    const idle = screen.getByRole('region', { name: CODE_COPY.sessionsIdle });
    expect(within(ready).getByText('Refactor billing')).toBeInTheDocument();
    expect(within(ready).getByText('acme/billing')).toBeInTheDocument();
    expect(within(idle).getByText('Old spike')).toBeInTheDocument();
    expect(within(idle).getByText('acme/spike')).toBeInTheDocument();
    expect(screen.queryByText(CODE_COPY.sessionOpenBadge)).toBeNull();
  });

  it('marks a running session with the Open badge and shows no empty group', () => {
    renderSessions([sessionIn('a', 'Build the page', 'running', null)]);

    expect(screen.getByText(CODE_COPY.sessionOpenBadge)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: CODE_COPY.sessionsIdle })).toBeNull();
  });
});
