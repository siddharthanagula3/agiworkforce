import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  DesktopRuntimeError,
  type HostBridge,
  type PermissionDecision,
  type ShellPolicy,
} from '@agiworkforce/local-runtime-contract';
import { hostBridgeStub } from '@/test/host-bridge-stub';

const listWorkspaceRoots = vi.fn();
const pickWorkspaceRoot = vi.fn();
const revealWorkspaceRoot = vi.fn();
const revokeWorkspaceRoot = vi.fn();
const readLocalCommandPolicy = vi.fn();
const writeLocalCommandPolicy = vi.fn();
const readLocalModelSettings = vi.fn();
const writeLocalModelSettings = vi.fn();
const readLocalModelSnapshot = vi.fn();
const listLocalModels = vi.fn();
const readDeveloperRuntimeStatus = vi.fn();
const localWorktreeKeep = vi.fn();
const readDesktopPermissions = vi.fn();
function reviewOf(decisions: unknown[]) {
  return {
    decisions: decisions.map((decision) => ({
      description: 'Reviewed answer',
      ...(decision as object),
    })),
    system: {},
  };
}

const revokePermission = vi.fn();
let workspaceChanged: (() => void) | null = null;
const onWorkspaceChanged = vi.fn((listener: () => void) => {
  workspaceChanged = listener;
  return () => {
    workspaceChanged = null;
  };
});

vi.mock('../lib/runtime-client', () => ({
  listWorkspaceRoots,
  pickWorkspaceRoot,
  revealWorkspaceRoot,
  revokeWorkspaceRoot,
  readLocalCommandPolicy,
  writeLocalCommandPolicy,
  readLocalModelSettings,
  writeLocalModelSettings,
  readLocalModelSnapshot,
  listLocalModels,
  readDeveloperRuntimeStatus,
  readDesktopPermissions,
  revokePermission,
  onWorkspaceChanged,
}));
vi.mock('@/features/code/services/local-review-client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  localWorktreeKeep,
}));

const { LocalAccessSection } = await import('../components/LocalAccessSection');

const root = {
  id: 'root-1',
  path: '/Users/me/project',
  name: 'project',
  grantedAtMs: 0,
  lastOpenedAtMs: 0,
};

const runsAgentInRoot: PermissionDecision = {
  capability: 'shell.execute',
  scope: { kind: 'workspace', target: root.path },
  state: 'granted',
  duration: 'always',
  decidedAtMs: 1,
};
const screenRefused: PermissionDecision = {
  capability: 'computer.use',
  scope: { kind: 'global' },
  state: 'denied',
  duration: 'session',
  decidedAtMs: 2,
};

function installHost() {
  window.agiHost = {
    ...hostBridgeStub(),
    platform: 'electron-darwin',
    appVersion: '1.2.0',
    invokeRuntime: async () => ({
      ok: false as const,
      error: { code: 'unsupported-platform' as const, message: 'not used here' },
    }),
    onDeepLink: () => () => undefined,
    onVoiceHotkey: () => () => undefined,
    onRuntimeEvent: () => () => undefined,
    openExternal: async () => undefined,
    notify: async () => undefined,
    checkForUpdate: async () => ({
      available: false,
      currentVersion: '1.2.0',
      version: '1.2.0',
      downloadUrl: '',
    }),
    openUpdateInstaller: async () => undefined,
  } satisfies HostBridge;
}

