import { act, render, screen, waitFor, within } from '@testing-library/react';
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

import { EFFORT_LABEL, getModelEffortOptions, isAutoModeModelId } from '@agiworkforce/types';
import { hasUnsavedChanges } from '@agiworkforce/ui';
import type { ManagedCloudAgent } from '@agiworkforce/cloud-contracts';
import { getScheduleModelOptions } from '@/lib/schedules/schedule-models';

import { AgentEditorPage } from '../components/AgentEditorPage';
import { fakeApi, managedAgent } from './agent-test-api';

function footerAction(name: string) {
  return within(screen.getByLabelText('Agent actions')).getByRole('button', { name });
}

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
                title: 'PDF documents',
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
  it.each(['header', 'footer', 'name-enter'])(
    'submits the same draft once via %s, while Enter in skill search only selects',
    async (submission) => {
      const api = fakeApi();
      render(<AgentEditorPage agentId={null} api={api} />);
      const form = screen.getByRole('form', { name: 'Agent configuration' });
      const header = screen.getByRole('heading', { name: 'New agent' }).closest('header')!;
      const headerCreate = within(header).getByRole('button', { name: 'Create agent' });
      expect(headerCreate).toHaveAttribute('form', form.id);
      expect(footerAction('Create agent')).toHaveAttribute('form', form.id);
      await userEvent.type(screen.getByLabelText('Name'), 'Draft researcher');
      await userEvent.click(screen.getByRole('radio', { name: 'Choose individual skills' }));
      const search = await screen.findByRole('combobox', { name: 'Search skills' });
      await userEvent.type(search, 'Read PDFs');
      await userEvent.keyboard('{Enter}');
      expect(api.create).not.toHaveBeenCalled();
      expect(search).toHaveFocus();
      expect(screen.getByText('1 selected')).toBeInTheDocument();
      await userEvent.clear(search);
      await userEvent.type(search, 'no matching skill');
      await userEvent.keyboard('{Enter}');
      expect(api.create).not.toHaveBeenCalled();
      if (submission === 'name-enter') {
        await userEvent.click(screen.getByLabelText('Name'));
        await userEvent.keyboard('{Enter}');
      } else {
        await userEvent.click(
          submission === 'header' ? headerCreate : footerAction('Create agent'),
        );
      }
      await waitFor(() => expect(api.create).toHaveBeenCalledOnce());
      expect(vi.mocked(api.create).mock.calls[0]?.[0]).toMatchObject({
        name: 'Draft researcher',
        skillNames: ['pdf'],
      });
      expect(replace).toHaveBeenCalledWith('/chat/agents/0190a000-0000-7000-8000-0000000000a1');
      await waitFor(() => expect(hasUnsavedChanges()).toBe(false));
      expect(screen.queryByRole('alertdialog')).toBeNull();
    },
  );
  it.each([null, [], ['pdf', 'not-in-current-catalog']])(
    'retains saved skill selection semantics on unrelated edits: %j',
    async (skillNames) => {
      const api = fakeApi({ get: vi.fn(async () => managedAgent({ skillNames })) });
      render(<AgentEditorPage agentId="0190a000-0000-7000-8000-0000000000a1" api={api} />);
      await screen.findByRole('heading', { name: 'Release notes writer' });
      await userEvent.type(screen.getByLabelText('Description'), ' updated');
      await userEvent.click(footerAction('Save draft'));
      await waitFor(() => expect(api.update).toHaveBeenCalled());
      expect(vi.mocked(api.update).mock.calls[0]?.[1].skillNames).toEqual(skillNames);
      expect(screen.queryByRole('alertdialog')).toBeNull();
    },
  );

  it('offers a clean Cancel at the end of the form without creating anything', async () => {
    const api = fakeApi();
    render(<AgentEditorPage agentId={null} api={api} />);
    const footer = screen.getByLabelText('Agent actions');
    expect(within(footer).getByRole('button', { name: 'Create agent' })).toBeEnabled();
    await userEvent.click(within(footer).getByRole('button', { name: 'Cancel' }));
    expect(push).toHaveBeenCalledWith('/chat/agents');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(api.create).not.toHaveBeenCalled();
    expect(api.update).not.toHaveBeenCalled();
  });

  it('preserves unsaved fields and skill choices when Cancel is declined, then discards only on confirmation', async () => {
    const api = fakeApi();
    render(<AgentEditorPage agentId={null} api={api} />);
    await userEvent.type(screen.getByLabelText('Name'), 'Draft researcher');
    await userEvent.click(screen.getByRole('radio', { name: 'Choose individual skills' }));
    await userEvent.type(
      await screen.findByRole('combobox', { name: 'Search skills' }),
      'Read PDFs',
    );
    await userEvent.keyboard('{Enter}');
    const cancel = within(screen.getByLabelText('Agent actions')).getByRole('button', {
      name: 'Cancel',
    });
    await userEvent.click(cancel);
    let dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Your changes to this agent have not been saved.');
    expect(push).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Draft researcher');
    expect(screen.getByRole('option', { name: 'PDF documents' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    await userEvent.click(cancel);
    dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Discard' }));
    expect(push).toHaveBeenCalledWith('/chat/agents');
    expect(api.create).not.toHaveBeenCalled();
    expect(api.update).not.toHaveBeenCalled();
  });

  it('guards the Agents back-link while the draft is unsaved', async () => {
    render(<AgentEditorPage agentId={null} api={fakeApi()} />);
    await userEvent.type(screen.getByLabelText('Name'), 'Draft researcher');
    await userEvent.click(screen.getByRole('link', { name: /^Agents$/ }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Draft researcher');
    expect(push).not.toHaveBeenCalled();
  });

  it('retains the draft after a failed create and prevents edits or Cancel during the pending save', async () => {
    let rejectSave!: (reason: Error) => void;
    const api = fakeApi({
      create: vi.fn(
        () =>
          new Promise<ManagedCloudAgent>((_, reject) => {
            rejectSave = reject;
          }),
      ),
    });
    render(<AgentEditorPage agentId={null} api={api} />);
    await userEvent.type(screen.getByLabelText('Name'), 'Draft researcher');
    await userEvent.click(screen.getByRole('radio', { name: 'Choose individual skills' }));
    await userEvent.type(
      await screen.findByRole('combobox', { name: 'Search skills' }),
      'Read PDFs',
    );
    await userEvent.keyboard('{Enter}');
    const footer = screen.getByLabelText('Agent actions');
    await userEvent.click(within(footer).getByRole('button', { name: 'Create agent' }));
    expect(screen.getByLabelText('Name')).toBeDisabled();
    expect(within(footer).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(within(footer).getByRole('button', { name: 'Create agent' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    await act(async () => rejectSave(new Error('This draft could not be saved. Try again.')));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Name')).toBeEnabled();
    expect(screen.getByLabelText('Name')).toHaveValue('Draft researcher');
    expect(screen.getByRole('option', { name: 'PDF documents' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(vi.mocked(api.create).mock.calls[0]?.[0].skillNames).toEqual(['pdf']);
    expect(within(footer).getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('refuses to create an agent without a name, then creates it and opens its page', async () => {
    const api = fakeApi();
    render(<AgentEditorPage agentId={null} api={api} />);
    await userEvent.click(footerAction('Create agent'));
    expect(screen.getByRole('alert')).toHaveTextContent('Give the agent a name.');
    expect(screen.getByLabelText('Name')).toHaveFocus();
    expect(api.create).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('Name'), 'Researcher');
    await userEvent.click(screen.getByRole('switch', { name: 'Code execution' }));
    await userEvent.click(footerAction('Create agent'));
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
    await userEvent.click(within(access).getByRole('radio', { name: 'Choose individual skills' }));
    await userEvent.type(
      await within(access).findByRole('combobox', { name: 'Search skills' }),
      'Read PDFs',
    );
    await userEvent.keyboard('{Enter}');
    expect(api.update).not.toHaveBeenCalled();
    await userEvent.click(footerAction('Save draft'));
    await waitFor(() => expect(api.update).toHaveBeenCalled());
    expect(vi.mocked(api.update).mock.calls[0]?.[1]).toMatchObject({ skillNames: ['pdf'] });
  });

  it('saves a monthly credit cap for everyone using the agent', async () => {
    const api = fakeApi();
    render(<AgentEditorPage agentId="0190a000-0000-7000-8000-0000000000a1" api={api} />);
    await screen.findByRole('heading', { name: 'Release notes writer' });
    await userEvent.type(screen.getByLabelText('Credits a month, across everyone'), '250');
    await userEvent.click(footerAction('Save draft'));
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

  it('saves the sites the agent may read and never reads', async () => {
    const api = fakeApi();
    render(<AgentEditorPage agentId="0190a000-0000-7000-8000-0000000000a1" api={api} />);
    await screen.findByRole('heading', { name: 'Release notes writer' });
    const site = screen.getByRole('textbox', { name: 'Website' });

    await userEvent.type(site, 'not a site');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a website address');
    expect(screen.getByRole('button', { name: 'Allow' })).toBeDisabled();

    await userEvent.clear(site);
    await userEvent.type(site, 'https://www.docs.example/guide');
    await userEvent.click(screen.getByRole('button', { name: 'Allow' }));
    await userEvent.type(site, 'ads.example');
    await userEvent.click(screen.getByRole('button', { name: 'Block' }));
    expect(
      within(screen.getByRole('list', { name: 'Only reads' })).getByText('docs.example'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Never reads' })).getByText('ads.example'),
    ).toBeInTheDocument();

    await userEvent.click(footerAction('Save draft'));
    await waitFor(() => expect(api.update).toHaveBeenCalled());
    expect(vi.mocked(api.update).mock.calls[0]?.[1]).toMatchObject({
      allowedWebDomains: ['docs.example'],
      blockedWebDomains: ['ads.example'],
    });
  });

  it('saves a reasoning effort for the agent from all five levels while the chat picks the model', async () => {
    const api = fakeApi();
    render(<AgentEditorPage agentId="0190a000-0000-7000-8000-0000000000a1" api={api} />);
    await screen.findByRole('heading', { name: 'Release notes writer' });
    const effort = screen.getByRole('combobox', { name: 'Reasoning effort' });
    expect(
      within(effort)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'Whatever the chat uses',
      EFFORT_LABEL.low,
      EFFORT_LABEL.medium,
      EFFORT_LABEL.high,
      EFFORT_LABEL.xhigh,
      EFFORT_LABEL.max,
    ]);
    await userEvent.selectOptions(effort, 'max');
    await userEvent.click(footerAction('Save draft'));
    await waitFor(() => expect(api.update).toHaveBeenCalled());
    expect(vi.mocked(api.update).mock.calls[0]?.[1]).toMatchObject({ effort: 'max' });
  });

  it('offers only the levels a pinned model takes and hides effort for a model without any', async () => {
    const options = getScheduleModelOptions('pro').filter((option) => !option.disabled);
    const narrowed = options.find((option) => {
      const efforts = getModelEffortOptions(option.value);
      return efforts.includes('high') && !efforts.includes('xhigh') && !efforts.includes('max');
    });
    const plain = options.find(
      (option) =>
        getModelEffortOptions(option.value).length === 0 && !isAutoModeModelId(option.value),
    );
    expect(narrowed).toBeDefined();
    expect(plain).toBeDefined();
    const api = fakeApi();
    render(<AgentEditorPage agentId="0190a000-0000-7000-8000-0000000000a1" api={api} />);
    await screen.findByRole('heading', { name: 'Release notes writer' });
    const model = screen.getByRole('combobox', { name: 'Preferred model' });
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Reasoning effort' }),
      'max',
    );
    await userEvent.selectOptions(model, narrowed!.value);
    const effort = screen.getByRole('combobox', { name: 'Reasoning effort' });
    expect(within(effort).queryByRole('option', { name: EFFORT_LABEL.max })).toBeNull();
    expect(effort).toHaveValue('high');
    await userEvent.selectOptions(model, plain!.value);
    expect(screen.queryByRole('combobox', { name: 'Reasoning effort' })).toBeNull();
    await userEvent.click(footerAction('Save draft'));
    await waitFor(() => expect(api.update).toHaveBeenCalled());
    expect(vi.mocked(api.update).mock.calls[0]?.[1]).toMatchObject({
      model: plain!.value,
      effort: null,
    });
  });

  it('hides the website rules while web search is off', async () => {
    render(<AgentEditorPage agentId="0190a000-0000-7000-8000-0000000000a1" api={fakeApi()} />);
    await screen.findByRole('heading', { name: 'Release notes writer' });
    expect(screen.getByRole('textbox', { name: 'Website' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch', { name: 'Web search' }));
    expect(screen.queryByRole('textbox', { name: 'Website' })).toBeNull();
  });
});
