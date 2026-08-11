import { EventEmitter } from 'node:events';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalRuntimeClient, type SpawnLocalRuntime } from '../integrations/localRuntimeClient';
import {
  SYNTHETIC_LOCAL_MODEL_ID,
  SYNTHETIC_LOCAL_MODEL_ID_SECONDARY,
} from './catalogModelFixtures';

const SYNTHETIC_RUNTIME_MODEL_ID = 'fixture-runtime-model';

function fakeRuntime(
  protocolVersion = 7,
  options: {
    approvals?: boolean;
    ignoreMethods?: readonly string[];
    legacyInitialize?: boolean;
    omitTranscriptTruncated?: boolean;
    provider?: string;
    serverVersion?: string;
    exitOnShutdown?: boolean;
    shutdownResult?: unknown;
  } = {},
): {
  spawn: SpawnLocalRuntime;
  requests: Array<Record<string, unknown>>;
  stdout: PassThrough;
  children: EventEmitter[];
} {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const requests: Array<Record<string, unknown>> = [];
  const children: EventEmitter[] = [];
  let activeChild: EventEmitter | undefined;
  let buffer = '';

  stdin.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    while (buffer.includes('\n')) {
      const newline = buffer.indexOf('\n');
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line.trim() === '') continue;
      const request = JSON.parse(line) as Record<string, unknown>;
      requests.push(request);
      const method = request.method;
      if (typeof method === 'string' && options.ignoreMethods?.includes(method) === true) continue;
      const result =
        method === 'initialize'
          ? options.legacyInitialize === true
            ? {
                serverInfo: { name: 'agiworkforce-app-server', version: '0.1.0' },
                capabilities: { streaming: true, tools: true },
              }
            : {
                serverInfo: {
                  name: 'agiworkforce-app-server',
                  title: 'AGI',
                  version: options.serverVersion ?? '1.7.1',
                },
                protocolVersion,
                capabilities: {
                  threads: true,
                  turns: true,
                  streaming: true,
                  approvals: options.approvals ?? true,
                  tools: true,
                  mcp: true,
                  checkpoints: false,
                  worktrees: false,
                  models: true,
                },
              }
          : method === 'thread/start' || method === 'thread/resume'
            ? {
                thread: {
                  id: 'thread-1',
                  title: 'Test',
                  model: SYNTHETIC_RUNTIME_MODEL_ID,
                  cwd: '/workspace',
                  provider: options.provider ?? 'anthropic',
                  trustMode: 'byok',
                  createdAt: '2026-07-14T00:00:00Z',
                  updatedAt: '2026-07-14T00:00:00Z',
                  createdBy: 'vscode',
                  status: 'idle',
                },
              }
            : method === 'model/list'
              ? {
                  models: [
                    { id: SYNTHETIC_LOCAL_MODEL_ID, provider: 'ollama' },
                    { id: SYNTHETIC_LOCAL_MODEL_ID_SECONDARY, provider: 'lmstudio' },
                  ],
                }
              : method === 'thread/list'
                ? {
                    threads: [
                      {
                        id: 'thread-1',
                        title: 'Test',
                        model: SYNTHETIC_RUNTIME_MODEL_ID,
                        cwd: '/workspace',
                        provider: options.provider ?? 'anthropic',
                        trustMode: 'byok',
                        createdAt: '2026-07-14T00:00:00Z',
                        updatedAt: '2026-07-14T00:00:00Z',
                        createdBy: 'vscode',
                        status: 'idle',
                      },
                    ],
                  }
                : method === 'thread/read'
                  ? {
                      thread: {
                        id: 'thread-1',
                        title: 'Test',
                        model: SYNTHETIC_RUNTIME_MODEL_ID,
                        cwd: '/workspace',
                        provider: options.provider ?? 'anthropic',
                        trustMode: 'byok',
                        createdAt: '2026-07-14T00:00:00Z',
                        updatedAt: '2026-07-14T00:00:00Z',
                        createdBy: 'vscode',
                        status: 'idle',
                      },
                      messages: [{ role: 'user', text: 'Fix it' }],
                      ...(options.omitTranscriptTruncated === true
                        ? {}
                        : { transcriptTruncated: false }),
                    }
                  : method === 'turn/start' || method === 'turn/steer'
                    ? { turn: { id: 'turn-1', threadId: 'thread-1', status: 'running' } }
                    : method === 'shutdown' && options.shutdownResult !== undefined
                      ? options.shutdownResult
                      : { acknowledged: true };
      stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, result })}\n`);
      if (method === 'shutdown' && options.exitOnShutdown !== false) {
        setImmediate(() => activeChild?.emit('exit', 0, null));
      }
    }
  });

  const spawn = vi.fn(() => {
    const child = new EventEmitter() as EventEmitter & {
      stdin: PassThrough;
      stdout: PassThrough;
      stderr: PassThrough;
      kill: ReturnType<typeof vi.fn>;
    };
    child.stdin = stdin;
    child.stdout = stdout;
    child.stderr = stderr;
    child.kill = vi.fn(() => true);
    children.push(child);
    activeChild = child;
    return child;
  }) as unknown as SpawnLocalRuntime;

  return { spawn, requests, stdout, children };
}

describe('LocalRuntimeClient', () => {
  afterEach(() => vi.useRealTimers());

  it('rejects servers that can silently ignore security-sensitive turn controls', async () => {
    const runtime = fakeRuntime(4);
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });

    await expect(client.initialize()).rejects.toThrow('requires exactly protocol 7');
    await client.dispose();
  });

  it('rejects a future protocol until the extension explicitly supports it', async () => {
    const runtime = fakeRuntime(8);
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });

    await expect(client.initialize()).rejects.toThrow(
      'uses developer-session protocol 8; this extension requires exactly protocol 7',
    );
    await client.dispose();
  });

  it.each(['1.7.0', '1.7.1-beta.1', '0.1.0', 'not-semver'])(
    'rejects an incompatible owning CLI version %s even when protocol 7 is claimed',
    async (serverVersion) => {
      const runtime = fakeRuntime(7, { serverVersion });
      const client = new LocalRuntimeClient({
        cliPath: 'agi',
        cwd: '/workspace',
        clientVersion: '0.3.0',
        spawn: runtime.spawn,
      });

      await expect(client.initialize()).rejects.toThrow('version 1.7.1 or newer is required');
      await client.dispose();
    },
  );

  it('rejects a runtime that cannot carry approval decisions', async () => {
    const runtime = fakeRuntime(7, { approvals: false });
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });

    await expect(client.initialize()).rejects.toThrow('required developer-session protocol');
    await client.dispose();
  });

  it('gives an actionable upgrade error for the legacy CLI handshake', async () => {
    const runtime = fakeRuntime(7, { legacyInitialize: true });
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });

    await expect(client.initialize()).rejects.toThrow(
      'Update the AGI CLI or set agiWorkforce.cliPath to a current binary',
    );
    await client.dispose();
  });

  it('launches the configured CLI in the workspace and uses typed thread/turn methods', async () => {
    const runtime = fakeRuntime();
    const client = new LocalRuntimeClient({
      cliPath: '/opt/agi/bin/agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });

    const thread = await client.startThread({ cwd: '/workspace', title: 'Test' });
    const turn = await client.startTurn({
      threadId: thread.id,
      input: [{ type: 'text', text: 'Fix it', text_elements: [] }],
      cwd: '/workspace',
    });

    expect(runtime.spawn).toHaveBeenCalledWith(
      '/opt/agi/bin/agi',
      ['app-server'],
      expect.objectContaining({ cwd: '/workspace' }),
    );
    expect(runtime.requests.map((request) => request.method)).toEqual([
      'initialize',
      'thread/start',
      'turn/start',
    ]);
    expect(runtime.requests).toEqual(
      expect.arrayContaining([expect.objectContaining({ jsonrpc: '2.0', id: expect.any(Number) })]),
    );
    expect(turn.id).toBe('turn-1');
    await client.dispose();
  });

  it('surfaces a standard null-id JSON-RPC parse error from the runtime', async () => {
    const runtime = fakeRuntime(7, { ignoreMethods: ['initialize'] });
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });

    const initialization = client.initialize();
    runtime.stdout.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      })}\n`,
    );

    await expect(initialization).rejects.toMatchObject({
      name: 'LocalRuntimeProtocolError',
      code: -32700,
      message: 'Parse error',
    });
    await client.dispose();
  });

  it('forwards streamed notifications and rejects server errors', async () => {
    const runtime = fakeRuntime();
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });
    const notifications: string[] = [];
    client.onNotification((notification) => notifications.push(notification.method));
    await client.initialize();

    runtime.stdout.write(
      `${JSON.stringify({ method: 'turn/output_delta', params: { delta: 'hello' } })}\n`,
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(notifications).toEqual(['turn/output_delta']);

    await client.dispose();
  });

  it('validates developer-session events before exposing them to UI code', async () => {
    const runtime = fakeRuntime();
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });
    const deltas: string[] = [];
    client.onEvent((event) => {
      if (event.type === 'output_delta') deltas.push(event.delta);
    });
    await client.initialize();

    runtime.stdout.write(
      `${JSON.stringify({ method: 'turn/output_delta', params: { threadId: 't', turnId: 'r', delta: 'ok' } })}\n`,
    );
    runtime.stdout.write(
      `${JSON.stringify({ method: 'turn/output_delta', params: { threadId: 't', delta: 42 } })}\n`,
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(deltas).toEqual(['ok']);
    await client.dispose();
  });

  it('exposes canonical progress and tool execution events and ignores malformed envelopes', async () => {
    const runtime = fakeRuntime();
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });
    const events: Array<{ type: string; id?: string }> = [];
    client.onEvent((event) => {
      if (event.type === 'tool_execution_start' || event.type === 'tool_execution_end') {
        events.push({ type: event.type, id: event.toolCallId });
      }
      if (event.type === 'progress_update') {
        events.push({ type: event.type, id: event.progressId });
      }
    });
    await client.initialize();

    runtime.stdout.write(
      `${JSON.stringify({
        method: 'turn/agent_event',
        params: {
          schemaVersion: 3,
          sessionId: 'thread-1',
          turnId: 'turn-1',
          sequence: 0,
          emittedAtMs: 1_784_335_200_000,
          event: {
            type: 'tool-execution-start',
            toolCallId: 'tool-1',
            name: 'web_search',
            category: 'web-search',
            summary: 'Searching official sources',
            input: { query: 'AGI Workforce' },
          },
        },
      })}\n`,
    );
    runtime.stdout.write(
      `${JSON.stringify({
        method: 'turn/agent_event',
        params: {
          schemaVersion: 3,
          sessionId: 'thread-1',
          turnId: 'turn-1',
          sequence: 1,
          emittedAtMs: 1_784_335_200_100,
          event: {
            type: 'tool-execution-end',
            toolCallId: 'tool-1',
            name: 'web_search',
            output: { results: 4 },
            isError: false,
            elapsedMs: 100,
          },
        },
      })}\n`,
    );
    runtime.stdout.write(
      `${JSON.stringify({
        method: 'turn/agent_event',
        params: {
          schemaVersion: 3,
          sessionId: 'thread-1',
          turnId: 'turn-1',
          sequence: 2,
          emittedAtMs: 1_784_335_200_200,
          event: {
            type: 'progress-update',
            progressId: 'turn-work',
            summary: 'Preparing the response',
            detail: 'The agent is reviewing completed tool results.',
            status: 'running',
          },
        },
      })}\n`,
    );
    runtime.stdout.write(
      `${JSON.stringify({
        method: 'turn/agent_event',
        params: {
          schemaVersion: 3,
          sessionId: 'thread-1',
          turnId: 'turn-1',
          sequence: 3,
          emittedAtMs: 1_784_335_200_300,
          event: { type: 'tool-execution-start', toolCallId: 42 },
        },
      })}\n`,
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(events).toEqual([
      { type: 'tool_execution_start', id: 'tool-1' },
      { type: 'tool_execution_end', id: 'tool-1' },
      { type: 'progress_update', id: 'turn-work' },
    ]);
    await client.dispose();
  });

  it('emits MCP lifecycle status and ignores unrelated notifications without closing the stream', async () => {
    const runtime = fakeRuntime();
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });
    const events: string[] = [];
    client.onEvent((event) => events.push(event.type));
    await client.initialize();

    runtime.stdout.write(
      `${JSON.stringify({ method: 'mcp/loading', params: { threadId: 'thread-1' } })}\n`,
    );
    runtime.stdout.write(
      `${JSON.stringify({ method: 'future/status', params: { value: true } })}\n`,
    );
    runtime.stdout.write(
      `${JSON.stringify({ method: 'mcp/unavailable', params: { threadId: 'thread-1', message: 'timed out' } })}\n`,
    );
    runtime.stdout.write(
      `${JSON.stringify({ method: 'turn/output_delta', params: { threadId: 'thread-1', turnId: 'turn-1', delta: 'still running' } })}\n`,
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(events).toEqual(['mcp_status', 'mcp_status', 'output_delta']);
    await client.dispose();
  });

  it('exposes interrupted turns as terminal runtime events', async () => {
    const runtime = fakeRuntime();
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });
    const events: string[] = [];
    client.onEvent((event) => events.push(event.type));
    await client.initialize();
    runtime.stdout.write(
      `${JSON.stringify({ method: 'turn/interrupted', params: { threadId: 't', turnId: 'r', status: 'interrupted' } })}\n`,
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(events).toEqual(['turn_interrupted']);
    await client.dispose();
  });

  it('routes steering, cancellation, and approvals through the same runtime', async () => {
    const runtime = fakeRuntime();
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });

    await client.steerTurn({
      threadId: 'thread-1',
      expectedTurnId: 'turn-1',
      input: [{ type: 'text', text: 'Use the smaller change', text_elements: [] }],
    });
    await client.respondToApproval({
      threadId: 'thread-1',
      turnId: 'turn-1',
      requestId: 'approval-1',
      decision: 'approved_for_session',
    });
    await client.interruptTurn({ threadId: 'thread-1', turnId: 'turn-1' });

    expect(runtime.requests.map((request) => request.method)).toEqual([
      'initialize',
      'turn/steer',
      'approval/respond',
      'turn/interrupt',
    ]);
    await client.dispose();
  });

  it('reads and archives runtime-owned thread history', async () => {
    const runtime = fakeRuntime();
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });

    const page = await client.listThreads({ cwd: '/workspace', includeArchived: false });
    const history = await client.readThread('thread-1');
    await client.archiveThread('thread-1');

    expect(page.threads).toHaveLength(1);
    expect(history.messages).toEqual([{ role: 'user', text: 'Fix it' }]);
    expect(history.transcriptTruncated).toBe(false);
    expect(runtime.requests.map((request) => request.method)).toEqual([
      'initialize',
      'thread/list',
      'thread/read',
      'thread/archive',
    ]);
    await client.dispose();
  });

  it('rejects thread history that omits the protocol-v7 truncation signal', async () => {
    const runtime = fakeRuntime(7, { omitTranscriptTruncated: true });
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });

    await expect(client.readThread('thread-1')).rejects.toThrow();
    await client.dispose();
  });

  it.each([`${'p'.repeat(201)}`, 'anthropic\nspoofed'])(
    'rejects unsafe provider metadata from runtime IPC',
    async (provider) => {
      const runtime = fakeRuntime(7, { provider });
      const client = new LocalRuntimeClient({
        cliPath: 'agi',
        cwd: '/workspace',
        clientVersion: '0.3.0',
        spawn: runtime.spawn,
      });

      await expect(client.listThreads({ cwd: '/workspace' })).rejects.toThrow();
      await client.dispose();
    },
  );

  it('discovers local model ids and providers through the shared runtime', async () => {
    const runtime = fakeRuntime();
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });

    await expect(client.listLocalModels()).resolves.toEqual({
      models: [
        { id: SYNTHETIC_LOCAL_MODEL_ID, provider: 'ollama' },
        { id: SYNTHETIC_LOCAL_MODEL_ID_SECONDARY, provider: 'lmstudio' },
      ],
    });
    expect(runtime.requests.map((request) => request.method)).toEqual(['initialize', 'model/list']);
    await client.dispose();
  });

  it('resumes a persisted thread through the runtime owner', async () => {
    const runtime = fakeRuntime();
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });

    const thread = await client.resumeThread('thread-1');

    expect(thread.id).toBe('thread-1');
    expect(runtime.requests.map((request) => request.method)).toEqual([
      'initialize',
      'thread/resume',
    ]);
    await client.dispose();
  });

  it('launches a replacement app-server after the workspace process exits', async () => {
    const runtime = fakeRuntime();
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });

    await client.initialize();
    runtime.children[0]?.emit('exit', 1, null);
    const page = await client.listThreads({ cwd: '/workspace' });

    expect(page.threads).toHaveLength(1);
    expect(runtime.spawn).toHaveBeenCalledTimes(2);
    await client.dispose();
  });

  it('restarts the owned process in place and waits for the current CLI path to initialize', async () => {
    const runtime = fakeRuntime();
    let cliPath = '/opt/agi/bin/agi-old';
    const client = new LocalRuntimeClient({
      cliPath: () => cliPath,
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });
    await client.initialize();
    cliPath = '/opt/agi/bin/agi-current';

    await client.restart();

    expect(runtime.spawn).toHaveBeenNthCalledWith(
      1,
      '/opt/agi/bin/agi-old',
      ['app-server'],
      expect.any(Object),
    );
    expect(runtime.spawn).toHaveBeenNthCalledWith(
      2,
      '/opt/agi/bin/agi-current',
      ['app-server'],
      expect.any(Object),
    );
    expect(runtime.requests.map((request) => request.method)).toEqual([
      'initialize',
      'shutdown',
      'initialize',
    ]);
    await client.dispose();
  });

  it('preserves existing event subscriptions across an in-place restart', async () => {
    const runtime = fakeRuntime();
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });
    const output = vi.fn();
    client.onEvent((event) => {
      if (event.type === 'output_delta') output(event.delta);
    });
    await client.initialize();

    await client.restart();
    runtime.stdout.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        method: 'turn/output_delta',
        params: { threadId: 'thread-1', turnId: 'turn-1', delta: 'after restart' },
      })}\n`,
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(output).toHaveBeenCalledWith('after restart');
    await client.dispose();
  });

  it('notifies active UI adapters when the app-server disconnects', async () => {
    const runtime = fakeRuntime();
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });
    const disconnected = vi.fn();
    client.onEvent((event) => {
      if (event.type === 'runtime_disconnected') disconnected(event.error);
    });
    await client.initialize();

    runtime.children[0]?.emit('exit', 1, null);

    expect(disconnected).toHaveBeenCalledWith(expect.stringContaining('exited'));
  });

  it('treats a closed stdout stream as a runtime disconnect', async () => {
    const runtime = fakeRuntime();
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });
    const disconnected = vi.fn();
    client.onEvent((event) => {
      if (event.type === 'runtime_disconnected') disconnected(event.error);
    });
    await client.initialize();

    runtime.stdout.end();
    await new Promise((resolve) => setImmediate(resolve));

    expect(disconnected).toHaveBeenCalledWith(expect.stringContaining('closed stdout'));
    const child = runtime.children[0] as EventEmitter & { kill: ReturnType<typeof vi.fn> };
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it('force-terminates a runtime that does not acknowledge shutdown', async () => {
    const runtime = fakeRuntime(7, { ignoreMethods: ['shutdown'] });
    const terminateProcessTree = vi.fn(async (child: ChildProcessWithoutNullStreams) => {
      child.emit('exit', null, 'SIGKILL');
    });
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
      terminateProcessTree,
    });
    await client.initialize();
    vi.useFakeTimers();

    const disposing = client.dispose();
    await vi.advanceTimersByTimeAsync(7_000);
    await disposing;

    expect(terminateProcessTree).toHaveBeenCalledOnce();
  });

  it('validates the shutdown acknowledgment before trusting a graceful exit', async () => {
    const runtime = fakeRuntime(7, {
      exitOnShutdown: false,
      shutdownResult: { acknowledged: 'yes' },
    });
    const terminateProcessTree = vi.fn(async (child: ChildProcessWithoutNullStreams) => {
      child.emit('exit', null, 'SIGKILL');
    });
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
      terminateProcessTree,
    });
    await client.initialize();

    await client.dispose();

    expect(terminateProcessTree).toHaveBeenCalledOnce();
  });

  it('does not finish graceful disposal until the acknowledged child actually exits', async () => {
    const runtime = fakeRuntime(7, { exitOnShutdown: false });
    const terminateProcessTree = vi.fn(async () => undefined);
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
      terminateProcessTree,
    });
    await client.initialize();
    let settled = false;

    const disposing = client.dispose().then(() => {
      settled = true;
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(settled).toBe(false);
    expect(terminateProcessTree).not.toHaveBeenCalled();
    runtime.children[0]?.emit('exit', 0, null);
    await disposing;
    expect(settled).toBe(true);
  });

  it('notifies active UI adapters synchronously when configuration disposes the client', async () => {
    const runtime = fakeRuntime();
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });
    const disconnected = vi.fn();
    client.onEvent((event) => {
      if (event.type === 'runtime_disconnected') disconnected(event.error);
    });
    await client.initialize();

    const disposing = client.dispose();

    expect(disconnected).toHaveBeenCalledWith(expect.stringContaining('restarting'));
    await disposing;
  });
});
