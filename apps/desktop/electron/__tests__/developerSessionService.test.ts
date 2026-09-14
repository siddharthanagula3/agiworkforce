import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DeveloperSessionEvent,
  DeveloperSessionList,
  WorkspaceRoot,
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
const readWorkspaceGit = vi.fn(async () => ({ branch: 'main' }));
const rememberSessionStartedHere = vi.fn();
const wasSessionStartedHere = vi.fn<(id: string) => boolean>(() => false);

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
vi.mock('../runtime/workspaceStore', () => ({ listRoots, getRoot }));
vi.mock('../runtime/gitService', () => ({ readWorkspaceGit }));
vi.mock('../runtime/developerSessionStore', () => ({
  rememberSessionStartedHere,
  wasSessionStartedHere,
}));

type Responder = (method: string, params: Record<string, unknown>) => unknown;

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
      if (result !== undefined) this.reply(message.id, result);
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

  notify(method: string, params: unknown): void {
    this.stdout.emit('data', `${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }
}

const HANDSHAKE = {
  protocolVersion: 8,
  serverInfo: { name: 'agiworkforce-app-server', title: 'AGI', version: '1.7.1' },
  capabilities: { threads: true, turns: true, streaming: true, approvals: true },
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
  if (method === 'turn/start')
    return { turn: { id: 'turn-1', threadId: thread.id, status: 'running' } };
  if (method === 'turn/interrupt' || method === 'approval/respond') return { acknowledged: true };
  return undefined;
}

async function loadService(responder: Responder = defaultResponder) {
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
    spawn: spawn as never,
  });

  return { service, children, events, spawn };
}

beforeEach(() => {
  vi.clearAllMocks();
  listRoots.mockReturnValue([root]);
  getRoot.mockReturnValue(root);
  wasSessionStartedHere.mockReturnValue(false);
  statSync.mockReturnValue({ isDirectory: () => true });
  accessSync.mockReturnValue(undefined);
  process.env['PATH'] = '/Users/qa/.cargo/bin:/usr/bin';
});

describe('developer session runtime', () => {
  it('spawns one app-server per approved folder, in that folder', async () => {
    const { service, spawn } = await loadService();

    await service.listDeveloperSessions();
    await service.listDeveloperSessions();

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith(
      'agi',
      ['app-server'],
      expect.objectContaining({ cwd: root.path }),
    );
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
    });
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
      spawn: spawn as never,
    });

    await service.readDeveloperRuntimeStatus();
    binary = '/opt/agi';
    await service.readDeveloperRuntimeStatus();

    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn).toHaveBeenLastCalledWith('/opt/agi', ['--version'], expect.anything());
  });

  it('says the CLI is nowhere on the PATH, with the hint the surface prints', async () => {
    const { service } = await loadService();
    accessSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const status = await service.readDeveloperRuntimeStatus();

    expect(status.available).toBe(false);
    expect(status.path).toBeNull();
    expect(status.hint).toContain('agiworkforce.com/download');
  });

  it('reports a missing CLI as an unavailable folder rather than throwing', async () => {
    vi.resetModules();
    const service = await import('../runtime/developerSessionService');
    service.configureDeveloperSessions({
      emit: () => undefined,
      resolveBinary: () => 'agi',
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
    expect(list.groups[0]?.unavailable?.hint).toContain('agiworkforce.com/download');
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

  it('calls a session this shell started Desktop', async () => {
    const { service } = await loadService();
    wasSessionStartedHere.mockImplementation((id) => id === 'thread-new');

    const started = await service.startDeveloperSession(root.id);

    expect(rememberSessionStartedHere).toHaveBeenCalledWith('thread-new');
    expect(started.origin).toBe('desktop');
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
      schemaVersion: 4,
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
      schemaVersion: 4,
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

  it('surfaces an approval request and sends the answer back', async () => {
    const { service, children, events } = await loadService();

    await service.startDeveloperTurn({ rootId: root.id, threadId: thread.id, text: 'build it' });
    children[0]?.notify('approval/requested', {
      threadId: thread.id,
      turnId: 'turn-1',
      requestId: 'ask-1',
      kind: 'Exec',
      summary: 'Run pnpm build',
      detail: 'pnpm build',
    });

    await service.answerDeveloperApproval({
      rootId: root.id,
      threadId: thread.id,
      turnId: 'turn-1',
      requestId: 'ask-1',
      approved: true,
    });

    expect(events[0]?.event).toMatchObject({ type: 'approval-requested', requestId: 'ask-1' });
    expect(children[0]?.written).toContainEqual({
      method: 'approval/respond',
      params: { threadId: thread.id, turnId: 'turn-1', requestId: 'ask-1', decision: 'approved' },
    });
    expect(events[1]?.event).toMatchObject({ type: 'approval-answered', approved: true });
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
});
