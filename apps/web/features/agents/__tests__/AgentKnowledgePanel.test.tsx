import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AgentFile } from '@agiworkforce/cloud-contracts';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

import { AgentKnowledgePanel } from '../components/AgentKnowledgePanel';
import { fakeApi } from './agent-test-api';

function file(patch: Partial<AgentFile> = {}): AgentFile {
  return {
    id: '0190a000-0000-7000-8000-0000000000e1',
    name: 'handbook.txt',
    byteSize: 1200,
    createdAt: '2026-11-09T00:00:00.000Z',
    ...patch,
  } as AgentFile;
}

describe('AgentKnowledgePanel', () => {
  it('keeps Add files unavailable until the file list has loaded', async () => {
    let release!: (files: AgentFile[]) => void;
    const files = vi.fn(
      () =>
        new Promise<AgentFile[]>((resolve) => {
          release = resolve;
        }),
    );
    render(<AgentKnowledgePanel api={fakeApi({ files })} agentId="agent-1" editable />);

    expect(screen.getByRole('button', { name: /add files/i })).toBeDisabled();

    await act(async () => release([file()]));
    await waitFor(() => expect(screen.getByRole('button', { name: /add files/i })).toBeEnabled());
    expect(screen.getByText('handbook.txt')).toBeInTheDocument();
  });

  it('shows an uploaded file after the list has loaded', async () => {
    const saved = file({ id: '0190a000-0000-7000-8000-0000000000e2', name: 'notes.txt' });
    const addFile = vi.fn(async () => saved);
    const { container } = render(
      <AgentKnowledgePanel
        api={fakeApi({ files: vi.fn(async () => []), addFile })}
        agentId="agent-1"
        editable
      />,
    );
    await screen.findByText('No files yet.');

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(['hello'], 'notes.txt', { type: 'text/plain' }));

    expect(await screen.findByText('notes.txt')).toBeInTheDocument();
    expect(screen.queryByText('No files yet.')).not.toBeInTheDocument();
  });

  it('ignores a list response from a load that was superseded', async () => {
    const resolvers: Array<(files: AgentFile[]) => void> = [];
    const files = vi.fn(
      () =>
        new Promise<AgentFile[]>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const api = fakeApi({ files });
    const { rerender } = render(<AgentKnowledgePanel api={api} agentId="agent-1" editable />);
    rerender(<AgentKnowledgePanel api={api} agentId="agent-2" editable />);
    expect(resolvers).toHaveLength(2);

    await act(async () => resolvers[1]!([file({ name: 'second.txt' })]));
    await act(async () => resolvers[0]!([file({ name: 'first.txt' })]));

    expect(screen.getByText('second.txt')).toBeInTheDocument();
    expect(screen.queryByText('first.txt')).not.toBeInTheDocument();
  });
});
