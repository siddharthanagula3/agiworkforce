import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  worktreeRootId,
  type DeveloperApprovalRequest,
  type DeveloperSessionEvent,
  type PermissionScope,
  type WorkspaceRoot,
} from '@agiworkforce/local-runtime-contract';
import type { CodeRemoteDependencies } from '@agiworkforce/utils/remote-control';
import {
  approvalWasDeclined,
  beginApprovalConfirmation,
  resetApprovalConfirmations,
} from '../runtime/approvalConfirmations';

const scratch = mkdtempSync(path.join(tmpdir(), 'agi-remote-service-'));
const userData = path.join(scratch, 'userData');
mkdirSync(userData, { recursive: true });

const getSystemIdleState = vi.fn<() => 'active' | 'idle' | 'locked' | 'unknown'>(() => 'active');
vi.mock('electron', () => ({
  app: { getPath: () => userData, getVersion: () => '1.8.0' },
  dialog: { showMessageBox: vi.fn() },
  powerMonitor: { getSystemIdleState },
}));

const listDeveloperSessions = vi.fn(async (includeRoot: (root: WorkspaceRoot) => boolean) => ({
  groups: listed.filter(includeRoot).map((root) => ({
    rootId: root.id,
    name: root.name,
    path: root.path,
    branch: null,
    sessions: [],
  })),
}));
const readDeveloperSessionActivity = vi.fn(async () => ({ transcript: {} }));
const startRemoteDeveloperTurn = vi.fn(async () => ({ turnId: 'turn-1' }));
const interruptDeveloperTurn = vi.fn(async () => true);
const answerDeveloperApproval = vi.fn(async () => true);
// What a phone answers by itself: an edit in the approved folder that reaches
// nothing reserved. The CLI calls no write reversible.
const ROUTINE_REQUEST: DeveloperApprovalRequest = {
  requestId: 'ask-1',
  kind: 'FileEdit',
  summary: 'Edit src/app.ts',
  detail: '',
  command: null,
  riskLevel: 'medium',
  reversible: false,
};
type Reservation =
  'outside-folder' | 'protected-path' | 'unknown-remote' | 'named-host' | 'unread-request';
function review(
  overrides: Partial<DeveloperApprovalRequest> = {},
  reserved: Reservation[] = [],
): { request: DeveloperApprovalRequest; reserved: Reservation[] } {
  return { request: { ...ROUTINE_REQUEST, ...overrides }, reserved };
}
const readPendingApproval = vi.fn<() => Promise<ReturnType<typeof review> | null>>(async () =>
  review(),
);
vi.mock('../runtime/developerSessionService', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  answerDeveloperApproval,
  interruptDeveloperTurn,
  listDeveloperSessions,
  readDeveloperSessionActivity,
  readPendingApproval,
  startRemoteDeveloperTurn,
}));

const readWorkingTreeDiff = vi.fn(async () => 'diff --git a/a b/a');
vi.mock('../runtime/gitService', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  readWorkingTreeDiff,
}));
vi.mock('../runtime/deviceIdentity', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  deviceIdentity: () => ({ deviceId: 'install-1', deviceName: 'Studio Mac' }),
}));
vi.mock('../remote/pairingWindow', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  closePairingWindow: vi.fn(),
  showPairingWindow: vi.fn(async () => undefined),
}));

let presentedWindow: { isDestroyed: () => boolean; id: number } | null = null;
const presentWindow = vi.fn<() => typeof presentedWindow>(() => presentedWindow);
let code: Omit<CodeRemoteDependencies, 'send'> | null = null;
let phoneName: string | null = 'Pixel 9';
let hostStatus = 'connected';
const handleSessionEvent = vi.fn();
let hostOptions: { presentPairing: (pairing: unknown) => void } | null = null;
vi.mock('@agiworkforce/utils/remote-control', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createRemoteControlHost: vi.fn(
    (options: {
      code: Omit<CodeRemoteDependencies, 'send'>;
      presentPairing: (pairing: unknown) => void;
    }) => {
      code = options.code;
      hostOptions = options;
      return {
        start: vi.fn(),
        stop: vi.fn(),
        state: () => ({ status: hostStatus, phoneName }),
        handleSessionEvent,
      };
    },
  ),
}));

