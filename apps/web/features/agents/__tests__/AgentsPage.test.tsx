import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { AgentsPage } from '../components/AgentsPage';
import { fakeApi, managedAgent } from './agent-test-api';

beforeEach(() => push.mockReset());

describe('AgentsPage', () => {
  it('lists the person’s own agents apart from the ones shared with them', async () => {
    const api = fakeApi({
      list: vi.fn(async () => [
        managedAgent(),
        managedAgent({
          id: '0190a000-0000-7000-8000-0000000000a2',
          name: 'Support triage',
          isOwner: false,
          ownerName: 'Ada',
          publishedVersion: 1,
        }),
      ]),
    });
    render(<AgentsPage api={api} />);
    const own = await screen.findByRole('region', { name: 'Your agents' });
    expect(own.textContent).toContain('Release notes writer');
    expect(own.textContent).toContain('Draft');
    const shared = screen.getByRole('region', { name: 'Shared with you' });
    expect(shared.textContent).toContain('Shared by Ada');
    expect(screen.getAllByRole('link', { name: /^Edit / })).toHaveLength(1);
  });

  it('starts a chat that runs as the agent and opens it', async () => {
    const api = fakeApi();
    render(<AgentsPage api={api} />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Chat with Release notes writer' }),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith('/chat/0190a000-0000-7000-8000-0000000000c1'),
    );
    expect(api.startConversation).toHaveBeenCalledWith('0190a000-0000-7000-8000-0000000000a1');
  });

  it('offers no chat for a paused agent', async () => {
    const api = fakeApi({
      list: vi.fn(async () => [
        managedAgent({ status: 'paused', pausedAt: '2026-10-19T00:00:00Z' }),
      ]),
    });
    render(<AgentsPage api={api} />);
    expect(
      await screen.findByRole('button', { name: 'Chat with Release notes writer' }),
    ).toBeDisabled();
    expect(screen.getByText('Paused')).toBeInTheDocument();
  });

  it('shows a way to start when there are no agents, and a retry when the list fails', async () => {
    const empty = fakeApi({ list: vi.fn(async () => []) });
    const { unmount } = render(<AgentsPage api={empty} />);
    expect(await screen.findByRole('link', { name: 'Create an agent' })).toHaveAttribute(
      'href',
      '/chat/agents/new',
    );
    unmount();
    const list = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue([]);
    render(<AgentsPage api={fakeApi({ list })} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No agents yet')).toBeInTheDocument();
  });

  it('imports a Claude Code agent file and opens the draft', async () => {
    const api = fakeApi();
    const { container } = render(<AgentsPage api={api} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['---\nname: reviewer\n---\nReview code.'], 'reviewer.md', {
      type: 'text/markdown',
    });
    await userEvent.upload(input, file);
    await waitFor(() =>
      expect(api.importMarkdown).toHaveBeenCalledWith('---\nname: reviewer\n---\nReview code.'),
    );
    expect(push).toHaveBeenCalledWith('/chat/agents/0190a000-0000-7000-8000-0000000000a1');
  });
});
