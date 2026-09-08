import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CloudAgentRun, ManagedCloudAgentRunClient } from '@agiworkforce/cloud-contracts';
import { TasksPage } from '../TasksPage';

const RUN_ID = '0190a000-0000-7000-8000-0000000000cc';

function makeRun(overrides: Partial<CloudAgentRun> = {}): CloudAgentRun {
  return {
    id: RUN_ID,
    userId: 'user-1',
    requestId: 'request-1',
    conversationId: null,
    originSurface: 'web',
    workMode: 'agiwork',
    state: 'completed',
    provider: 'openai',
    model: 'fixture-task-model',
    lastEventSequence: 1,
    cancellationRequestedAt: null,
    completedAt: '2026-08-02T12:05:00.000Z',
    createdAt: '2026-08-02T12:00:00.000Z',
    updatedAt: '2026-08-02T12:05:00.000Z',
    ...overrides,
  };
}

function client(runs: CloudAgentRun[], listRuns = vi.fn()): ManagedCloudAgentRunClient {
  return {
    listRuns: listRuns.mockImplementation(async () => ({ runs, nextCursor: null })),
    getRun: vi.fn(async () => ({ run: runs[0]!, events: [], nextAfterSequence: 1 })),
    cancelRun: vi.fn(async () => runs[0]!),
    followRun: vi.fn(),
  } as unknown as ManagedCloudAgentRunClient;
}

describe('a finished task can be shelved and brought back', () => {
  it('offers Archive on a finished run and sends it through the host', async () => {
    const setRunArchived = vi.fn(async () => makeRun({ state: 'archived' }));
    render(
      <TasksPage
        transport={{
          client: client([makeRun()]),
          openConversation: vi.fn(),
          notifyError: vi.fn(),
          setRunArchived,
        }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /^Archive$/ }));

    await waitFor(() => expect(setRunArchived).toHaveBeenCalledWith(RUN_ID, true));
  });

  it('never offers Archive on a run that is still going', async () => {
    render(
      <TasksPage
        transport={{
          client: client([makeRun({ state: 'running', completedAt: null })]),
          openConversation: vi.fn(),
          notifyError: vi.fn(),
          setRunArchived: vi.fn(),
        }}
      />,
    );

    await screen.findByRole('button', { name: /^Stop$/ });
    expect(screen.queryByRole('button', { name: /^Archive$/ })).toBeNull();
  });

  it('paints no archive control at all when the host cannot archive', async () => {
    render(
      <TasksPage
        transport={{ client: client([makeRun()]), openConversation: vi.fn(), notifyError: vi.fn() }}
      />,
    );

    await screen.findByText(/AGI Work/);
    expect(screen.queryByRole('button', { name: /^Archive$/ })).toBeNull();
  });

  it('asks the list for archived runs only, and offers Restore on them', async () => {
    const listRuns = vi.fn();
    const setRunArchived = vi.fn(async () => makeRun({ state: 'completed' }));
    render(
      <TasksPage
        transport={{
          client: client([makeRun({ state: 'archived' })], listRuns),
          openConversation: vi.fn(),
          notifyError: vi.fn(),
          setRunArchived,
        }}
      />,
    );
    await screen.findByText(/AGI Work/);

    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));

    await waitFor(() =>
      expect(listRuns).toHaveBeenLastCalledWith(expect.objectContaining({ states: ['archived'] })),
    );
    fireEvent.click(await screen.findByRole('button', { name: /^Restore$/ }));
    await waitFor(() => expect(setRunArchived).toHaveBeenCalledWith(RUN_ID, false));
  });

  it('keeps the row and repeats the reason the server gave', async () => {
    const notifyError = vi.fn();
    const setRunArchived = vi.fn(async () => {
      throw new Error('Only a task that has finished can be archived.');
    });
    render(
      <TasksPage
        transport={{
          client: client([makeRun()]),
          openConversation: vi.fn(),
          notifyError,
          setRunArchived,
        }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /^Archive$/ }));

    await waitFor(() => expect(notifyError).toHaveBeenCalled());
    expect(String(notifyError.mock.calls[0]?.[0])).toContain(
      'Only a task that has finished can be archived.',
    );
    expect(screen.getByRole('button', { name: /^Archive$/ })).toBeTruthy();
  });

  it('falls back to honest copy when the failure carries no message', async () => {
    const notifyError = vi.fn();
    const setRunArchived = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    render(
      <TasksPage
        transport={{
          client: client([makeRun()]),
          openConversation: vi.fn(),
          notifyError,
          setRunArchived,
        }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /^Archive$/ }));

    await waitFor(() => expect(notifyError).toHaveBeenCalled());
    expect(String(notifyError.mock.calls[0]?.[0])).not.toContain('Failed to fetch');
  });

  it('does not offer Start AGI Work from the archived filter', async () => {
    render(
      <TasksPage
        transport={{
          client: client([]),
          openConversation: vi.fn(),
          notifyError: vi.fn(),
          startWork: vi.fn(),
          setRunArchived: vi.fn(),
        }}
      />,
    );
    await screen.findByText('No active tasks yet');

    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));

    expect(await screen.findByText('No archived tasks yet')).toBeTruthy();
    expect(screen.getByText(/A finished task moves here when you archive it/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start AGI Work' })).toBeNull();
  });
});
