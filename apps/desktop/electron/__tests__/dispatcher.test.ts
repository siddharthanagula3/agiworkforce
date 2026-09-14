import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PermissionScope,
  PermissionState,
  WorkspaceRoot,
} from '@agiworkforce/local-runtime-contract';

const root: WorkspaceRoot = {
  id: 'root-1',
  path: '/approved/project',
  name: 'project',
  grantedAtMs: 0,
  lastOpenedAtMs: 0,
};

const getPermissionState = vi.fn<() => PermissionState>();
const requestPermission = vi.fn<() => Promise<PermissionState>>();
const consumeSingleUse = vi.fn();
const runShellCommand = vi.fn();
const cancelShellRun = vi.fn();
const readShellPolicy = vi.fn();
const writeShellPolicy = vi.fn();
const openWithDefaultApplication = vi.fn();
const revealInFileManager = vi.fn();
const readClipboard = vi.fn();
const listLocalServers = vi.fn();
const listLocalModels = vi.fn();
const runLocalChat = vi.fn();
const cancelLocalChat = vi.fn();
const readLocalModelSettings = vi.fn();
const writeLocalModelSettings = vi.fn();
const send = vi.fn();

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  dialog: { showOpenDialog: vi.fn(), showMessageBox: vi.fn() },
  shell: { openPath: vi.fn() },
}));

vi.mock('../runtime/permissionManager', () => ({
  getPermissionState,
  requestPermission,
  consumeSingleUse,
}));

vi.mock('../runtime/workspaceStore', () => ({
  getRoot: (id: string) => (id === root.id ? root : undefined),
  listRoots: () => [root],
  grantRoot: vi.fn(),
  revokeRoot: vi.fn(),
  touchRoot: vi.fn(),
  setRootGit: vi.fn(),
  findContainingRoot: vi.fn(),
  WorkspaceGrantRefused: class extends Error {},
}));

vi.mock('../runtime/shellService', () => ({ runShellCommand, cancelShellRun }));
vi.mock('../runtime/shellPolicyStore', () => ({ readShellPolicy, writeShellPolicy }));
vi.mock('../runtime/appsService', () => ({ openWithDefaultApplication, revealInFileManager }));
vi.mock('../runtime/clipboardService', () => ({ readClipboard }));
vi.mock('../runtime/filesystemService', () => ({
  createDirectory: vi.fn(),
  globFiles: vi.fn(),
  grepFiles: vi.fn(),
  listDirectory: vi.fn(),
  readBinaryFile: vi.fn(),
  readTextFile: vi.fn(),
  statPath: vi.fn(),
  writeTextFile: vi.fn(),
}));
vi.mock('../runtime/gitService', () => ({ readWorkspaceGit: vi.fn() }));
vi.mock('../runtime/localInferenceService', () => ({
  listLocalServers,
  listLocalModels,
  runLocalChat,
  cancelLocalChat,
}));
vi.mock('../runtime/localModelSettingsStore', () => ({
  LOCAL_MODEL_DEFAULT_BASE_URLS: {
    ollama: 'http://localhost:11434',
    lmstudio: 'http://localhost:1234/v1',
  },
  readLocalModelSettings,
  readLocalBaseUrl: vi.fn(),
  writeLocalModelSettings,
}));

const { dispatch } = await import('../runtime/dispatcher');

const window = {
  isDestroyed: () => false,
  webContents: { send },
} as unknown as Parameters<typeof dispatch>[0];

beforeEach(() => {
  vi.clearAllMocks();
  getPermissionState.mockReturnValue('granted');
  readShellPolicy.mockReturnValue({ allow: ['git'], deny: [] });
  writeShellPolicy.mockImplementation((policy: unknown) => policy);
  runShellCommand.mockResolvedValue({ runId: 'run-1', exitCode: 0 });
  listLocalServers.mockResolvedValue([
    {
      id: 'ollama',
      label: 'Ollama',
      baseUrl: 'http://localhost:11434',
      reachable: true,
      modelCount: 1,
    },
  ]);
  listLocalModels.mockResolvedValue([
    {
      id: 'local:ollama/tiny-chat:1b',
      serverId: 'ollama',
      serverLabel: 'Ollama',
      name: 'tiny-chat:1b',
    },
  ]);
  runLocalChat.mockResolvedValue({
    runId: 'run-1',
    modelId: 'local:ollama/tiny-chat:1b',
    serverId: 'ollama',
    text: 'hello',
    thinking: '',
    stopReason: 'end_turn',
    durationMs: 4,
  });
  readLocalModelSettings.mockReturnValue({
    baseUrls: { ollama: 'http://localhost:11434', lmstudio: 'http://localhost:1234/v1' },
  });
  writeLocalModelSettings.mockImplementation((settings: unknown) => settings);
});

function scopeOf(call: unknown[]): PermissionScope {
  return call[2] as PermissionScope;
}

