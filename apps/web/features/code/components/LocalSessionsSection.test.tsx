import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type {
  LocalDeveloperSession,
  DeveloperSessionGroup,
} from '@agiworkforce/local-runtime-contract';
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
    onSelect: vi.fn(),
    onNewSession: vi.fn(),
    onAddFolder: vi.fn(),
    onAddRepository: vi.fn(),
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
});