const { RemoteCommandRefused } = await import('@agiworkforce/utils/remote-control');
const {
  APPROVAL_CONFIRM_TIMEOUT_MS,
  configureRemoteControl,
  relayDeveloperSessionEvent,
  startRemoteControl,
} = await import('../remote/remoteControlService');
const { showPairingWindow } = await import('../remote/pairingWindow');
const { CLOUD_APP_ORIGIN } = await import('../config');
const { grantRoot, listRoots, revokeRoot } = await import('../runtime/workspaceStore');
const { recordDecision, revokePermission } = await import('../runtime/permissionManager');
const { dialog } = await import('electron');

function project(name: string): string {
  const folder = path.join(scratch, 'code', name);
  mkdirSync(folder, { recursive: true });
  return folder;
}

function scopeOf(root: WorkspaceRoot): PermissionScope {
  return { kind: 'workspace', target: root.path };
}

let listed: WorkspaceRoot[] = [];
let allowed: WorkspaceRoot;
let readOnly: WorkspaceRoot;
let denied: WorkspaceRoot;

function phone(): Omit<CodeRemoteDependencies, 'send'> {
  if (!code) throw new Error('remote control was never configured');
  return code;
}

const TURN_DELTA: DeveloperSessionEvent = {
  type: 'output-delta',
  threadId: 'thread-1',
  turnId: 'turn-1',
  delta: 'secret output',
} as DeveloperSessionEvent;

