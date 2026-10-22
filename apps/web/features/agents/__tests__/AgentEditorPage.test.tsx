import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: async () => 'token' }));
vi.mock('@/features/connectors/hooks/use-connectors', () => ({
  useConnectors: () => ({
    connectedIds: new Set(['github']),
    customNames: {},
    toolConnectorIds: { github: 'github-server' },
    loading: false,
    error: null,
    retry: vi.fn(),
  }),
}));
vi.mock('@/shared/stores/web-auth-store', () => ({
  useBillingStore: (select: (state: { subscription: { tier: string } }) => unknown) =>
    select({ subscription: { tier: 'pro' } }),
}));

import { AgentEditorPage } from '../components/AgentEditorPage';
import { fakeApi, managedAgent } from './agent-test-api';

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            skills: [
              {
                origin: 'bundled',
                name: 'pdf',
                description: 'Read PDFs',
                source: 'bundled',
                lifecycle: 'included',
                downloadable: true,
              },
            ],
          }),
          { status: 200 },
        ),
    ),
  );
});

describe('AgentEditorPage', () => {
  it('refuses to create an agent without a name, then creates it and opens its page', async () => {
    const api = fakeApi();
    render(<AgentEditorPage agentId={null} api={api} />);
    await userEvent.click(screen.getByRole('button', { name: 'Create agent' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Give the agent a name.');
    expect(api.create).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('Name'), 'Researcher');
    await userEvent.click(screen.getByRole('switch', { name: 'Code execution' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create agent' }));
    await waitFor(() => expect(api.create).toHaveBeenCalled());
    expect(vi.mocked(api.create).mock.calls[0]?.[0]).toMatchObject({
      name: 'Researcher',
      codeExecution: false,
      webSearch: true,
    });
    expect(replace).toHaveBeenCalledWith('/chat/agents/0190a000-0000-7000-8000-0000000000a1');
  });

  it('shows the agent header with an Active pill and its description', async () => {
    render(<AgentEditorPage agentId="0190a000-0000-7000-8000-0000000000a1" api={fakeApi()} />);
    const heading = await screen.findByRole('heading', { name: 'Release notes writer' });
    const header = heading.closest('header')!;
    expect(within(header).getByText('Active')).toBeInTheDocument();
    expect(
      within(header).getByText('Turns merged pull requests into release notes'),
    ).toBeInTheDocument();
  });

  it('splits the agent into Agent, Sessions and Deployments tabs', async () => {
    const api = fakeApi({
      activity: vi.fn(async () => ({
        conversations: [
          {
            id: '0190a000-0000-7000-8000-0000000000c1',
            title: 'Draft the v2 notes',
            updatedAt: '2026-10-20T00:00:00.000Z',
          },
        ],
        routines: [],
      })),
    });
    render(<AgentEditorPage agentId="0190a000-0000-7000-8000-0000000000a1" api={api} />);
    await screen.findByRole('heading', { name: 'Release notes writer' });
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Agent', 'Sessions', 'Deployments']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Name')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Sessions' }));
    expect(await screen.findByText('Draft the v2 notes')).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).toBeNull();

    await userEvent.click(screen.getByRole('tab', { name: 'Deployments' }));
    expect(await screen.findByText('No deployments yet.')).toBeInTheDocument();
  });

  it('shows no tabs while the agent is not saved yet', () => {
    render(<AgentEditorPage agentId={null} api={fakeApi()} />);
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('limits the agent to the connectors and skills ticked', async () => {
    const api = fakeApi();
    render(<AgentEditorPage agentId="0190a000-0000-7000-8000-0000000000a1" api={api} />);
    await screen.findByRole('heading', { name: 'Release notes writer' });
    const access = screen.getByRole('region', { name: 'Connectors and skills' });
    const skillsAll = await within(access).findByLabelText(
      'Every skill turned on for the person chatting',
    );
    await userEvent.click(skillsAll);
    await userEvent.click(await within(access).findByLabelText('pdf'));
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(api.update).toHaveBeenCalled());
    expect(vi.mocked(api.update).mock.calls[0]?.[1]).toMatchObject({ skillNames: ['pdf'] });
  });

  it('saves a monthly credit cap for everyone using the agent', async () => {
    const api = fakeApi();
    render(<AgentEditorPage agentId="0190a000-0000-7000-8000-0000000000a1" api={api} />);
    await screen.findByRole('heading', { name: 'Release notes writer' });
    await userEvent.type(screen.getByLabelText('Credits a month, across everyone'), '250');
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(api.update).toHaveBeenCalled());
    expect(vi.mocked(api.update).mock.calls[0]?.[1]).toMatchObject({ monthlyCreditLimit: 250 });
  });

  it('keeps publishing closed until the draft is saved', async () => {
    const api = fakeApi();
    render(<AgentEditorPage agentId="0190a000-0000-7000-8000-0000000000a1" api={api} />);
    await screen.findByRole('heading', { name: 'Release notes writer' });
    const publish = await screen.findByRole('button', { name: 'Publish' });
    expect(publish).toBeEnabled();
    await userEvent.type(screen.getByLabelText('Description'), ' weekly');
    expect(publish).toBeDisabled();
    expect(screen.getByText('Save your draft before you publish it.')).toBeInTheDocument();
  });

  it('asks before deleting and names what is lost', async () => {
    const api = fakeApi();
    render(<AgentEditorPage agentId="0190a000-0000-7000-8000-0000000000a1" api={api} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete agent' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('cannot be recovered');
    expect(api.remove).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete agent' }));
    await waitFor(() => expect(api.remove).toHaveBeenCalled());
    expect(push).toHaveBeenCalledWith('/chat/agents');
  });

  it('shows a teammate a read-only agent with no owner controls', async () => {
    const api = fakeApi({
      get: vi.fn(async () =>
        managedAgent({ isOwner: false, ownerName: 'Ada', publishedVersion: 1 }),
      ),
    });
    render(<AgentEditorPage agentId="0190a000-0000-7000-8000-0000000000a1" api={api} />);
    expect(await screen.findByText(/Ada built this agent/)).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete agent' })).toBeNull();
    expect(api.usage).not.toHaveBeenCalled();
  });
});