describe('dispatch, local command gating', () => {
  it('requires shell.execute scoped to the workspace', async () => {
    getPermissionState.mockReturnValue('prompt');
    requestPermission.mockResolvedValue('granted');

    const response = await dispatch(window, 'shell_run', {
      rootId: root.id,
      runId: 'run-1',
      command: 'git status',
    });

    expect(response.ok).toBe(true);
    expect(requestPermission).toHaveBeenCalledTimes(1);
    const call = requestPermission.mock.calls[0] as unknown as unknown[];
    expect(call[1]).toBe('shell.execute');
    expect(scopeOf(call)).toEqual({ kind: 'workspace', target: root.path });
  });

  it('refuses to run when the capability is denied, and never reaches the service', async () => {
    getPermissionState.mockReturnValue('denied');

    const response = await dispatch(window, 'shell_run', {
      rootId: root.id,
      runId: 'run-1',
      command: 'git status',
    });

    expect(response).toMatchObject({
      ok: false,
      error: { code: 'permission-denied', capability: 'shell.execute' },
    });
    expect(runShellCommand).not.toHaveBeenCalled();
  });

  it('refuses a command for a workspace that is no longer approved', async () => {
    const response = await dispatch(window, 'shell_run', {
      rootId: 'gone',
      runId: 'run-1',
      command: 'git status',
    });
    expect(response).toMatchObject({ ok: false, error: { code: 'not-found' } });
    expect(runShellCommand).not.toHaveBeenCalled();
  });

  it('streams output to the renderer as a runtime event', async () => {
    runShellCommand.mockImplementation(async (input: { emit: (chunk: unknown) => void }) => {
      input.emit({ runId: 'run-1', stream: 'stdout', chunk: 'hello' });
      return { runId: 'run-1', exitCode: 0 };
    });

    await dispatch(window, 'shell_run', {
      rootId: root.id,
      runId: 'run-1',
      command: 'git status',
    });

    expect(send).toHaveBeenCalledWith('agi:desktop-runtime-event', {
      kind: 'shell-output',
      runId: 'run-1',
      stream: 'stdout',
      chunk: 'hello',
    });
  });

  it('rejects a command argument that is not a string', async () => {
    const response = await dispatch(window, 'shell_run', {
      rootId: root.id,
      runId: 'run-1',
      command: 42,
    });
    expect(response).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
  });

  it('rejects a timeout that is not a number', async () => {
    const response = await dispatch(window, 'shell_run', {
      rootId: root.id,
      runId: 'run-1',
      command: 'git status',
      timeoutMs: 'soon',
    });
    expect(response).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
  });
});

describe('dispatch, policy and clipboard', () => {
  it('reads the command policy without a workspace', async () => {
    const response = await dispatch(window, 'shell_policy_read', {});
    expect(response).toEqual({ ok: true, value: { allow: ['git'], deny: [] } });
  });

  it('refuses a policy that is not made of program names', async () => {
    const response = await dispatch(window, 'shell_policy_write', {
      policy: { allow: [1], deny: [] },
    });
    expect(response).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
    expect(writeShellPolicy).not.toHaveBeenCalled();
  });

  it('writes a valid policy', async () => {
    const policy = { allow: ['pnpm'], deny: ['rm'] };
    const response = await dispatch(window, 'shell_policy_write', { policy });
    expect(response).toEqual({ ok: true, value: policy });
  });

  it('asks for the clipboard with a global scope, not a workspace one', async () => {
    getPermissionState.mockReturnValue('prompt');
    requestPermission.mockResolvedValue('granted');
    readClipboard.mockReturnValue({ text: 'copied', textTruncated: false });

    const response = await dispatch(window, 'clipboard_read', {});

    expect(response).toEqual({ ok: true, value: { text: 'copied', textTruncated: false } });
    const call = requestPermission.mock.calls[0] as unknown as unknown[];
    expect(call[1]).toBe('clipboard.read');
    expect(scopeOf(call)).toEqual({ kind: 'global' });
  });

  it('returns nothing from the clipboard when the user refuses', async () => {
    getPermissionState.mockReturnValue('prompt');
    requestPermission.mockResolvedValue('denied');

    const response = await dispatch(window, 'clipboard_read', {});

    expect(response).toMatchObject({ ok: false, error: { code: 'permission-denied' } });
    expect(readClipboard).not.toHaveBeenCalled();
  });
});

describe('dispatch, opening files', () => {
  it('gates opening a file on application.control', async () => {
    getPermissionState.mockReturnValue('prompt');
    requestPermission.mockResolvedValue('granted');
    openWithDefaultApplication.mockResolvedValue({ path: 'a.md', opened: true });

    await dispatch(window, 'app_open_path', { rootId: root.id, path: 'a.md' });

    const call = requestPermission.mock.calls[0] as unknown as unknown[];
    expect(call[1]).toBe('application.control');
  });

  it('gates revealing a file on filesystem.read', async () => {
    getPermissionState.mockReturnValue('prompt');
    requestPermission.mockResolvedValue('granted');
    revealInFileManager.mockResolvedValue({ path: 'a.md', opened: true });

    await dispatch(window, 'app_reveal_path', { rootId: root.id, path: 'a.md' });

    const call = requestPermission.mock.calls[0] as unknown as unknown[];
    expect(call[1]).toBe('filesystem.read');
  });

  it('still refuses a command it cannot classify', async () => {
    const response = await dispatch(window, 'shell_run_unchecked', { rootId: root.id });
    expect(response).toMatchObject({ ok: false, error: { code: 'unknown-command' } });
  });
});

