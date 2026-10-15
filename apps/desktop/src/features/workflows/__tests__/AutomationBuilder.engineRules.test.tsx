import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTriggerStore } from '../../../stores/triggerStore';
import { AutomationBuilder } from '../AutomationBuilder';

const mockInvoke = vi.fn();

vi.mock('@/lib/tauri-mock', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/ui/Select', () => ({
  Select: ({
    value,
    disabled,
    onValueChange,
    children,
  }: {
    value: string;
    disabled?: boolean;
    onValueChange: (value: string) => void;
    children: ReactNode;
  }) => (
    <select
      aria-label="Trigger type"
      value={value}
      disabled={disabled}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value }: { value: string }) => <option value={value}>{value}</option>,
}));

const TOKEN = 'b'.repeat(64);
const BASE_URL = 'http://webhooks.test';
const HOOK_URL = `${BASE_URL}/hooks/1f2e3d4c5b6a7980`;

const ENGINE_INFO = {
  minStartIntervalSecs: 60,
  webhookBaseUrl: BASE_URL,
  webhookListening: true,
  webhookProblem: null,
  maxWebhookBodyBytes: 262144,
  idempotencyWindowSecs: 600,
};

const ACTION = { type: 'agent', prompt: 'Deploy', model: null, approvalRequired: false };

function stored(fields: Record<string, unknown>) {
  return {
    id: 'trigger-1',
    name: 'Deploy hook',
    enabled: true,
    action: ACTION,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    triggerCount: 4,
    lastTriggeredAt: null,
    coalescedCount: 0,
    problem: null,
    webhookUrl: null,
    ...fields,
  };
}

function webhook(fields: Record<string, unknown> = {}) {
  return stored({
    type: 'webhook',
    config: { type: 'webhook', path: '/hooks/1f2e3d4c5b6a7980', tokenHash: 'hash' },
    webhookUrl: HOOK_URL,
    ...fields,
  });
}

function watcher(fields: Record<string, unknown> = {}) {
  return stored({
    name: 'Inbox watcher',
    type: 'file_watcher',
    config: {
      type: 'fileWatcher',
      watchPath: '/Users/me/Inbox',
      glob: '**/*.pdf',
      debounceMs: 500,
      folderApproved: true,
    },
    ...fields,
  });
}

type Handler = (args: Record<string, unknown> | undefined) => unknown;

function serve(listed: unknown[], handlers: Record<string, Handler> = {}) {
  mockInvoke.mockImplementation((command: string, args?: Record<string, unknown>) => {
    const handler = handlers[command];
    if (handler) return Promise.resolve().then(() => handler(args));
    if (command === 'list_triggers') return Promise.resolve(listed);
    if (command === 'trigger_engine_info') return Promise.resolve(ENGINE_INFO);
    return Promise.resolve(null);
  });
}

function callsTo(command: string) {
  return mockInvoke.mock.calls.filter(([called]) => called === command);
}