beforeEach(async () => {
  vi.clearAllMocks();
  resetApprovalConfirmations();
  phoneName = 'Pixel 9';
  getSystemIdleState.mockReturnValue('active');
  readPendingApproval.mockResolvedValue(review());
  for (const root of listRoots()) revokeRoot(root.id);
  allowed = await grantRoot(project('allowed'));
  readOnly = await grantRoot(project('read-only'));
  denied = await grantRoot(project('denied'));
  listed = [allowed, readOnly, denied];
  recordDecision('shell.execute', scopeOf(allowed), 'granted', 'session');
  recordDecision('filesystem.read', scopeOf(readOnly), 'granted', 'always');
  recordDecision('filesystem.write', scopeOf(readOnly), 'granted', 'always');
  recordDecision('filesystem.read', scopeOf(denied), 'granted', 'always');
  recordDecision('shell.execute', scopeOf(denied), 'denied', 'session');
  presentedWindow = { isDestroyed: () => false, id: 7 };
  presentWindow.mockImplementation(() => presentedWindow);
  configureRemoteControl(() => undefined, presentWindow as never);
});

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('what a paired phone can reach', () => {
  it('lists sessions only for folders the agent is allowed to run in', async () => {
    const list = await phone().listSessions();

    expect(list.groups.map((group) => group.rootId)).toEqual([allowed.id]);
  });

  it('reads, steers, interrupts, approves and diffs in a folder the agent may run in', async () => {
    const answer = {
      rootId: allowed.id,
      threadId: 'thread-1',
      turnId: 'turn-1',
      requestId: 'ask-1',
      decision: 'approve_once' as const,
    };

    await phone().readActivity(allowed.id, 'thread-1');
    await expect(
      phone().startTurn({ rootId: allowed.id, threadId: 'thread-1', text: 'go' }),
    ).resolves.toEqual({ turnId: 'turn-1' });
    await expect(phone().interruptTurn(allowed.id, 'thread-1', 'turn-1')).resolves.toBe(true);
    await expect(phone().answerApproval(answer)).resolves.toEqual({ status: 'applied' });
    await expect(phone().readDiff(allowed.id, ['a'])).resolves.toBe('diff --git a/a b/a');

    expect(readDeveloperSessionActivity).toHaveBeenCalledWith(allowed.id, 'thread-1');
    expect(answerDeveloperApproval).toHaveBeenCalledWith(answer);
    expect(readWorkingTreeDiff).toHaveBeenCalledWith(allowed.path, ['a']);
  });

  it.each([
    ['holds only read and write grants', () => readOnly],
    ['had the agent denied this session', () => denied],
  ])('reaches nothing in a folder that %s', async (_label, pick) => {
    const root = pick();

    await expect(phone().readActivity(root.id, 'thread-1')).rejects.toBeInstanceOf(
      RemoteCommandRefused,
    );
    await expect(
      phone().startTurn({ rootId: root.id, threadId: 'thread-1', text: 'go' }),
    ).rejects.toBeInstanceOf(RemoteCommandRefused);
    await expect(phone().interruptTurn(root.id, 'thread-1', 'turn-1')).rejects.toBeInstanceOf(
      RemoteCommandRefused,
    );
    await expect(
      phone().answerApproval({
        rootId: root.id,
        threadId: 'thread-1',
        turnId: 'turn-1',
        requestId: 'ask-1',
        decision: 'approve_once',
      }),
    ).rejects.toBeInstanceOf(RemoteCommandRefused);
    await expect(phone().readDiff(root.id, ['a'])).rejects.toBeInstanceOf(RemoteCommandRefused);

    expect(readDeveloperSessionActivity).not.toHaveBeenCalled();
    expect(startRemoteDeveloperTurn).not.toHaveBeenCalled();
    expect(interruptDeveloperTurn).not.toHaveBeenCalled();
    expect(answerDeveloperApproval).not.toHaveBeenCalled();
    expect(readWorkingTreeDiff).not.toHaveBeenCalled();
    expect(dialog.showMessageBox).not.toHaveBeenCalled();
  });

  it('reaches a worktree only through the folder it was made from', async () => {
    await expect(
      phone().startTurn({
        rootId: worktreeRootId(readOnly.id, 'abcdef12'),
        threadId: 'thread-1',
        text: 'go',
      }),
    ).rejects.toThrow(/has not been allowed to run commands in/u);
    await expect(
      phone().startTurn({ rootId: 'never-approved', threadId: 'thread-1', text: 'go' }),
    ).rejects.toThrow(/no longer approved/u);
    expect(startRemoteDeveloperTurn).not.toHaveBeenCalled();

    const inAllowed = worktreeRootId(allowed.id, 'abcdef12');
    await phone().startTurn({ rootId: inAllowed, threadId: 'thread-1', text: 'go' });
    expect(startRemoteDeveloperTurn).toHaveBeenCalledWith({
      rootId: inAllowed,
      threadId: 'thread-1',
      text: 'go',
    });
  });

  it('loses a folder the moment the grant is withdrawn', async () => {
    await phone().startTurn({ rootId: allowed.id, threadId: 'thread-1', text: 'go' });
    revokePermission('shell.execute', scopeOf(allowed));

    await expect(
      phone().startTurn({ rootId: allowed.id, threadId: 'thread-1', text: 'again' }),
    ).rejects.toBeInstanceOf(RemoteCommandRefused);
    expect((await phone().listSessions()).groups).toEqual([]);
    expect(startRemoteDeveloperTurn).toHaveBeenCalledTimes(1);
  });

  it('never reads the diff of a credential file for the phone', async () => {
    await expect(
      phone().readDiff(allowed.id, ['src/app.ts', '.env.production', 'deploy/id_ed25519']),
    ).resolves.toBe('diff --git a/a b/a');
    expect(readWorkingTreeDiff).toHaveBeenCalledWith(allowed.path, ['src/app.ts']);

    readWorkingTreeDiff.mockClear();
    await expect(phone().readDiff(allowed.id, ['.env', '.git/config'])).resolves.toBeNull();
    expect(readWorkingTreeDiff).not.toHaveBeenCalled();
  });

  it('is sent session events only from folders the agent is allowed to run in', () => {
    relayDeveloperSessionEvent(allowed.id, TURN_DELTA);
    relayDeveloperSessionEvent(readOnly.id, TURN_DELTA);
    relayDeveloperSessionEvent(denied.id, TURN_DELTA);

    expect(handleSessionEvent.mock.calls).toEqual([[allowed.id, TURN_DELTA]]);
  });
});