describe('dispatch, local models', () => {
  it('reports server status without asking for anything', async () => {
    getPermissionState.mockReturnValue('prompt');

    const response = await dispatch(window, 'local_model_servers', {});

    expect(requestPermission).not.toHaveBeenCalled();
    expect(response).toMatchObject({ ok: true, value: { granted: false } });
  });

  it('says the grant is held once local.inference is granted', async () => {
    getPermissionState.mockReturnValue('granted');

    const response = await dispatch(window, 'local_model_servers', {});

    expect(response).toMatchObject({ ok: true, value: { granted: true } });
  });

  it('gates listing installed models on local.inference', async () => {
    getPermissionState.mockReturnValue('prompt');
    requestPermission.mockResolvedValue('granted');

    await dispatch(window, 'local_model_list', {});

    const call = requestPermission.mock.calls[0] as unknown as unknown[];
    expect(call[1]).toBe('local.inference');
    expect(listLocalModels).toHaveBeenCalled();
  });

  it('never reaches the local server when the grant is refused', async () => {
    getPermissionState.mockReturnValue('prompt');
    requestPermission.mockResolvedValue('denied');

    const response = await dispatch(window, 'local_chat_start', {
      runId: 'run-1',
      modelId: 'local:ollama/tiny-chat:1b',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(response).toMatchObject({ ok: false, error: { code: 'permission-denied' } });
    expect(runLocalChat).not.toHaveBeenCalled();
  });

  it('runs a granted turn and streams its deltas to the page', async () => {
    getPermissionState.mockReturnValue('granted');
    runLocalChat.mockImplementation(async (_input: unknown, emit: (delta: unknown) => void) => {
      emit({ runId: 'run-1', channel: 'text', delta: 'hel' });
      emit({ runId: 'run-1', channel: 'text', delta: 'lo' });
      return {
        runId: 'run-1',
        modelId: 'local:ollama/tiny-chat:1b',
        serverId: 'ollama',
        text: 'hello',
        thinking: '',
        stopReason: 'end_turn',
        durationMs: 4,
      };
    });

    const response = await dispatch(window, 'local_chat_start', {
      runId: 'run-1',
      modelId: 'local:ollama/tiny-chat:1b',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(response).toMatchObject({ ok: true, value: { text: 'hello' } });
    expect(send).toHaveBeenCalledWith(expect.any(String), {
      kind: 'local-chat-delta',
      runId: 'run-1',
      channel: 'text',
      delta: 'hel',
    });
  });

  it('refuses a turn whose messages carry an attachment', async () => {
    getPermissionState.mockReturnValue('granted');

    const response = await dispatch(window, 'local_chat_start', {
      runId: 'run-attach',
      modelId: 'local:ollama/tiny-chat:1b',
      messages: [{ role: 'user', content: 'read this', attachments: [{ name: 'a.pdf' }] }],
    });

    expect(response).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('cannot read attachments') },
    });
    expect(runLocalChat).not.toHaveBeenCalled();
  });

  it('refuses a turn whose text carries attachment bytes', async () => {
    getPermissionState.mockReturnValue('granted');

    const response = await dispatch(window, 'local_chat_start', {
      runId: 'run-bytes',
      modelId: 'local:ollama/tiny-chat:1b',
      messages: [{ role: 'user', content: 'data:image/png;base64,iVBORw0KGgo=' }],
    });

    expect(response).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('cannot read attachments') },
    });
    expect(runLocalChat).not.toHaveBeenCalled();
  });

  it('refuses a turn with no messages before it starts', async () => {
    getPermissionState.mockReturnValue('granted');

    const response = await dispatch(window, 'local_chat_start', {
      runId: 'run-1',
      modelId: 'local:ollama/tiny-chat:1b',
      messages: [],
    });

    expect(response).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
    expect(runLocalChat).not.toHaveBeenCalled();
  });

  it('refuses a message list with an unknown role', async () => {
    getPermissionState.mockReturnValue('granted');

    const response = await dispatch(window, 'local_chat_start', {
      runId: 'run-1',
      modelId: 'local:ollama/tiny-chat:1b',
      messages: [{ role: 'tool', content: 'hi' }],
    });

    expect(response).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
  });

  it('reads and writes the base urls without a prompt', async () => {
    getPermissionState.mockReturnValue('prompt');

    await dispatch(window, 'local_model_settings_read', {});
    await dispatch(window, 'local_model_settings_write', {
      settings: { baseUrls: { ollama: 'http://127.0.0.1:11434' } },
    });

    expect(requestPermission).not.toHaveBeenCalled();
    expect(writeLocalModelSettings).toHaveBeenCalledWith({
      baseUrls: { ollama: 'http://127.0.0.1:11434' },
    });
  });
});
