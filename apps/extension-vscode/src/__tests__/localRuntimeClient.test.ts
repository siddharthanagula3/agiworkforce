import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalRuntimeClient, type SpawnLocalRuntime } from '../integrations/localRuntimeClient';

function fakeRuntime(
  protocolVersion = 3,
  options: {
    approvals?: boolean;
    ignoreMethods?: readonly string[];
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
          ? {
              serverInfo: { name: 'agiworkforce-app-server', title: 'AGI', version: '0.1.0' },
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
              },
            }
          : method === 'thread/start' || method === 'thread/resume'
            ? {
                thread: {
                  id: 'thread-1',
                  title: 'Test',
                  model: 'model-1',
                  cwd: '/workspace',
                  createdAt: '2026-07-14T00:00:00Z',
                  updatedAt: '2026-07-14T00:00:00Z',
                  createdBy: 'vscode',
                  status: 'idle',
                },
              }
            : method === 'thread/list'
              ? {
                  threads: [
                    {
                      id: 'thread-1',
                      title: 'Test',
                      model: 'model-1',
                      cwd: '/workspace',
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
                      model: 'model-1',
                      cwd: '/workspace',
                      createdAt: '2026-07-14T00:00:00Z',
                      updatedAt: '2026-07-14T00:00:00Z',
                      createdBy: 'vscode',
                      status: 'idle',
                    },
                    messages: [{ role: 'user', text: 'Fix it' }],
                  }
                : method === 'turn/start' || method === 'turn/steer'
                  ? { turn: { id: 'turn-1', threadId: 'thread-1', status: 'running' } }
                  : { acknowledged: true };
      stdout.write(`${JSON.stringify({ id: request.id, result })}\n`);
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
    return child;
  }) as unknown as SpawnLocalRuntime;

  return { spawn, requests, stdout, children };
}

describe('LocalRuntimeClient', () => {
  afterEach(() => vi.useRealTimers());

  it('rejects servers that can silently ignore security-sensitive turn controls', async () => {
    const runtime = fakeRuntime(2);
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });

    await expect(client.initialize()).rejects.toThrow('version 3 or newer is required');
    client.dispose();
  });

  it('rejects a runtime that cannot carry approval decisions', async () => {
    const runtime = fakeRuntime(3, { approvals: false });
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });

    await expect(client.initialize()).rejects.toThrow('required developer-session protocol');
    client.dispose();
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
    expect(turn.id).toBe('turn-1');
    client.dispose();
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

    client.dispose();
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
    client.dispose();
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
    client.dispose();
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
    client.dispose();
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
    client.dispose();
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
    expect(runtime.requests.map((request) => request.method)).toEqual([
      'initialize',
      'thread/list',
      'thread/read',
      'thread/archive',
    ]);
    client.dispose();
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
    client.dispose();
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
    client.dispose();
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
    const runtime = fakeRuntime(3, { ignoreMethods: ['shutdown'] });
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });
    await client.initialize();
    vi.useFakeTimers();

    client.dispose();
    await vi.advanceTimersByTimeAsync(1_000);

    const child = runtime.children[0] as EventEmitter & { kill: ReturnType<typeof vi.fn> };
    expect(child.kill).toHaveBeenCalledOnce();
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

    client.dispose();

    expect(disconnected).toHaveBeenCalledWith(expect.stringContaining('restarted'));
  });
});
