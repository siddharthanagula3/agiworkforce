import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloudAgentRun } from '@agiworkforce/cloud-contracts';
import { useAuthStore } from '@shared/stores/authentication-store';
import { HomeActiveTasks, HOME_ACTIVE_VISIBLE_LIMIT } from '../HomeActiveTasks';

type ReactI18nextModule = typeof import('react-i18next');

const mocks = vi.hoisted(() => ({
  listRuns: vi.fn(),
  setArchived: vi.fn<(runId: string, archived: boolean) => Promise<unknown>>(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('react-i18next', async (importOriginal) => {
  const { createInstance } = await import('i18next');
  const { resources } = await import('@agiworkforce/i18n');
  const instance = createInstance();
  await instance.init({
    lng: 'en',
    fallbackLng: false,
    resources,
    ns: ['v3'],
    defaultNS: 'v3',
    interpolation: { escapeValue: false },
  });
  const t = instance.getFixedT('en', 'v3');
  return { ...(await importOriginal<ReactI18nextModule>()), useTranslation: () => ({ t }) };
});

vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));

vi.mock('@/features/tasks/services/cloud-tasks-client', () => ({
  createWebCloudTasksClient: () => ({ listRuns: mocks.listRuns }),
  setWebCloudTaskArchived: mocks.setArchived,
}));

let sequence = 0;

function run(overrides: Partial<CloudAgentRun>): CloudAgentRun {
  sequence += 1;
  const id = `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
  return {
    id,
    userId: 'user-1',
    requestId: `request-${sequence}`,
    conversationId: `conversation-${sequence}`,
    conversationTitle: `Task ${sequence}`,
    originSurface: 'web',
    workMode: 'agiwork',
    state: 'running',
    provider: 'provider',
    model: 'model',
    lastEventSequence: 0,
    cancellationRequestedAt: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as CloudAgentRun;
}

function serve(runs: CloudAgentRun[]) {
  mocks.listRuns.mockResolvedValue({ runs, nextCursor: null });
}

beforeEach(() => {
  sequence = 0;
  mocks.listRuns.mockReset();
  mocks.setArchived.mockReset();
  mocks.toastSuccess.mockReset();
  mocks.toastError.mockReset();
  useAuthStore.setState({ user: { id: 'user-1' } as never });
});

afterEach(() => {
  cleanup();
  useAuthStore.setState({ user: null });
});

describe('HomeActiveTasks', () => {
  it('stays hidden when the account has no active Work or research runs', async () => {
    serve([run({ workMode: 'chat', state: 'ready_for_review' })]);
    const { container } = render(<HomeActiveTasks />);
    await waitFor(() => expect(mocks.listRuns).toHaveBeenCalledTimes(1));
    expect(container).toBeEmptyDOMElement();
  });

  it('does not ask for runs when nobody is signed in', () => {
    useAuthStore.setState({ user: null });
    const { container } = render(<HomeActiveTasks />);
    expect(mocks.listRuns).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it('lists active tasks with their state and a live marker on running ones', async () => {
    const running = run({ conversationTitle: 'Compile vendor list', state: 'running' });
    const review = run({ conversationTitle: 'Draft launch email', state: 'ready_for_review' });
    serve([running, review]);
    render(<HomeActiveTasks />);

    const section = await screen.findByTestId('home-active-tasks');
    expect(within(section).getByRole('heading', { name: 'Active' })).toBeInTheDocument();
    const runningRow = screen.getByTestId(`home-active-task-${running.id}`);
    expect(runningRow).toHaveAttribute('href', `/chat/${running.conversationId}`);
    expect(runningRow).toHaveTextContent('Compile vendor list');
    expect(screen.getByTestId(`home-active-task-live-${running.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`home-active-task-live-${review.id}`)).not.toBeInTheDocument();
  });

  it('offers Clear active only when a finished task is listed', async () => {
    serve([run({ state: 'running' }), run({ state: 'awaiting_input' })]);
    render(<HomeActiveTasks />);
    await screen.findByTestId('home-active-tasks');
    expect(screen.queryByRole('button', { name: 'Clear active' })).not.toBeInTheDocument();
  });

  it('Clear active archives the finished tasks and leaves running ones listed', async () => {
    const running = run({ state: 'running' });
    const review = run({ state: 'ready_for_review' });
    const failed = run({ state: 'failed', workMode: 'research' });
    serve([running, review, failed]);
    mocks.setArchived.mockResolvedValue({});
    render(<HomeActiveTasks />);

    fireEvent.click(await screen.findByRole('button', { name: 'Clear active' }));

    await waitFor(() =>
      expect(screen.queryByTestId(`home-active-task-${review.id}`)).not.toBeInTheDocument(),
    );
    expect(mocks.setArchived.mock.calls).toEqual([
      [review.id, true],
      [failed.id, true],
    ]);
    expect(screen.queryByTestId(`home-active-task-${failed.id}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`home-active-task-${running.id}`)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear active' })).not.toBeInTheDocument();
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'Cleared 2 finished tasks',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) }),
    );
  });

  it('keeps a task listed and says so when archiving it fails', async () => {
    const review = run({ state: 'ready_for_review' });
    serve([review]);
    mocks.setArchived.mockRejectedValue(new Error('conflict'));
    render(<HomeActiveTasks />);

    fireEvent.click(await screen.findByRole('button', { name: 'Clear active' }));

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('Could not clear 1 task. Try again.'),
    );
    expect(screen.getByTestId(`home-active-task-${review.id}`)).toBeInTheDocument();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it('Undo restores the cleared tasks', async () => {
    const review = run({ state: 'completed' });
    serve([review]);
    mocks.setArchived.mockResolvedValue({});
    render(<HomeActiveTasks />);

    fireEvent.click(await screen.findByRole('button', { name: 'Clear active' }));
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    const options = mocks.toastSuccess.mock.calls[0]?.[1] as { action: { onClick: () => void } };
    options.action.onClick();

    await waitFor(() => expect(mocks.setArchived).toHaveBeenCalledWith(review.id, false));
    await waitFor(() => expect(mocks.listRuns).toHaveBeenCalledTimes(2));
  });

  it('shows a retry when the list cannot load', async () => {
    mocks.listRuns.mockRejectedValueOnce(new Error('offline'));
    render(<HomeActiveTasks />);

    expect(await screen.findByTestId('home-active-tasks-error')).toHaveTextContent(
      'Could not load your active tasks.',
    );
    serve([run({ state: 'running' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('home-active-tasks')).toBeInTheDocument();
  });

  it('caps the list and links the rest to Tasks', async () => {
    serve(Array.from({ length: HOME_ACTIVE_VISIBLE_LIMIT + 2 }, () => run({ state: 'running' })));
    render(<HomeActiveTasks />);

    const section = await screen.findByTestId('home-active-tasks');
    expect(within(section).getAllByRole('listitem')).toHaveLength(HOME_ACTIVE_VISIBLE_LIMIT);
    expect(within(section).getByRole('link', { name: 'Work history' })).toHaveAttribute(
      'href',
      '/tasks',
    );
  });
});
