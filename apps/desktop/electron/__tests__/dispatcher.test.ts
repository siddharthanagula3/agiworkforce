import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCAL_INFERENCE_COMMANDS } from '@agiworkforce/local-runtime-contract';
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
const revokePermission = vi.fn();
const stopComputerUseHelper = vi.fn();
const takeOverComputerUse = vi.fn(() => ({ takenOver: true }));
const isComputerUseTakenOver = vi.fn(() => false);
const screenChangesSeen = vi.fn(() => 0);
const captureScreen = vi.fn();
const runShellCommand = vi.fn();
const cancelShellRun = vi.fn();
const readShellPolicy = vi.fn();
const writeShellPolicy = vi.fn();
const openWithDefaultApplication = vi.fn();
const revealInFileManager = vi.fn();
const openInEditor = vi.fn();
const readClipboard = vi.fn();
const listLocalServers = vi.fn();
const listLocalModels = vi.fn();
const runLocalChat = vi.fn();
const cancelLocalChat = vi.fn();
const readLocalModelSettings = vi.fn();
const writeLocalModelSettings = vi.fn();
const send = vi.fn();

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp', getVersion: () => '1.8.0' },
  dialog: { showOpenDialog: vi.fn(), showMessageBox: vi.fn() },
  shell: { openPath: vi.fn() },
}));

vi.mock('../runtime/permissionManager', () => ({
  getPermissionState,
  requestPermission,
  consumeSingleUse,
  revokePermission,
}));

vi.mock('../runtime/computerUseService', () => ({
  ComputerUseRefused: class extends Error {},
  captureRegion: vi.fn(),
  captureScreen,
  clickPointer: vi.fn(),
  computerUseAvailability: () => ({ supported: true }),
  dragPointer: vi.fn(),
  isComputerUseTakenOver,
  movePointer: vi.fn(),
  screenChangesSeen,
  pressKey: vi.fn(),
  scrollPointer: vi.fn(),
  stopComputerUseHelper,
  takeOverComputerUse,
  typeText: vi.fn(),
  waitFor: vi.fn(),
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
vi.mock('../runtime/appsService', () => ({
  openInEditor,
  openWithDefaultApplication,
  revealInFileManager,
}));
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
const reportShellIdentity = vi.fn();
const syncDeveloperAccounts = vi.fn(async () => undefined);
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

vi.mock('../shellIdentity', () => ({ reportShellIdentity }));
const readShellLayout = vi.fn(() => ({ sidebarCollapsed: true, secondaryPanelWidth: 380 }));
const writeShellLayout = vi.fn((patch: Record<string, unknown>) => ({
  sidebarCollapsed: patch['sidebarCollapsed'] ?? null,
  secondaryPanelWidth: patch['secondaryPanelWidth'] ?? null,
}));
vi.mock('../shellWindowStore', () => ({ readShellLayout, writeShellLayout }));
vi.mock('../runtime/deviceIdentity', () => ({
  deviceIdentity: () => ({ deviceId: 'install-0000-1111', deviceName: 'Studio Mac' }),
}));
vi.mock('../browser/bridgeServer', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  pairingState: () => ({ paired: true }),
}));
const startRemoteControl = vi.fn((args: Record<string, unknown>) => ({ status: 'waiting', args }));
vi.mock('../remote/remoteControlService', () => ({
  remoteControlAvailable: () => true,
  remoteControlState: () => ({ status: 'idle' }),
  startRemoteControl,
  stopRemoteControl: () => ({ status: 'idle' }),
}));
vi.mock('../runtime/developerSessionService', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  syncDeveloperAccounts,
}));

const { SCREEN_STEP_COMMANDS, configureWindowOpening, dispatch, resetScreenStepGate } =
  await import('../runtime/dispatcher');

const window = {
  isDestroyed: () => false,
  webContents: { send },
} as unknown as Parameters<typeof dispatch>[0];

