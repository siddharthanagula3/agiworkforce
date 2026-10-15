import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type {
  LocalDeveloperSession,
  DeveloperSessionGroup,
} from '@agiworkforce/local-runtime-contract';
import { localMcpServerKey } from '../local-code';
import { LocalSessionsSection, type LocalSessionsSectionProps } from './LocalSessionsSection';

const session: LocalDeveloperSession = {
  id: 'thread-1',
  rootId: 'root-1',
  title: 'Quote the readme',
  cwd: '/work/qa-project',
  model: 'qa-provider/qa-model',
  provider: 'a-provider',
  trustMode: 'byok',
  status: 'idle',
  createdAt: '2026-09-14T11:00:00Z',
  updatedAt: '2026-09-14T11:05:00Z',
  origin: 'cli',
};

const group: DeveloperSessionGroup = {
  rootId: 'root-1',
  name: 'qa-project',
  path: '/work/qa-project',
  branch: 'main',
  sessions: [session],
};

function renderSection(overrides: Partial<LocalSessionsSectionProps> = {}) {
  const props: LocalSessionsSectionProps = {
    groups: [group],
    loading: false,
    adding: false,
    error: null,
    unavailable: null,
    selectedId: null,
    activity: {},
    onSelect: vi.fn(),
    onNewSession: vi.fn(),
    onAddFolder: vi.fn(),
    onAddRepository: vi.fn(),
    allowing: null,
    allowRefusals: {},
    onAllowSessions: vi.fn(),
    reviewingMcp: null,
    mcpRefusals: {},
    onReviewMcpServer: vi.fn(),
    ...overrides,
  };
  render(<LocalSessionsSection {...props} />);
  return props;
}

describe('on this device', () => {
  it('lists a session under its folder and branch', () => {
    renderSection();

    expect(screen.getByText('qa-project')).toBeInTheDocument();
    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText('Quote the readme')).toBeInTheDocument();
    expect(screen.getByText(/^CLI · qa-provider\/qa-model/)).toBeInTheDocument();
  });

  it('says why git status is off for a folder whose repository settings run programs', () => {
    renderSection({
      groups: [
        {
          ...group,
          branch: null,
          gitUnavailableReason:
            'its repository settings run programs (filter.lfs.clean in .git/config)',
        },
      ],
    });

    expect(
      screen.getByText(
        'Git status is off for this folder: its repository settings run programs (filter.lfs.clean in .git/config).',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('main')).not.toBeInTheDocument();
  });

  it('shows no git notice for a folder git can read', () => {
    renderSection();

    expect(screen.queryByText(/Git status is off/)).not.toBeInTheDocument();
  });

  it('offers a new session in each folder, and a folder to add', async () => {
    const props = renderSection();

    await userEvent.click(screen.getByRole('button', { name: 'New session in qa-project' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add a folder' }));

    expect(props.onNewSession).toHaveBeenCalledWith('root-1');
    expect(props.onAddFolder).toHaveBeenCalled();
  });

  it('offers a repository apart from a plain folder', async () => {
    const props = renderSection();

    await userEvent.click(screen.getByRole('button', { name: 'Add a repository' }));

    expect(props.onAddRepository).toHaveBeenCalled();
    expect(props.onAddFolder).not.toHaveBeenCalled();
  });

  it('says no folder is open yet when none is approved', () => {
    renderSection({ groups: [] });

    expect(screen.getByText('No folder on this device is open to AGI yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a folder' })).toBeInTheDocument();
  });

  it('shows one line when the CLI is missing, and no folder rows', () => {
    renderSection({
      groups: [
        {
          ...group,
          sessions: [],
          unavailable: { message: 'No AGI CLI here.', hint: 'Install it.' },
        },
      ],
      unavailable: 'No AGI CLI here. Install it.',
    });

    expect(screen.getByText('No AGI CLI here. Install it.')).toBeInTheDocument();
    expect(screen.queryByText('qa-project')).not.toBeInTheDocument();
  });

  it('names one folder that cannot run while the others still list', () => {
    renderSection({
      groups: [
        {
          ...group,
          rootId: 'gone',
          name: 'gone-folder',
          sessions: [],
          unavailable: { message: 'gone-folder is no longer on this Mac.', hint: 'Remove it.' },
        },
        group,
      ],
    });

    expect(screen.getByText('gone-folder is no longer on this Mac.')).toBeInTheDocument();
    expect(screen.getByText('Quote the readme')).toBeInTheDocument();
  });

  it('reports a failure as an alert', () => {
    renderSection({ error: 'That session could not be opened.' });

    expect(screen.getByRole('alert')).toHaveTextContent('That session could not be opened.');
  });

  it('shows a spinner while loading', () => {
    renderSection({ loading: true, groups: [] });

    expect(screen.getByLabelText('Loading local sessions')).toBeInTheDocument();
  });

  it('marks the selected session as current', () => {
    renderSection({ selectedId: 'thread-1' });

    const row = screen.getByRole('button', { name: /Quote the readme/ });
    expect(row).toHaveAttribute('aria-current', 'true');
  });

  it('marks each session by what its turn is doing, even with its panel closed', () => {
    const other = { ...session, id: 'thread-2', title: 'Second' };
    const third = { ...session, id: 'thread-3', title: 'Third', status: 'failed' as const };
    renderSection({
      groups: [{ ...group, sessions: [session, other, third] }],
      activity: { 'thread-1': 'running', 'thread-2': 'needs-approval' },
    });

    expect(screen.getByRole('button', { name: /Quote the readme/ })).toHaveAttribute(
      'data-marker',
      'running',
    );
    expect(screen.getByText(/^Running · CLI/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Second/ })).toHaveAttribute(
      'data-marker',
      'needs-approval',
    );
    expect(screen.getByText(/^Needs approval · CLI/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Third/ })).toHaveAttribute('data-marker', 'failed');
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });
});