beforeEach(() => {
  vi.clearAllMocks();
  listWorkspaceRoots.mockResolvedValue([root]);
  readLocalCommandPolicy.mockResolvedValue({ allow: ['git'], deny: ['rm'] });
  writeLocalCommandPolicy.mockImplementation(async (policy: ShellPolicy) => policy);
  readLocalModelSettings.mockResolvedValue({
    baseUrls: { ollama: 'http://localhost:11434', lmstudio: 'http://localhost:1234/v1' },
  });
  writeLocalModelSettings.mockImplementation(async (settings: unknown) => settings);
  readLocalModelSnapshot.mockResolvedValue({ granted: false, servers: [] });
  listLocalModels.mockResolvedValue([]);
  readDeveloperRuntimeStatus.mockResolvedValue({ capabilities: [] });
  localWorktreeKeep.mockResolvedValue({ keep: 5, maxKeep: 20 });
  readDesktopPermissions.mockResolvedValue(reviewOf([runsAgentInRoot]));
  revokePermission.mockResolvedValue(true);
  workspaceChanged = null;
  installHost();
});

describe('LocalAccessSection', () => {
  it('renders nothing in a browser', () => {
    delete window.agiHost;
    const { container } = render(<LocalAccessSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers no local models on the cloud-only shell, but keeps folders and commands', async () => {
    render(<LocalAccessSection />);
    expect(await screen.findByText('project')).toBeInTheDocument();
    expect(screen.getByText('git')).toBeInTheDocument();
    expect(screen.queryByText('Local models')).not.toBeInTheDocument();
    expect(screen.queryByText('Allow local models')).not.toBeInTheDocument();
  });

  it('offers local models on the shell that has a local mode', async () => {
    window.agiHost = { ...window.agiHost!, shell: 'tauri' };
    render(<LocalAccessSection />);
    expect(await screen.findByText('Local models')).toBeInTheDocument();
    expect(screen.getByText('project')).toBeInTheDocument();
  });

  it('offers the worktree count only on a shell that makes worktrees', async () => {
    const { unmount } = render(<LocalAccessSection />);
    expect(await screen.findByText('project')).toBeInTheDocument();
    expect(screen.queryByText('Worktrees')).not.toBeInTheDocument();
    expect(localWorktreeKeep).not.toHaveBeenCalled();
    unmount();

    readDeveloperRuntimeStatus.mockResolvedValue({ capabilities: ['worktrees'] });
    render(<LocalAccessSection />);
    expect(await screen.findByText('Worktrees')).toBeInTheDocument();
    expect(localWorktreeKeep).toHaveBeenCalledWith('root-1');
  });

  // The shell answers null rather than start a CLI just to read the count, and
  // a refused read must say why rather than drop the row.
  it('shows the worktree count disabled, saying why, when no CLI is running or the read fails', async () => {
    readDeveloperRuntimeStatus.mockResolvedValue({ capabilities: ['worktrees'] });
    localWorktreeKeep.mockResolvedValueOnce(null);
    const { unmount } = render(<LocalAccessSection />);
    expect(await screen.findByText(/Start a coding session to change this/)).toBeInTheDocument();
    expect(screen.getByLabelText('Keep the newest')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    unmount();

    localWorktreeKeep.mockRejectedValueOnce(new Error('Permission was not granted.'));
    render(<LocalAccessSection />);
    expect(await screen.findByText('Worktrees')).toBeInTheDocument();
    expect(screen.getByLabelText('Keep the newest')).toBeDisabled();
  });

  it('reads no local model settings on the cloud-only shell', async () => {
    render(<LocalAccessSection />);
    await screen.findByText('project');
    expect(readLocalModelSettings).not.toHaveBeenCalled();
    expect(readLocalModelSnapshot).not.toHaveBeenCalled();
  });

  it('reads the worktree count from a folder the agent may already run in, never one that would prompt', async () => {
    readDeveloperRuntimeStatus.mockResolvedValue({ capabilities: ['worktrees'] });
    const other = { ...root, id: 'root-0', path: '/Users/me/notes', name: 'notes' };
    listWorkspaceRoots.mockResolvedValue([other, root]);
    const { unmount } = render(<LocalAccessSection />);
    expect(await screen.findByText('Worktrees')).toBeInTheDocument();
    expect(localWorktreeKeep).toHaveBeenCalledWith('root-1');
    unmount();

    localWorktreeKeep.mockClear();
    readDesktopPermissions.mockResolvedValue(reviewOf([screenRefused]));
    render(<LocalAccessSection />);
    expect(
      await screen.findByText('Refused until you quit AGI Desktop', { exact: false }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Worktrees')).not.toBeInTheDocument();
    expect(localWorktreeKeep).not.toHaveBeenCalled();
  });

  it('lists each standing permission with what it covers and how long it lasts', async () => {
    readDesktopPermissions.mockResolvedValue(reviewOf([runsAgentInRoot, screenRefused]));
    render(<LocalAccessSection />);

    expect(await screen.findByText('Run commands and coding sessions')).toBeInTheDocument();
    expect(screen.getByText('/Users/me/project · Always allowed')).toBeInTheDocument();
    expect(
      screen.getByText('Read the screen and control the mouse and keyboard'),
    ).toBeInTheDocument();
    expect(screen.getByText('This Mac · Refused until you quit AGI Desktop')).toBeInTheDocument();
  });

  it('withdraws one permission and rereads the list', async () => {
    const user = userEvent.setup();
    readDesktopPermissions
      .mockResolvedValueOnce(reviewOf([runsAgentInRoot]))
      .mockResolvedValue(reviewOf([]));
    render(<LocalAccessSection />);

    await user.click(
      await screen.findByRole('button', {
        name: 'Withdraw: Run commands and coding sessions, /Users/me/project',
      }),
    );

    expect(revokePermission).toHaveBeenCalledWith('shell.execute', {
      kind: 'workspace',
      target: '/Users/me/project',
    });
    expect(await screen.findByText(/No standing answers/)).toBeInTheDocument();
  });

  it('says a permission was not withdrawn when the shell refuses', async () => {
    const user = userEvent.setup();
    revokePermission.mockRejectedValue(new Error('gone'));
    render(<LocalAccessSection />);

    await user.click(await screen.findByRole('button', { name: /^Withdraw/ }));

    expect(await screen.findByText('That permission was not withdrawn.')).toBeInTheDocument();
    expect(screen.getByText('Run commands and coding sessions')).toBeInTheDocument();
  });

  // The shell asks before withdrawing a grant that work in flight depends on.
  // Cancel there keeps the grant, which is an answer and not a failure.
  it('treats a withdrawal the user cancelled in the shell as kept, not as a failure', async () => {
    const user = userEvent.setup();
    revokePermission.mockRejectedValue(
      new DesktopRuntimeError({ code: 'cancelled', message: 'The permission was kept.' }),
    );
    render(<LocalAccessSection />);

    await user.click(await screen.findByRole('button', { name: /^Withdraw/ }));

    await waitFor(() => expect(revokePermission).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('That permission was not withdrawn.')).not.toBeInTheDocument();
    expect(screen.getByText('Run commands and coding sessions')).toBeInTheDocument();
  });

  it('keeps the folder and shows no failure when removing it is cancelled in the shell', async () => {
    const user = userEvent.setup();
    revokeWorkspaceRoot.mockRejectedValue(
      new DesktopRuntimeError({ code: 'cancelled', message: 'The folder was kept.' }),
    );
    render(<LocalAccessSection />);

    await user.click(await screen.findByRole('button', { name: 'Remove' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Remove access',
      }),
    );

    await waitFor(() => expect(revokeWorkspaceRoot).toHaveBeenCalledWith('root-1'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('project')).toBeInTheDocument();
  });

  it('says so when a folder could not be shown in Finder', async () => {
    const user = userEvent.setup();
    revealWorkspaceRoot.mockRejectedValue(
      new DesktopRuntimeError({ code: 'not-found', message: 'That path does not exist.' }),
    );
    render(<LocalAccessSection />);

    await user.click(await screen.findByRole('button', { name: 'Reveal' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That folder could not be shown in Finder. That path does not exist.',
    );
  });

  it('puts a program name back when adding it was cancelled or failed', async () => {
    const user = userEvent.setup();
    writeLocalCommandPolicy.mockRejectedValue(
      new DesktopRuntimeError({
        code: 'cancelled',
        message: 'The allowed programs were not changed.',
      }),
    );
    render(<LocalAccessSection />);
    await screen.findByText('git');

    await user.type(screen.getByLabelText(/Program name/), 'pnpm');
    await user.click(screen.getByRole('button', { name: 'Allow' }));

    await waitFor(() => expect(writeLocalCommandPolicy).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByLabelText(/Program name/)).toHaveValue('pnpm'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('leaves the permissions list out on a shell that cannot list them', async () => {
    readDesktopPermissions.mockRejectedValue(
      new DesktopRuntimeError({ code: 'unknown-command', message: 'no such command' }),
    );
    render(<LocalAccessSection />);

    expect(await screen.findByText('project')).toBeInTheDocument();
    await waitFor(() => expect(readDesktopPermissions).toHaveBeenCalled());
    expect(screen.queryByText('Permissions')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('rereads the folders when one is approved by a drop on the window', async () => {
    render(<LocalAccessSection />);
    expect(await screen.findByText('project')).toBeInTheDocument();

    listWorkspaceRoots.mockResolvedValue([
      root,
      { ...root, id: 'root-2', path: '/Users/me/dropped', name: 'dropped' },
    ]);
    workspaceChanged?.();

    expect(await screen.findByText('dropped')).toBeInTheDocument();
  });

  it('lists the approved folders and the command policy', async () => {
    render(<LocalAccessSection />);
    expect(await screen.findByText('project')).toBeInTheDocument();
    expect(await screen.findByText('git')).toBeInTheDocument();
    expect(screen.getByText('rm')).toBeInTheDocument();
  });

  it('says plainly that nothing runs without asking when the list is empty', async () => {
    readLocalCommandPolicy.mockResolvedValue({ allow: [], deny: [] });
    render(<LocalAccessSection />);
    expect(await screen.findByText('Nothing runs without asking.')).toBeInTheDocument();
    expect(screen.getByText('Nothing is blocked outright.')).toBeInTheDocument();
  });

  it('allows a program the user types', async () => {
    const user = userEvent.setup();
    render(<LocalAccessSection />);
    await screen.findByText('git');

    await user.type(screen.getByLabelText(/Program name/), 'pnpm');
    await user.click(screen.getByRole('button', { name: 'Allow' }));

    await waitFor(() =>
      expect(writeLocalCommandPolicy).toHaveBeenCalledWith({
        allow: ['git', 'pnpm'],
        deny: ['rm'],
      }),
    );
  });

  it('moves a program across when it is blocked after being allowed', async () => {
    const user = userEvent.setup();
    render(<LocalAccessSection />);
    await screen.findByText('git');

    await user.type(screen.getByLabelText(/Program name/), 'git');
    await user.click(screen.getByRole('button', { name: 'Block' }));

    await waitFor(() =>
      expect(writeLocalCommandPolicy).toHaveBeenCalledWith({ allow: [], deny: ['rm', 'git'] }),
    );
  });

  it('goes back to asking when an allowed program is removed', async () => {
    const user = userEvent.setup();
    render(<LocalAccessSection />);
    await screen.findByText('git');

    await user.click(screen.getByRole('button', { name: 'Ask before running git' }));

    await waitFor(() =>
      expect(writeLocalCommandPolicy).toHaveBeenCalledWith({ allow: [], deny: ['rm'] }),
    );
  });

  it('names the programs no list can ever reach', async () => {
    render(<LocalAccessSection />);
    expect(await screen.findByText(/sudo/)).toBeInTheDocument();
  });

  it('reports a policy that could not be read', async () => {
    readLocalCommandPolicy.mockRejectedValue(new Error('gone'));
    render(<LocalAccessSection />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
