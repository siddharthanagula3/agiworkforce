import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTriggerStore } from '../../../stores/triggerStore';
import { AutomationBuilder } from '../AutomationBuilder';

const mockInvoke = vi.fn();
const mockWriteText = vi.fn();

vi.mock('@/lib/tauri-mock', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const TOKEN = 'a'.repeat(64);

function webhookTrigger(config: Record<string, unknown>, enabled: boolean) {
  return {
    id: 'trigger-1',
    name: 'Deploy hook',
    type: 'webhook',
    enabled,
    config: { type: 'webhook', path: '/deploy', ...config },
    action: { type: 'agent', prompt: 'Deploy', approvalRequired: false },
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    triggerCount: 0,
    lastTriggeredAt: null,
  };
}

function serveTriggers(listed: Record<string, unknown>) {
  mockInvoke.mockImplementation((command: string) => {
    if (command === 'list_triggers') return Promise.resolve([listed]);
    if (command === 'regenerate_webhook_token') {
      return Promise.resolve(webhookTrigger({ authToken: TOKEN, tokenHash: 'new-hash' }, false));
    }
    if (command === 'register_trigger') {
      return Promise.resolve(webhookTrigger({ authToken: TOKEN, tokenHash: 'new-hash' }, true));
    }
    return Promise.resolve([]);
  });
}

function regenerateCalls() {
  return mockInvoke.mock.calls.filter(([command]) => command === 'regenerate_webhook_token');
}

describe('AutomationBuilder webhook tokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useTriggerStore.setState({
      triggers: [],
      executions: {},
      engineInfo: null,
      loading: false,
      error: null,
    });
    mockWriteText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: mockWriteText },
    });
  });

  it('holds a webhook with no token off and says why', async () => {
    serveTriggers(webhookTrigger({}, false));

    render(<AutomationBuilder />);

    expect(await screen.findByText('Needs a token')).toBeInTheDocument();
    expect(screen.getByText('Off until it has a token')).toBeInTheDocument();
    expect(screen.getByText(/it has no token/)).toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeDisabled();
  });

  it('generates a token, shows it once with a copy button, and keeps it out of the store', async () => {
    serveTriggers(webhookTrigger({}, false));
    render(<AutomationBuilder />);

    fireEvent.click(await screen.findByRole('button', { name: 'Generate token' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Copy the webhook token now')).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue(TOKEN)).toBeInTheDocument();
    expect(regenerateCalls()).toEqual([['regenerate_webhook_token', { triggerId: 'trigger-1' }]]);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy token' }));
    await waitFor(() => expect(mockWriteText).toHaveBeenCalledWith(TOKEN));
    expect(await within(dialog).findByRole('button', { name: 'Copied' })).toBeInTheDocument();

    expect(JSON.stringify(useTriggerStore.getState().triggers)).not.toContain(TOKEN);
    expect(localStorage.getItem('trigger-store') ?? '').not.toContain(TOKEN);
    expect(screen.queryByText('Needs a token')).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByDisplayValue(TOKEN)).not.toBeInTheDocument());
  });

  it('asks before replacing a token that is in use', async () => {
    serveTriggers(webhookTrigger({ tokenHash: 'old-hash' }, true));
    render(<AutomationBuilder />);

    expect(await screen.findByText(/Token required/)).toBeInTheDocument();
    expect(screen.queryByText('Needs a token')).not.toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate token' }));

    const confirmation = await screen.findByRole('alertdialog');
    expect(within(confirmation).getByText(/stops working at once/)).toBeInTheDocument();
    expect(regenerateCalls()).toEqual([]);

    fireEvent.click(within(confirmation).getByRole('button', { name: 'Regenerate token' }));

    expect(await screen.findByDisplayValue(TOKEN)).toBeInTheDocument();
    expect(regenerateCalls()).toHaveLength(1);
  });

  it('shows each firing as the engine recorded it, with the run of missed starts', async () => {
    serveTriggers(webhookTrigger({ tokenHash: 'old-hash' }, true));
    mockInvoke.mockImplementation((command: string) => {
      if (command === 'list_triggers') {
        return Promise.resolve([webhookTrigger({ tokenHash: 'old-hash' }, true)]);
      }
      if (command === 'get_trigger_executions') {
        return Promise.resolve([
          {
            id: 'run-3',
            triggerId: 'trigger-1',
            triggerName: 'Deploy hook',
            firedAt: '2026-10-11T09:10:00Z',
            success: false,
            error: 'Maximum number of background agents (10) reached',
            eventData: {},
            missedStarts: 3,
          },
          {
            id: 'run-0',
            triggerId: 'trigger-1',
            triggerName: 'Deploy hook',
            firedAt: '2026-10-11T08:55:00Z',
            success: true,
            error: null,
            eventData: {},
            missedStarts: 0,
            runOutcome: 'finished',
          },
        ]);
      }
      return Promise.resolve([]);
    });
    render(<AutomationBuilder />);

    fireEvent.click(await screen.findByRole('button', { name: 'Firings since the app started' }));

    expect(await screen.findByText('Missed start 3 in a row')).toBeInTheDocument();
    expect(
      screen.getByText('Maximum number of background agents (10) reached'),
    ).toBeInTheDocument();
    expect(screen.getByText('Could not start')).toBeInTheDocument();
    expect(screen.getByText('Started')).toBeInTheDocument();
    expect(screen.getByText('The run finished.')).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    const [latest, earlier] = useTriggerStore.getState().executions['trigger-1'] ?? [];
    expect(latest?.firedAt).toBe(Date.parse('2026-10-11T09:10:00Z'));
    expect(latest?.started).toBe(false);
    expect(earlier?.missedStarts).toBe(0);
    expect(earlier?.outcome).toBe('finished');
  });

  function cronTrigger(prompt: string) {
    return {
      id: 'trigger-2',
      name: 'Morning digest',
      type: 'cron',
      enabled: true,
      config: { type: 'cron', expression: '0 9 * * *' },
      action: { type: 'agent', prompt, model: null, approvalRequired: false },
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
      triggerCount: 0,
      lastTriggeredAt: null,
    };
  }

  const PROMPT_FIELD = /Summarize all emails received/;

  it('saves an edited prompt through the engine and shows it after a reload', async () => {
    let stored = cronTrigger('Summarise my inbox');
    mockInvoke.mockImplementation((command: string, args?: Record<string, unknown>) => {
      if (command === 'list_triggers') return Promise.resolve([stored]);
      if (command === 'update_trigger') {
        const updates = args?.['updates'] as { action: { prompt: string } };
        stored = cronTrigger(updates.action.prompt);
        return Promise.resolve(stored);
      }
      return Promise.resolve([]);
    });
    const first = render(<AutomationBuilder />);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(await screen.findByPlaceholderText(PROMPT_FIELD), {
      target: { value: 'Write the weekly digest' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith('update_trigger', {
        triggerId: 'trigger-2',
        updates: {
          name: 'Morning digest',
          enabled: true,
          config: { type: 'cron', expression: '0 9 * * *' },
          action: {
            type: 'agent',
            prompt: 'Write the weekly digest',
            approvalRequired: false,
          },
        },
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    first.unmount();
    useTriggerStore.setState({ triggers: [] });
    render(<AutomationBuilder />);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(await screen.findByPlaceholderText(PROMPT_FIELD)).toHaveValue('Write the weekly digest');
  });

  it('keeps the edit in the form and says why when the save is refused', async () => {
    mockInvoke.mockImplementation((command: string) => {
      if (command === 'list_triggers') return Promise.resolve([cronTrigger('Summarise my inbox')]);
      if (command === 'update_trigger') {
        return Promise.reject(
          'The schedule would fire every 60s, minimum allowed interval is 300s',
        );
      }
      return Promise.resolve([]);
    });
    render(<AutomationBuilder />);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(await screen.findByPlaceholderText(PROMPT_FIELD), {
      target: { value: 'Write the weekly digest' },
    });
    fireEvent.change(screen.getByPlaceholderText('0 9 * * *'), { target: { value: '* * * * *' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Your changes were not saved');
    expect(alert).toHaveTextContent('minimum allowed interval is 300s');
    expect(screen.getByPlaceholderText(PROMPT_FIELD)).toHaveValue('Write the weekly digest');
    expect(screen.getByPlaceholderText('0 9 * * *')).toHaveValue('* * * * *');
    expect(useTriggerStore.getState().triggers[0]?.action.prompt).toBe('Summarise my inbox');
    expect(mockInvoke).toHaveBeenCalledWith(
      'update_trigger',
      expect.objectContaining({
        updates: expect.objectContaining({ config: { type: 'cron', expression: '* * * * *' } }),
      }),
    );
  });

  it('returns the token of a new webhook to the caller and stores the trigger without it', async () => {
    serveTriggers(webhookTrigger({}, false));

    const { token } = await useTriggerStore.getState().createTrigger({
      name: 'Deploy hook',
      type: 'webhook',
      enabled: true,
      config: { type: 'webhook', path: '/deploy' },
      action: { type: 'agent', prompt: 'Deploy', approvalRequired: false },
    });

    expect(token).toBe(TOKEN);
    const [stored] = useTriggerStore.getState().triggers;
    expect(stored?.config).toEqual({ type: 'webhook', path: '/deploy', tokenHash: 'new-hash' });
    expect(localStorage.getItem('trigger-store') ?? '').not.toContain(TOKEN);
  });
});