describe('a folder whose sessions are withheld', () => {
  const withheld: DeveloperSessionGroup = { ...group, sessions: [], sessionsWithheld: true };

  it('says how to see its sessions and asks for the grant on the button', async () => {
    const user = userEvent.setup();
    const props = renderSection({ groups: [withheld] });

    expect(
      screen.getByText('Allow running commands in this folder to see its sessions.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Allow running commands' }));

    expect(props.onAllowSessions).toHaveBeenCalledWith('root-1');
  });

  it('waits on the prompt that is already up rather than raising another', () => {
    renderSection({ groups: [withheld], allowing: 'root-1' });

    expect(screen.getByRole('button', { name: 'Waiting for your answer' })).toBeDisabled();
  });

  it('says why the folder still shows nothing after a refusal', () => {
    renderSection({
      groups: [withheld],
      allowRefusals: { 'root-1': 'Running commands in this folder was refused.' },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('was refused');
  });

  it('asks nothing of a folder whose sessions are listed', () => {
    renderSection();

    expect(screen.queryByRole('button', { name: 'Allow running commands' })).toBeNull();
    expect(screen.queryByText(/to see its sessions/)).toBeNull();
  });
});

describe('a project MCP server that waits for approval', () => {
  const github = { name: 'github', scope: 'project' } as const;
  const linter = { name: 'linter', scope: 'plugin' } as const;
  const waiting: DeveloperSessionGroup = { ...group, mcpAwaitingApproval: [github, linter] };

  it('says the server has not started and asks the shell to review that one on the button', async () => {
    const user = userEvent.setup();
    const props = renderSection({ groups: [waiting] });

    expect(
      screen.getByText(
        'The MCP server github has not started. This project names it, and it waits for your approval.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Quote the readme')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Review linter…' }));

    expect(props.onReviewMcpServer).toHaveBeenCalledTimes(1);
    expect(props.onReviewMcpServer).toHaveBeenCalledWith('root-1', linter);
  });

  it('offers no way to approve from the page, only to open the review', () => {
    renderSection({ groups: [waiting] });

    expect(screen.queryByRole('button', { name: /allow|approve/iu })).toBeNull();
  });

  it('waits on the dialog that is already up rather than raising another', () => {
    renderSection({ groups: [waiting], reviewingMcp: localMcpServerKey('root-1', github) });

    expect(screen.getByRole('button', { name: 'Waiting for your answer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Review linter…' })).toBeDisabled();
  });

  it('says why a server is still waiting after a review the CLI refused', () => {
    renderSection({
      groups: [waiting],
      mcpRefusals: {
        [localMcpServerKey('root-1', github)]: "MCP server 'github' is no longer declared.",
      },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('no longer declared');
  });

  it('shows nothing for a folder with no server waiting', () => {
    renderSection();

    expect(screen.queryByText(/waits for your approval/u)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Review /u })).toBeNull();
  });
});