async function openNewTrigger(type: string) {
  fireEvent.click(await screen.findByRole('button', { name: 'Create first trigger' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Trigger type'), { target: { value: type } });
  fireEvent.change(within(dialog).getByPlaceholderText('Daily standup summary'), {
    target: { value: 'New trigger' },
  });
  return dialog;
}

describe('AutomationBuilder engine rules', () => {
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
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('shows a webhook its full address, why it is not working, and the firings it did not start', async () => {
    serve([
      webhook({
        coalescedCount: 3,
        problem: 'Webhooks cannot receive requests: the app could not listen on its port.',
      }),
    ]);

    render(<AutomationBuilder />);

    expect(await screen.findByText(`POST ${HOOK_URL} · Token required`)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Webhooks cannot receive requests');
    expect(screen.getByText(/3 counted but not started/)).toBeInTheDocument();
  });

  it('shows where to send a new token and how, with the retry header', async () => {
    serve([webhook()], {
      regenerate_webhook_token: () =>
        webhook({
          config: {
            type: 'webhook',
            path: '/hooks/1f2e3d4c5b6a7980',
            tokenHash: 'new-hash',
            authToken: TOKEN,
          },
        }),
    });
    render(<AutomationBuilder />);

    fireEvent.click(await screen.findByRole('button', { name: 'Regenerate token' }));
    const confirmation = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Regenerate token' }));

    expect(await screen.findByDisplayValue(TOKEN)).toBeInTheDocument();
    expect(screen.getByDisplayValue(HOOK_URL)).toBeInTheDocument();
    const example = screen.getByTestId('webhook-example');
    expect(example).toHaveTextContent(`curl -X POST ${HOOK_URL}`);
    expect(example).toHaveTextContent(`Authorization: Bearer ${TOKEN}`);
    expect(screen.getByText(/up to 256 KB/)).toHaveTextContent(
      'a repeat of the same key within 10 minutes is answered without starting another run',
    );
    expect(screen.getByText(/answers only programs on this computer/)).toBeInTheDocument();
  });

  it('creates a webhook with no path of its own and says one is generated', async () => {
    serve([], {
      register_trigger: () =>
        webhook({
          config: {
            type: 'webhook',
            path: '/hooks/1f2e3d4c5b6a7980',
            tokenHash: 'hash',
            authToken: TOKEN,
          },
        }),
    });
    render(<AutomationBuilder />);

    const dialog = await openNewTrigger('webhook');
    expect(
      within(dialog).getByPlaceholderText('Leave blank to generate a unique path'),
    ).toHaveValue('');
    expect(within(dialog).getByText(/Each webhook needs its own path/)).toHaveTextContent(
      `${BASE_URL}/hooks/…`,
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create trigger' }));

    await waitFor(() => expect(callsTo('register_trigger')).toHaveLength(1));
    const [, sent] = callsTo('register_trigger')[0] ?? [];
    expect((sent as { trigger: { config: unknown } }).trigger.config).toEqual({
      type: 'webhook',
      path: '',
    });
    expect(await screen.findByDisplayValue(HOOK_URL)).toBeInTheDocument();
  });

  it('refuses a duplicate path with the reason the engine gave', async () => {
    serve([], {
      register_trigger: () =>
        Promise.reject(
          'Another trigger, "Deploy hook", already uses the webhook path /deploy. Each webhook needs its own path.',
        ),
    });
    render(<AutomationBuilder />);

    const dialog = await openNewTrigger('webhook');
    fireEvent.change(within(dialog).getByPlaceholderText('Leave blank to generate a unique path'), {
      target: { value: '/deploy' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create trigger' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('The trigger was not created');
    expect(alert).toHaveTextContent('already uses the webhook path /deploy');
  });

  it('states the catch-up rule and the time zone of a new schedule, and sends the zone', async () => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    serve([], { register_trigger: () => stored({ type: 'cron', config: { type: 'cron' } }) });
    render(<AutomationBuilder />);

    const dialog = await openNewTrigger('cron');
    expect(within(dialog).getByLabelText('Time zone')).toHaveValue(zone);
    expect(within(dialog).getByText(/This schedule is read in/)).toHaveTextContent(
      `This schedule is read in ${zone}.`,
    );
    expect(within(dialog).getByText(/runs once when the app is back/)).toHaveTextContent(
      'a notification says how many runs were missed. Turning the trigger on or changing its schedule never runs a time that has already passed.',
    );
    expect(within(dialog).getByText(/0 and 7 are Sunday/)).toBeInTheDocument();
    expect(within(dialog).getByText(/One run at a time/)).not.toHaveTextContent('60 seconds');

    fireEvent.change(within(dialog).getByLabelText('Time zone'), {
      target: { value: 'Europe/Berlin' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create trigger' }));

    await waitFor(() => expect(callsTo('register_trigger')).toHaveLength(1));
    const [, sent] = callsTo('register_trigger')[0] ?? [];
    expect((sent as { trigger: { config: unknown } }).trigger.config).toEqual({
      type: 'cron',
      expression: '0 9 * * *',
      timezone: 'Europe/Berlin',
    });
  });

  it('names the zone a stored schedule is read in, or says it follows this computer', async () => {
    serve([
      stored({
        type: 'cron',
        name: 'Digest',
        config: { type: 'cron', expression: '0 9 * * 1', timezone: 'UTC' },
      }),
      stored({
        id: 'trigger-2',
        type: 'cron',
        name: 'Report',
        config: { type: 'cron', expression: '0 9 * * 5' },
      }),
    ]);
    render(<AutomationBuilder />);

    expect(await screen.findByText('Schedule: 0 9 * * 1 (UTC)')).toBeInTheDocument();
    expect(screen.getByText("Schedule: 0 9 * * 5 (this computer's time zone)")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[1] as HTMLElement);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Time zone')).toHaveValue('');
    expect(within(dialog).getByText(/This schedule is read in/)).toHaveTextContent(
      "This schedule is read in this computer's time zone.",
    );
  });

  it('keeps what was typed in the edit form when the page re-renders', async () => {
    serve([webhook()]);
    const view = render(<AutomationBuilder />);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    const name = within(dialog).getByPlaceholderText('Daily standup summary');
    fireEvent.change(name, { target: { value: 'Deploy hook, renamed' } });

    view.rerender(<AutomationBuilder />);
    act(() => {
      useTriggerStore.setState({ error: 'The list could not be refreshed' });
    });

    expect(await screen.findByText('The list could not be refreshed')).toBeInTheDocument();
    expect(within(dialog).getByPlaceholderText('Daily standup summary')).toHaveValue(
      'Deploy hook, renamed',
    );
  });

  it('reads the firings again each time the log is opened', async () => {
    const firing = (id: string, success: boolean, runOutcome?: string) => ({
      id,
      triggerId: 'trigger-1',
      triggerName: 'Deploy hook',
      firedAt: '2026-10-11T09:10:00Z',
      success,
      error: null,
      eventData: {},
      missedStarts: 0,
      runOutcome,
    });
    let recorded = [firing('run-1', true, 'running')];
    serve([webhook()], { get_trigger_executions: () => recorded });
    render(<AutomationBuilder />);
    const log = await screen.findByRole('button', { name: 'Firings since the app started' });

    fireEvent.click(log);
    expect(await screen.findByText('The run is still going.')).toBeInTheDocument();
    expect(screen.getAllByText('Started')).toHaveLength(1);

    fireEvent.click(log);
    recorded = [firing('run-2', true, 'waiting'), firing('run-1', true, 'finished')];
    fireEvent.click(log);

    expect(await screen.findByText('The run finished.')).toBeInTheDocument();
    expect(
      screen.getByText('The run is paused, waiting for you in background agents.'),
    ).toBeInTheDocument();
    expect(callsTo('get_trigger_executions')).toHaveLength(2);
  });

  it('calls a notification firing what it is, and a firing with no known outcome only started', async () => {
    serve(
      [webhook({ action: { type: 'notification', prompt: 'Ping', approvalRequired: false } })],
      {
        get_trigger_executions: () => [
          {
            id: 'run-1',
            triggerId: 'trigger-1',
            firedAt: '2026-10-11T09:10:00Z',
            success: true,
            error: null,
            missedStarts: 0,
          },
        ],
      },
    );
    render(<AutomationBuilder />);

    fireEvent.click(await screen.findByRole('button', { name: 'Firings since the app started' }));

    expect(await screen.findByText('Notified')).toBeInTheDocument();
    expect(screen.queryByText(/The run/)).not.toBeInTheDocument();
  });

  it('keeps a trigger listed and says why when deleting it fails', async () => {
    const { toast } = await import('sonner');
    serve([webhook()], {
      unregister_trigger: () =>
        Promise.reject('The trigger was not deleted: the database is locked'),
    });
    render(<AutomationBuilder />);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    const confirmation = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to delete trigger: The trigger was not deleted: the database is locked',
      ),
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByText('Deploy hook')).toBeInTheDocument();
    expect(useTriggerStore.getState().triggers).toHaveLength(1);
  });

  it('says what approval and a live run do to later firings', async () => {
    serve([webhook({ runLive: true, coalescedCount: 2 })]);
    render(<AutomationBuilder />);

    expect(await screen.findByText(/going or waiting in background agents/)).toHaveTextContent(
      'Firings that arrive before it ends are counted, not started.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/A run starts paused/)).toHaveTextContent(
      'While one is waiting, later firings are counted on the trigger, not started.',
    );
  });

  it('takes a watched folder only from the native picker and explains the pattern', async () => {
    serve([], {
      pick_trigger_watch_folder: () => '/Users/me/Inbox',
      register_trigger: () => watcher(),
    });
    render(<AutomationBuilder />);

    const dialog = await openNewTrigger('file_watcher');
    const folder = within(dialog).getByLabelText('Watch folder');
    expect(folder).toHaveAttribute('readonly');
    expect(folder).toHaveValue('');
    expect(within(dialog).getByText(/matches files in the folder itself/)).toHaveTextContent(
      '**/*.pdf matches at every level',
    );
    expect(within(dialog).getByText(/One run at a time/)).toHaveTextContent(
      'Starts are at least 60 seconds apart',
    );

    fireEvent.click(within(dialog).getByRole('button', { name: 'Browse' }));
    await waitFor(() => expect(folder).toHaveValue('/Users/me/Inbox'));
    expect(callsTo('pick_trigger_watch_folder')).toHaveLength(1);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Create trigger' }));
    await waitFor(() => expect(callsTo('register_trigger')).toHaveLength(1));
    const [, sent] = callsTo('register_trigger')[0] ?? [];
    expect((sent as { trigger: { config: { watchPath: string } } }).trigger.config.watchPath).toBe(
      '/Users/me/Inbox',
    );
  });

  it('leaves a watcher off and shows the reason when it cannot start watching', async () => {
    const reason = 'This trigger is off until you choose its folder again with Browse.';
    let listed = watcher({ enabled: false });
    serve([], {
      list_triggers: () => [listed],
      toggle_trigger: () => {
        listed = watcher({ enabled: false, problem: reason });
        return Promise.reject(reason);
      },
    });
    render(<AutomationBuilder />);

    fireEvent.click(await screen.findByRole('switch'));

    expect(await screen.findByRole('status')).toHaveTextContent(reason);
    expect(screen.getByRole('switch')).not.toBeChecked();
    expect(callsTo('toggle_trigger')).toEqual([
      ['toggle_trigger', { triggerId: 'trigger-1', enabled: true }],
    ]);
  });
});