describe('an approval answered from the paired phone', () => {
  const showMessageBox = vi.mocked(dialog.showMessageBox);

  function answer(decision: 'approve_once' | 'approve_for_session' | 'deny' = 'approve_once') {
    return {
      rootId: allowed.id,
      threadId: 'thread-1',
      turnId: 'turn-1',
      requestId: 'ask-1',
      decision,
    };
  }

  function openDialog() {
    let choose: (response: number) => void = () => undefined;
    showMessageBox.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          choose = (response) => resolve({ response, checkboxChecked: false });
        }),
    );
    return { choose: (response: number) => choose(response) };
  }

  async function held(pending = review({ riskLevel: 'high' })) {
    readPendingApproval.mockResolvedValueOnce(pending);
    const outcome = await phone().answerApproval(answer());
    if (outcome.status !== 'held') throw new Error('the answer was applied without being held');
    return outcome;
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is applied directly for a routine request: an edit in the folder at low or medium risk, or what moves nothing outside the conversation', async () => {
    const routine = [
      review(),
      review({ riskLevel: 'low' }),
      review({ kind: 'Patch' }),
      review({ kind: 'McpElicitation', riskLevel: 'low', reversible: true }),
    ];

    for (const pending of routine) {
      readPendingApproval.mockResolvedValueOnce(pending);
      await expect(phone().answerApproval(answer())).resolves.toEqual({ status: 'applied' });
    }

    expect(showMessageBox).not.toHaveBeenCalled();
    expect(presentWindow).not.toHaveBeenCalled();
    expect(answerDeveloperApproval).toHaveBeenCalledTimes(routine.length);
  });

  it.each([
    ['high risk', review({ riskLevel: 'high', command: 'rm -rf build' }), 'rates this high risk'],
    [
      'a command, whatever its rating',
      review({ kind: 'Exec', command: 'cat README.md', riskLevel: 'low', reversible: true }),
      'runs a program with your account',
    ],
    [
      'a command allowed onto the network',
      review({ kind: 'Network', command: null, riskLevel: 'medium', reversible: false }),
      'can send to a server elsewhere',
    ],
    ['unrated', review({ riskLevel: null }), 'did not rate the risk'],
    [
      'a write outside the folder',
      review({ kind: 'FileWrite', command: null, riskLevel: 'medium', reversible: false }, [
        'outside-folder',
      ]),
      'changes files outside allowed',
    ],
    [
      'a write to git metadata or project configuration',
      review({ kind: 'FileEdit', command: null, riskLevel: 'medium', reversible: false }, [
        'protected-path',
      ]),
      'git metadata, project configuration or a hook manager',
    ],
    [
      'a push to a remote the repository is not set up with',
      review({ kind: 'GitPush', command: null, riskLevel: 'medium', reversible: false }, [
        'unknown-remote',
      ]),
      'a remote this repository is not set up with',
    ],
    [
      'trust in a folder',
      review({ kind: 'TrustDirectory', command: null, riskLevel: 'medium' }),
      'Trusting a folder',
    ],
    [
      'a git operation',
      review({ kind: 'Git', command: null, riskLevel: 'medium', reversible: false }),
      'hooks outside the sandbox',
    ],
    [
      'a call to a tool server',
      review({ kind: 'McpTool', command: null, riskLevel: 'low', reversible: true }),
      'tool server',
    ],
    [
      'a request this shell could not read',
      review({ kind: 'FileWrite', command: null, riskLevel: 'low' }, ['unread-request']),
      'could not read',
    ],
    [
      'a kind this build does not know',
      review({ kind: 'SomethingNewer', command: null, riskLevel: 'low' }),
      'always confirmed at this computer',
    ],
  ])(
    'is held for %s until someone allows it at the computer, on a window brought forward, in a dialog naming the phone',
    async (_label, pending, fact) => {
      const dialogOpen = openDialog();

      const outcome = await held(pending);

      expect(outcome.message).toContain('needs to be allowed at your computer');
      expect(answerDeveloperApproval).not.toHaveBeenCalled();
      expect(presentWindow).toHaveBeenCalledTimes(1);
      expect(showMessageBox).toHaveBeenCalledTimes(1);
      const [parent, options] = showMessageBox.mock.calls[0] as unknown as [
        unknown,
        {
          buttons: string[];
          defaultId: number;
          message: string;
          detail: string;
          signal: AbortSignal;
        },
      ];
      expect(parent).toBe(presentedWindow);
      expect(options.message).toBe('Allow what your phone approved in allowed?');
      expect(options.detail).toContain('Pixel 9 sent this answer over Remote Control');
      expect(options.detail).toContain(allowed.path);
      expect(options.detail).toContain(fact);
      expect(options.buttons).toEqual(['Cancel', 'Allow once']);
      expect(options.defaultId).toBe(0);

      dialogOpen.choose(1);
      await expect(outcome.settled).resolves.toEqual({
        allowed: true,
        message: 'Allowed at your computer.',
      });
      expect(answerDeveloperApproval).toHaveBeenCalledWith(answer());
      expect(options.signal.aborted).toBe(true);
    },
  );

  it('is not applied when the person at the computer says Cancel, and a resend raises nothing more', async () => {
    showMessageBox.mockResolvedValue({ response: 0, checkboxChecked: false });

    const first = await held();
    await expect(first.settled).resolves.toEqual({
      allowed: false,
      message: 'Not allowed at your computer. The agent is still waiting for an answer.',
    });
    expect(answerDeveloperApproval).not.toHaveBeenCalled();

    presentWindow.mockClear();
    readPendingApproval.mockResolvedValue(review({ riskLevel: 'high' }));
    for (let resend = 0; resend < 3; resend += 1) {
      await expect(phone().answerApproval(answer())).rejects.toThrow(
        /was not allowed at your computer/u,
      );
    }
    expect(showMessageBox).toHaveBeenCalledTimes(1);
    expect(presentWindow).not.toHaveBeenCalled();
    expect(approvalWasDeclined(answer(), 'page')).toBe(false);

    await expect(phone().answerApproval(answer('deny'))).resolves.toEqual({ status: 'applied' });
    showMessageBox.mockResolvedValueOnce({ response: 1, checkboxChecked: false });
    const another = await phone().answerApproval({ ...answer(), requestId: 'ask-next' });
    expect(another.status).toBe('held');
  });

  it('raises no second dialog for a request the page already has one open for', async () => {
    readPendingApproval.mockResolvedValue(review({ riskLevel: 'high' }));
    expect(beginApprovalConfirmation(answer())).toBe(true);

    await expect(phone().answerApproval(answer())).rejects.toThrow(/already waiting/u);

    expect(showMessageBox).not.toHaveBeenCalled();
    expect(presentWindow).not.toHaveBeenCalled();
  });

  it('closes the dialog and refuses by its own clock when nobody answers in two minutes', async () => {
    vi.useFakeTimers();
    showMessageBox.mockImplementationOnce(() => new Promise(() => undefined));

    const outcome = await held();
    const signal = (showMessageBox.mock.calls[0]?.[1] as unknown as { signal: AbortSignal }).signal;
    expect(signal.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(APPROVAL_CONFIRM_TIMEOUT_MS - 1);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await expect(outcome.settled).resolves.toEqual({
      allowed: false,
      message: expect.stringContaining('Nobody answered at your computer within two minutes'),
    });
    expect(signal.aborted).toBe(true);
    expect(answerDeveloperApproval).not.toHaveBeenCalled();

    showMessageBox.mockResolvedValueOnce({ response: 1, checkboxChecked: false });
    const again = await held();
    await expect(again.settled).resolves.toMatchObject({ allowed: true });
  });

  it('says so when it was allowed at the computer but the answer did not reach the agent', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    showMessageBox.mockResolvedValueOnce({ response: 1, checkboxChecked: false });
    answerDeveloperApproval.mockRejectedValueOnce(new Error('runtime gone'));

    const outcome = await held();

    await expect(outcome.settled).resolves.toEqual({
      allowed: false,
      message: 'It was allowed at your computer, but the answer did not reach the agent.',
    });
  });

  it('is refused outright while the screen is locked, with no dialog left waiting', async () => {
    readPendingApproval.mockResolvedValueOnce(review({ riskLevel: 'high' }));
    getSystemIdleState.mockReturnValue('locked');

    await expect(phone().answerApproval(answer())).rejects.toThrow(/screen is locked/u);

    expect(presentWindow).not.toHaveBeenCalled();
    expect(showMessageBox).not.toHaveBeenCalled();
    expect(answerDeveloperApproval).not.toHaveBeenCalled();
  });

  it('is refused when no window can be opened to ask on', async () => {
    readPendingApproval.mockResolvedValueOnce(review({ riskLevel: 'high' }));
    presentedWindow = null;

    await expect(phone().answerApproval(answer())).rejects.toThrow(/no window could be opened/u);

    expect(showMessageBox).not.toHaveBeenCalled();
    expect(answerDeveloperApproval).not.toHaveBeenCalled();
  });

  it('raises one dialog for a request the phone answers twice', async () => {
    readPendingApproval.mockResolvedValue(review({ riskLevel: 'high' }));
    showMessageBox.mockImplementationOnce(() => new Promise(() => undefined));

    await expect(phone().answerApproval(answer())).resolves.toMatchObject({ status: 'held' });
    await expect(phone().answerApproval(answer())).rejects.toThrow(/already waiting/u);

    expect(showMessageBox).toHaveBeenCalledTimes(1);
    expect(answerDeveloperApproval).not.toHaveBeenCalled();
  });

  it('is refused when the CLI no longer holds the approval', async () => {
    readPendingApproval.mockResolvedValueOnce(null);

    await expect(phone().answerApproval(answer())).rejects.toBeInstanceOf(RemoteCommandRefused);
    expect(answerDeveloperApproval).not.toHaveBeenCalled();
  });

  it('names an unnamed phone as one, and sends a denial straight through', async () => {
    phoneName = null;
    readPendingApproval.mockResolvedValueOnce(review({ riskLevel: 'high' }));
    showMessageBox.mockResolvedValueOnce({ response: 0, checkboxChecked: false });
    await phone().answerApproval({ ...answer(), requestId: 'ask-2' });
    const options = showMessageBox.mock.calls[0]?.at(-1) as { detail: string };
    expect(options.detail).toContain('A paired phone sent this answer');

    showMessageBox.mockClear();
    readPendingApproval.mockClear();
    await expect(phone().answerApproval(answer('deny'))).resolves.toEqual({ status: 'applied' });
    expect(readPendingApproval).not.toHaveBeenCalled();
    expect(showMessageBox).not.toHaveBeenCalled();
    expect(answerDeveloperApproval).toHaveBeenCalledWith(answer('deny'));
  });
});