beforeEach(() => {
  vi.clearAllMocks();
  resetScreenStepGate();
  isComputerUseTakenOver.mockReturnValue(false);
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

describe('dispatch, the window layout the shell holds', () => {
  it('reads the layout without a workspace', async () => {
    const response = await dispatch(window, 'window_layout_read', {});
    expect(response).toEqual({
      ok: true,
      value: { sidebarCollapsed: true, secondaryPanelWidth: 380 },
    });
  });

  it('hands a layout change to the store that outlives the window', async () => {
    const response = await dispatch(window, 'window_layout_write', { sidebarCollapsed: false });
    expect(writeShellLayout).toHaveBeenCalledWith({ sidebarCollapsed: false });
    expect(response).toMatchObject({ ok: true, value: { sidebarCollapsed: false } });
  });
});

describe('dispatch, a page asking for a window of its own', () => {
  it('hands the route to the process that owns the windows', async () => {
    const open = vi.fn(() => true);
    configureWindowOpening(open);

    const response = await dispatch(window, 'window_open', {
      route: '/chat/library?surface=artifact',
    });

    expect(open).toHaveBeenCalledWith('/chat/library?surface=artifact');
    expect(response).toEqual({ ok: true, value: true });
  });

  it('answers a refused route without loading it', async () => {
    const open = vi.fn(() => false);
    configureWindowOpening(open);

    const response = await dispatch(window, 'window_open', { route: 'https://elsewhere.example' });

    expect(response).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
  });

  it('needs a route to open', async () => {
    configureWindowOpening(vi.fn(() => true));

    const response = await dispatch(window, 'window_open', {});

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

  it('gates opening a folder in VS Code on application.control for that folder', async () => {
    getPermissionState.mockReturnValue('prompt');
    requestPermission.mockResolvedValue('granted');
    openInEditor.mockResolvedValue({ path: '', opened: true });

    const response = await dispatch(window, 'app_open_in_editor', { rootId: root.id });

    const call = requestPermission.mock.calls[0] as unknown as unknown[];
    expect(call[1]).toBe('application.control');
    expect(scopeOf(call)).toEqual({ kind: 'workspace', target: root.path });
    expect(openInEditor).toHaveBeenCalledWith(root);
    expect(response).toMatchObject({ ok: true, value: { opened: true } });
  });

  it('refuses a picker kind it does not know before any dialog opens', async () => {
    const response = await dispatch(window, 'workspace_pick_root', { kind: 'drive' });
    expect(response).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
  });

  it('still refuses a command it cannot classify', async () => {
    const response = await dispatch(window, 'shell_run_unchecked', { rootId: root.id });
    expect(response).toMatchObject({ ok: false, error: { code: 'unknown-command' } });
  });
});

describe('dispatch, local models', () => {
  const LOCAL_COMMANDS: readonly string[] = LOCAL_INFERENCE_COMMANDS;

  it('refuses every local inference command on the cloud-only shell', async () => {
    getPermissionState.mockReturnValue('granted');

    for (const command of LOCAL_COMMANDS) {
      const response = await dispatch(window, command, {});
      expect(response).toMatchObject({ ok: false, error: { code: 'unsupported-platform' } });
    }
  });

  it('refuses before asking for permission or touching a local server', async () => {
    getPermissionState.mockReturnValue('prompt');

    for (const command of LOCAL_COMMANDS) {
      await dispatch(window, command, {});
    }

    expect(requestPermission).not.toHaveBeenCalled();
    expect(writeLocalModelSettings).not.toHaveBeenCalled();
  });
});

/**
 * The prompt is the only place a user gets to say no, so its sentence has to
 * be one they can answer: who is asking, where, and what they are being asked
 * to allow.
 */
describe('the browser capability prompt', () => {
  beforeEach(() => {
    getPermissionState.mockReturnValue('prompt');
    requestPermission.mockResolvedValue('denied');
  });

  async function ask(caller?: {
    name: string;
    subject: string;
    folder: string | null;
    path: string | null;
  }) {
    const { runBrowserCommand } = await import('../runtime/dispatcher');
    await runBrowserCommand(null, 'browser_read_page', {}, caller);
    const call = requestPermission.mock.calls.at(-1) as unknown[] | undefined;
    return {
      scope: call?.[2] as PermissionScope,
      reason: String(call?.[3] ?? ''),
      question: (call?.[4] ?? {}) as { subject?: string; objectPhrase?: string },
    };
  }

  it('asks about the browser, with the client as the subject', async () => {
    const { question, scope } = await ask({
      name: 'agi',
      subject: 'The AGI CLI',
      folder: 'qa-project',
      path: '/work/qa-project',
    });
    // "Allow agi to use the paired browser?" rather than the old
    // "Allow AGI Workforce to browse agi?", which read as though the client
    // were a website. The title uses the name the user would type; the body
    // says who that is in words.
    expect(question.subject).toBe('agi');
    expect(question.objectPhrase).toBe('use the paired browser');
    // The grant is the client's, so the user answers once per client.
    expect(scope).toEqual({ kind: 'application', target: 'agi' });
  });

  it('names the client, the folder and the whole path in the body', async () => {
    const { reason } = await ask({
      name: 'agi',
      subject: 'The AGI CLI',
      folder: 'qa-project',
      path: '/private/tmp/a-very-long-scratch-directory/qa-project',
    });
    expect(reason).toContain('The AGI CLI running in qa-project is asking.');
    expect(reason).toContain('/private/tmp/a-very-long-scratch-directory/qa-project');
    expect(reason).toContain('will not ask again for each action');
    expect(reason).toContain('approved-sites list');
  });

  it('says nothing about a folder when the client named none', async () => {
    const { reason } = await ask({
      name: 'agi',
      subject: 'The AGI CLI',
      folder: null,
      path: null,
    });
    expect(reason).toContain('The AGI CLI is asking.');
    expect(reason).not.toContain('running in');
  });

  it('leaves the renderer path exactly as it was', async () => {
    const { scope, question } = await ask();
    expect(scope).toEqual({ kind: 'global' });
    expect(question.subject).toBeUndefined();
  });
});

describe('the account the shell hands its app-servers', () => {
  it('passes the renderer account on and resyncs every running app-server', async () => {
    const response = await dispatch(window, 'developer_account_report', {
      signedIn: true,
      email: 'qa@agiworkforce.com',
    });

    expect(response).toEqual({ ok: true, value: true });
    expect(reportShellIdentity).toHaveBeenCalledExactlyOnceWith({
      signedIn: true,
      email: 'qa@agiworkforce.com',
    });
    expect(syncDeveloperAccounts).toHaveBeenCalledOnce();
  });

  it('passes a sign-out on with no account attached to it', async () => {
    await dispatch(window, 'developer_account_report', { signedIn: false });

    expect(reportShellIdentity).toHaveBeenCalledExactlyOnceWith({ signedIn: false, email: null });
    expect(syncDeveloperAccounts).toHaveBeenCalledOnce();
  });
});

describe('stopping screen control', () => {
  beforeEach(() => {
    revokePermission.mockClear();
    stopComputerUseHelper.mockClear();
  });

  it('stops without asking for permission first', async () => {
    // Needing a prompt to stop something already holding the mouse is the one
    // place a prompt must not appear, so this command is outside the capability
    // table and must not consult it.
    getPermissionState.mockReturnValue('prompt');

    const result = await dispatch(window, 'computer_stop', {});

    expect(result.ok).toBe(true);
    expect(stopComputerUseHelper).toHaveBeenCalledOnce();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('withdraws the grant so the next step cannot simply restart it', async () => {
    // Each screen step is independent here: killing the helper alone would let
    // the very next call spawn a new one and carry on moving the pointer.
    getPermissionState.mockReturnValue('granted');

    await dispatch(window, 'computer_stop', {});

    expect(revokePermission).toHaveBeenCalledWith('computer.use', { kind: 'global' });
  });
});

describe('screen control across displays and takeover', () => {
  beforeEach(() => {
    captureScreen.mockClear();
    requestPermission.mockClear();
    takeOverComputerUse.mockClear();
    getPermissionState.mockReturnValue('granted');
  });

  it('captures the display the step names, and the remembered one when it names none', async () => {
    await dispatch(window, 'computer_screenshot', { display: 7 });
    await dispatch(window, 'computer_screenshot', {});

    expect(captureScreen.mock.calls).toEqual([[7], [undefined]]);
  });

  it('refuses a display id that is not a number', async () => {
    const result = await dispatch(window, 'computer_screenshot', { display: 'second' });

    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
    expect(captureScreen).not.toHaveBeenCalled();
  });

  it('takes over without asking for permission first', async () => {
    getPermissionState.mockReturnValue('prompt');

    const result = await dispatch(window, 'computer_take_over', {});

    expect(result.ok).toBe(true);
    expect(takeOverComputerUse).toHaveBeenCalledOnce();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('leaves handing control back to the native menu, not the page', async () => {
    const result = await dispatch(window, 'computer_hand_back', {});

    expect(result.ok).toBe(false);
  });
});

describe('device registry and remote control commands', () => {
  it('describes this install for the registry without claiming what this shell refuses', async () => {
    const response = await dispatch(window, 'device_registry_profile', {});
    expect(response).toMatchObject({
      ok: true,
      value: {
        installId: 'install-0000-1111',
        name: 'Studio Mac',
        platform: process.platform,
        architecture: process.arch,
        appVersion: '1.8.0',
        capabilities: {
          browser: true,
          computerUse: true,
          localModels: false,
          localMcp: false,
          remoteControl: true,
        },
      },
    });
  });

  it('hands pairing details to the remote control host unchanged', async () => {
    const args = { code: 'ABCD1234WXYZ', wsUrl: 'wss://relay', pairToken: 't', expiresAt: 1 };
    const response = await dispatch(window, 'remote_control_start', args);
    expect(startRemoteControl).toHaveBeenCalledWith(args);
    expect(response).toMatchObject({ ok: true, value: { status: 'waiting' } });
  });
});

describe('the screen steps a user can stop', () => {
  const ARGS: Record<string, Record<string, unknown>> = {
    computer_screenshot: {},
    computer_zoom: { x: 0, y: 0, width: 10, height: 10 },
    computer_move: { x: 10, y: 10 },
    computer_click: { x: 10, y: 10 },
    computer_drag: { x: 1, y: 1, toX: 2, toY: 2 },
    computer_scroll: { x: 1, y: 1, deltaY: 3 },
    computer_type: { text: 'hello' },
    computer_key: { key: 'enter' },
    computer_wait: { ms: 1 },
  };

  it('covers every screen step the contract defines', () => {
    expect([...SCREEN_STEP_COMMANDS].sort()).toEqual(Object.keys(ARGS).sort());
  });

  it('refuses every one of them once the user has taken the screen back', async () => {
    isComputerUseTakenOver.mockReturnValue(true);
    for (const command of SCREEN_STEP_COMMANDS) {
      const response = await dispatch(window, command, ARGS[command] ?? {});
      expect(response, command).toMatchObject({ ok: false });
    }
  });

  it('lets them through again once control is handed back', async () => {
    isComputerUseTakenOver.mockReturnValue(false);
    const response = await dispatch(window, 'computer_move', { x: 10, y: 10 });
    expect(response).toMatchObject({ ok: true });
  });

  it('stops a step that has repeated with nothing changing', async () => {
    const outcomes = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      outcomes.push(await dispatch(window, 'computer_click', { x: 40, y: 40 }));
    }
    expect(outcomes.slice(0, 4).every((entry) => (entry as { ok: boolean }).ok)).toBe(true);
    expect(outcomes[4]).toMatchObject({ ok: false });
    expect(outcomes[5]).toMatchObject({ ok: false });
  });

  it('lets the same step go on for as long as screenshots show the screen moving', async () => {
    let changes = 100;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      screenChangesSeen.mockReturnValue((changes += 1));
      const response = await dispatch(window, 'computer_scroll', { x: 40, y: 40, deltaY: 400 });
      expect(response, `scroll ${attempt}`).toMatchObject({ ok: true });
    }
  });

  it('still stops the same step when the screenshots in between showed nothing new', async () => {
    screenChangesSeen.mockReturnValue(200);
    const outcomes = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await dispatch(window, 'computer_screenshot', {});
      outcomes.push(await dispatch(window, 'computer_scroll', { x: 40, y: 40, deltaY: 400 }));
    }
    expect(outcomes[3]).toMatchObject({ ok: true });
    expect(outcomes[4]).toMatchObject({ ok: false });
  });

  it('lets a caller out of the stop by doing something else', async () => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await dispatch(window, 'computer_click', { x: 40, y: 40 });
    }
    await dispatch(window, 'computer_type', { text: 'a different step' });
    expect(await dispatch(window, 'computer_click', { x: 40, y: 40 })).toMatchObject({ ok: true });
  });

  it('never stops a screenshot, which is how a caller finds out what happened', async () => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      expect(await dispatch(window, 'computer_screenshot', {})).toMatchObject({ ok: true });
    }
  });

  it('leaves a caller working through different parts of the screen alone', async () => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await dispatch(window, 'computer_click', { x: attempt * 40, y: 20 });
      expect(response, `click ${attempt}`).toMatchObject({ ok: true });
    }
  });
});