describe('refreshing the code from the pairing window', () => {
  function parentShowing(url: string, destroyed = false) {
    return {
      isDestroyed: () => destroyed,
      webContents: { isDestroyed: () => false, getURL: () => url, send: vi.fn() },
    };
  }

  beforeEach(() => {
    hostStatus = 'waiting';
  });

  afterEach(() => {
    hostStatus = 'connected';
  });

  async function refreshRequest(parent: ReturnType<typeof parentShowing> | null) {
    vi.mocked(showPairingWindow).mockClear();
    startRemoteControl(parent as never, {});
    hostOptions?.presentPairing({ code: 'ABCD1234WXYZ', qrPayload: 'payload', expiresAt: 1 });
    const call = vi.mocked(showPairingWindow).mock.calls[0];
    return (call?.[3] as () => boolean)();
  }

  it('asks the app page that started the pairing, and reports that it did', async () => {
    const parent = parentShowing(`${CLOUD_APP_ORIGIN}/settings`);

    expect(await refreshRequest(parent)).toBe(true);
    expect(parent.webContents.send).toHaveBeenCalledWith(expect.any(String), {
      kind: 'remote-control-refresh-requested',
    });
  });

  it('reports that nothing can be refreshed once no pairing is waiting', async () => {
    hostStatus = 'connected';
    const parent = parentShowing(CLOUD_APP_ORIGIN);

    expect(await refreshRequest(parent)).toBe(false);
    expect(parent.webContents.send).not.toHaveBeenCalled();
  });

  it('reports that no app can answer when its window is gone or shows another site', async () => {
    const elsewhere = parentShowing('https://accounts.example.com/signin');

    expect(await refreshRequest(elsewhere)).toBe(false);
    expect(elsewhere.webContents.send).not.toHaveBeenCalled();
    expect(await refreshRequest(parentShowing(CLOUD_APP_ORIGIN, true))).toBe(false);
    expect(await refreshRequest(null)).toBe(false);
  });
});
