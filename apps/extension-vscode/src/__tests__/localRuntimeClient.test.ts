import { EventEmitter } from 'node:events';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalRuntimeClient, type SpawnLocalRuntime } from '../integrations/localRuntimeClient';
import { AGENT_EVENT_SCHEMA_VERSION } from '@agiworkforce/types';
import {
  SYNTHETIC_LOCAL_MODEL_ID,
  SYNTHETIC_LOCAL_MODEL_ID_SECONDARY,
} from './catalogModelFixtures';

const SYNTHETIC_RUNTIME_MODEL_ID = 'fixture-runtime-model';

// One canonical answer per protocol 8 method, so every client method is
// exercised against the shape the CLI documents rather than a hand-written
// object per test.
const V8_RESULTS = {
  'account/status': {
    signedIn: true,
    email: 'developer@example.com',
    tier: 'max',
    balanceCredits: 120.5,
    cached: true,
    source: 'cli',
  },
  'account/login': {
    loginId: 'login-1',
    verificationUrl: 'https://agiworkforce.com/auth/device',
    userCode: 'ABCD-EFGH',
    expiresAt: '2026-09-14T12:15:00Z',
  },
  'account/login/wait': {
    outcome: 'completed',
    account: {
      signedIn: true,
      email: 'developer@example.com',
      tier: 'max',
      cached: false,
      source: 'cli',
    },
  },
  'account/token': { token: 'fixture-token', expiresAt: '2026-09-14T13:00:00Z' },
  'context/instructions': {
    files: [
      { path: '/workspace/AGENTS.md', kind: 'AGENTS.md', bytes: 42, root: '/workspace' },
      {
        path: '/workspace/apps/web/CLAUDE.md',
        kind: 'CLAUDE.md',
        bytes: 12,
        root: '/workspace/apps/web',
      },
    ],
    projectRoot: '/workspace',
    truncated: false,
  },
  'skills/list': {
    skills: [
      {
        name: 'release-notes',
        description: 'Draft release notes',
        scope: 'user',
        path: '/home/dev/.agiworkforce/skills/release-notes/SKILL.md',
        enabled: true,
        consented: true,
      },
    ],
  },
  'skills/setEnabled': {
    skills: [
      {
        name: 'release-notes',
        description: 'Draft release notes',
        scope: 'user',
        path: '/home/dev/.agiworkforce/skills/release-notes/SKILL.md',
        enabled: false,
        consented: true,
      },
    ],
  },
  'skills/consent': { consented: true, path: '/workspace/.agiworkforce/skills/.consent' },
  'plugins/list': {
    plugins: [
      {
        id: 'reviewer',
        name: 'Reviewer',
        version: '1.2.0',
        enabled: true,
        source: 'user',
        path: '/home/dev/.agiworkforce/plugins/reviewer',
        format: 'agi',
      },
    ],
  },
  'plugins/setEnabled': {
    plugins: [
      {
        id: 'reviewer',
        name: 'Reviewer',
        version: '1.2.0',
        enabled: false,
        source: 'user',
        path: '/home/dev/.agiworkforce/plugins/reviewer',
        format: 'agi',
      },
    ],
  },
  'mcp/list': {
    servers: [
      {
        name: 'github',
        transport: 'http',
        scope: 'user',
        status: 'needs_auth',
        url: 'https://api.githubcopilot.com/mcp',
      },
    ],
  },
  'mcp/login': { name: 'github', status: 'authorized' },
  'hooks/list': {
    hooks: [
      {
        event: 'PreToolUse',
        command: './scripts/audit.sh',
        scope: 'user',
        trusted: true,
        source: '/home/dev/.agiworkforce/hooks.json',
      },
    ],
  },
  'settings/read': {
    defaultModel: SYNTHETIC_RUNTIME_MODEL_ID,
    defaultEffort: 'high',
    permissionMode: 'ask',
    userInstructions: 'Be brief',
    userInstructionsPath: '/home/dev/.agiworkforce/instructions.md',
    projectInstructionsPath: '/workspace/.agiworkforce/instructions.md',
    configPath: '/home/dev/.agiworkforce/config.toml',
  },
  'settings/write': {
    defaultModel: SYNTHETIC_RUNTIME_MODEL_ID,
    defaultEffort: 'low',
    permissionMode: 'plan',
    userInstructionsPath: '/home/dev/.agiworkforce/instructions.md',
    projectInstructionsPath: '/workspace/.agiworkforce/instructions.md',
    configPath: '/home/dev/.agiworkforce/config.toml',
  },
  'commands/list': {
    commands: [
      {
        name: 'skills',
        description: 'List skills',
        source: 'builtin',
        aliases: [],
        runnable: true,
      },
    ],
  },
  'commands/run': { kind: 'skills', text: 'release-notes', payload: { skills: [] } },
} as const;

// A shape no v8 method declares: every client method must reject it rather
// than hand an unvalidated object to the UI.
const MALFORMED_V8_RESULT = { unexpected: 'shape' };

function fakeRuntime(
  protocolVersion = 8,
  options: {
    approvals?: boolean;
    ignoreMethods?: readonly string[];
    legacyInitialize?: boolean;
    omitTranscriptTruncated?: boolean;
    provider?: string;
    serverVersion?: string;
    exitOnShutdown?: boolean;
    shutdownResult?: unknown;
    malformedV8?: boolean;
    initializeExtra?: Record<string, unknown>;
    initializeError?: { code: number; message: string; data?: unknown };
    trustMode?: string;
    createdBy?: string;
    threadStatus?: string;
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
                ...options.initializeExtra,
              }
          : method === 'thread/start' || method === 'thread/resume'
            ? {
                thread: {
                  id: 'thread-1',
                  title: 'Test',
                  model: SYNTHETIC_RUNTIME_MODEL_ID,
                  cwd: '/workspace',
                  provider: options.provider ?? 'anthropic',
                  trustMode: options.trustMode ?? 'byok',
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
                        trustMode: options.trustMode ?? 'byok',
                        createdAt: '2026-07-14T00:00:00Z',
                        updatedAt: '2026-07-14T00:00:00Z',
                        createdBy: options.createdBy ?? 'vscode',
                        status: options.threadStatus ?? 'idle',
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
                        trustMode: options.trustMode ?? 'byok',
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
                      : typeof method === 'string' && method in V8_RESULTS
                        ? options.malformedV8 === true
                          ? MALFORMED_V8_RESULT
                          : V8_RESULTS[method as keyof typeof V8_RESULTS]
                        : { acknowledged: true };
      const reply =
        method === 'initialize' && options.initializeError !== undefined
          ? { jsonrpc: '2.0', id: request.id, error: options.initializeError }
          : { jsonrpc: '2.0', id: request.id, result };
      stdout.write(`${JSON.stringify(reply)}\n`);
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

    await expect(client.initialize()).rejects.toThrow('requires exactly protocol 8');
    await client.dispose();
  });

  it('rejects a future protocol until the extension explicitly supports it', async () => {
    const runtime = fakeRuntime(9);
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });

    await expect(client.initialize()).rejects.toThrow(
      'uses developer-session protocol 9; this extension requires exactly protocol 8',
    );
    await client.dispose();
  });

  it.each(['1.7.0', '1.7.1-beta.1', '0.1.0', 'not-semver'])(
    'rejects an incompatible owning CLI version %s even when protocol 8 is claimed',
    async (serverVersion) => {
      const runtime = fakeRuntime(8, { serverVersion });
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

  it('names the CLI as the side to update when an older server answers protocol 7', async () => {
    const runtime = fakeRuntime(7);
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });

    await expect(client.initialize()).rejects.toThrow(
      'uses developer-session protocol 7; this extension requires exactly protocol 8. Install a compatible AGI CLI',
    );
    await client.dispose();
  });

  it.each([
    [[7], 7, 'Update the AGI CLI or set agiWorkforce.cliPath to a current binary.'],
    [[10, 9], 9, 'Update AGI for VS Code.'],
  ])(
    'turns a structured version refusal from a server speaking %j into the side to update',
    async (supportedProtocolVersions, minimumProtocolVersion, action) => {
      const runtime = fakeRuntime(8, {
        initializeError: {
          code: -32005,
          message: 'Client requested developer-session protocol 8',
          data: {
            requestedProtocolVersion: 8,
            supportedProtocolVersions,
            minimumProtocolVersion,
          },
        },
      });
      const client = new LocalRuntimeClient({
        cliPath: 'agi',
        cwd: '/workspace',
        clientVersion: '0.3.0',
        spawn: runtime.spawn,
      });

      await expect(client.initialize()).rejects.toThrow(
        `this extension requires protocol 8. ${action}`,
      );
      await client.dispose();
    },
  );

  // Both sides of the negotiated version come from the shared constant: a bump
  // is a contract change, and this suite should follow it rather than pin a
  // number that quietly becomes the wrong one.
  it.each([
    [AGENT_EVENT_SCHEMA_VERSION + 1, 'Update AGI for VS Code.'],
    [AGENT_EVENT_SCHEMA_VERSION - 1, 'Update the AGI CLI'],
  ])('refuses a handshake declaring agent event schema %i', async (schemaVersion, action) => {
    const runtime = fakeRuntime(8, { initializeExtra: { agentEventSchemaVersion: schemaVersion } });
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });

    await expect(client.initialize()).rejects.toThrow(
      `streams agent events in schema ${schemaVersion}; this extension reads schema ${AGENT_EVENT_SCHEMA_VERSION}. ${action}`,
    );
    await client.dispose();
  });

  it('accepts a handshake that declares the schema and minimum it negotiates', async () => {
    const runtime = fakeRuntime(8, {
      initializeExtra: {
        agentEventSchemaVersion: AGENT_EVENT_SCHEMA_VERSION,
        minimumProtocolVersion: 7,
      },
    });
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });

    await expect(client.initialize()).resolves.toMatchObject({
      agentEventSchemaVersion: AGENT_EVENT_SCHEMA_VERSION,
      minimumProtocolVersion: 7,
    });
    await client.dispose();
  });

  it('reads a trust mode it does not know as unknown rather than dropping the thread', async () => {
    const runtime = fakeRuntime(8, { trustMode: 'sovereign_cloud' });
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });

    const listed = await client.listThreads({});
    expect(listed.threads.map((thread) => thread.trustMode)).toEqual(['unknown']);
    await client.dispose();
  });

  it('reads an origin and a status it does not know as unknown, on the same terms', async () => {
    const runtime = fakeRuntime(8, { createdBy: 'phone', threadStatus: 'hibernating' });
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });

    const listed = await client.listThreads({});
    expect(listed.threads.map((thread) => thread.createdBy)).toEqual(['unknown']);
    expect(listed.threads.map((thread) => thread.status)).toEqual(['unknown']);
    await client.dispose();
  });

  it('rejects a runtime that cannot carry approval decisions', async () => {
    const runtime = fakeRuntime(8, { approvals: false });
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
    const runtime = fakeRuntime(8, { legacyInitialize: true });
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
    const runtime = fakeRuntime(8, { ignoreMethods: ['initialize'] });
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
          schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
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
          schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
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
          schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
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
          schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
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

  it('skips an agent event kind it does not know and files an unknown tool category under other', async () => {
    const runtime = fakeRuntime();
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });
    const events: Array<{ type: string; category?: string }> = [];
    client.onEvent((event) =>
      events.push(
        event.type === 'tool_execution_start'
          ? { type: event.type, category: event.category }
          : { type: event.type },
      ),
    );
    await client.initialize();

    const envelope = (sequence: number, event: Record<string, unknown>) =>
      `${JSON.stringify({
        method: 'turn/agent_event',
        params: {
          schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
          sessionId: 'thread-1',
          turnId: 'turn-1',
          sequence,
          emittedAtMs: 1_784_335_200_000 + sequence,
          event,
        },
      })}\n`;
    runtime.stdout.write(envelope(0, { type: 'hologram-rendered', frame: 1 }));
    runtime.stdout.write(
      envelope(1, {
        type: 'tool-execution-start',
        toolCallId: 'tool-1',
        name: 'teleport',
        category: 'teleportation',
        summary: 'Teleporting',
        input: {},
      }),
    );
    runtime.stdout.write(
      `${JSON.stringify({ method: 'turn/output_delta', params: { threadId: 'thread-1', turnId: 'turn-1', delta: 'still here' } })}\n`,
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(events).toEqual([
      { type: 'tool_execution_start', category: 'other' },
      { type: 'output_delta' },
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

  it('keeps a failed turn whose failure names a plan-first code, and one it has never seen', async () => {
    const runtime = fakeRuntime();
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });
    const failures: Array<{ code: string; action: string } | null | undefined> = [];
    client.onEvent((event) => {
      if (event.type === 'turn_failed') failures.push(event.failure);
    });
    await client.initialize();
    const terminal = {
      threadId: 't',
      turnId: 'r',
      status: 'failed',
      response: '',
      inputTokens: 0,
      outputTokens: 0,
    };
    runtime.stdout.write(
      `${JSON.stringify({
        method: 'turn/failed',
        params: {
          ...terminal,
          error: 'No AGI Workforce session.',
          failure: {
            code: 'account_signed_out',
            message: 'No AGI Workforce session.',
            retryable: false,
            action: 'sign_in_account',
          },
        },
      })}\n`,
    );
    runtime.stdout.write(
      `${JSON.stringify({
        method: 'turn/failed',
        params: {
          ...terminal,
          error: 'Something new.',
          failure: {
            code: 'a_code_from_a_newer_cli',
            message: 'Something new.',
            retryable: false,
            action: 'an_action_from_a_newer_cli',
          },
        },
      })}\n`,
    );
    runtime.stdout.write(
      `${JSON.stringify({ method: 'turn/failed', params: { ...terminal, error: 'Malformed.', failure: { code: 'unknown' } } })}\n`,
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(failures).toEqual([
      expect.objectContaining({ code: 'account_signed_out', action: 'sign_in_account' }),
      expect.objectContaining({ code: 'unknown', action: 'none' }),
      null,
    ]);
    await client.dispose();
  });

  it('carries a wait and a reference the runtime sent, and leaves both out when it sent neither', async () => {
    const runtime = fakeRuntime();
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });
    const failures: Array<Record<string, unknown> | null | undefined> = [];
    client.onEvent((event) => {
      if (event.type === 'turn_failed')
        failures.push(event.failure as Record<string, unknown> | null | undefined);
    });
    await client.initialize();
    const terminal = {
      threadId: 't',
      turnId: 'r',
      status: 'failed',
      response: '',
      inputTokens: 0,
      outputTokens: 0,
    };
    const failure = {
      code: 'provider_rate_limited',
      message: 'Rate limited.',
      retryable: true,
      action: 'retry',
    };
    runtime.stdout.write(
      `${JSON.stringify({
        method: 'turn/failed',
        params: {
          ...terminal,
          error: 'Rate limited.',
          failure: { ...failure, retryAfterSeconds: 45, requestId: 'req_7f3a' },
        },
      })}\n`,
    );
    // A runtime built before the fields existed sends the same failure without
    // them, and must still parse rather than dropping the whole turn.
    runtime.stdout.write(
      `${JSON.stringify({
        method: 'turn/failed',
        params: { ...terminal, error: 'Rate limited.', failure },
      })}\n`,
    );
    // A figure no sentence should be built on is refused here rather than
    // reaching the reader as "try again in 11 days".
    runtime.stdout.write(
      `${JSON.stringify({
        method: 'turn/failed',
        params: {
          ...terminal,
          error: 'Rate limited.',
          failure: { ...failure, retryAfterSeconds: -5, requestId: '' },
        },
      })}\n`,
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(failures[0]).toMatchObject({ retryAfterSeconds: 45, requestId: 'req_7f3a' });
    expect(failures[1]).toMatchObject({ code: 'provider_rate_limited' });
    expect(failures[1]?.['retryAfterSeconds']).toBeUndefined();
    expect(failures[1]?.['requestId']).toBeUndefined();
    expect(failures[2]?.['retryAfterSeconds']).toBeUndefined();
    expect(failures[2]?.['requestId']).toBeUndefined();
    await client.dispose();
  });

  it('carries the risk the runtime classified, and stays silent for one that classified none', async () => {
    const runtime = fakeRuntime();
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });
    const approvals: Array<Record<string, unknown>> = [];
    client.onEvent((event) => {
      if (event.type === 'approval_requested')
        approvals.push(event as unknown as Record<string, unknown>);
    });
    await client.initialize();
    const request = {
      threadId: 't',
      turnId: 'r',
      requestId: 'approval-1',
      kind: 'Exec',
      summary: 'Allow this command?',
      detail: 'rm -rf build',
    };
    runtime.stdout.write(
      `${JSON.stringify({
        method: 'approval/requested',
        params: { ...request, riskLevel: 'high', reversible: false },
      })}\n`,
    );
    // An older runtime sends the four fields it always sent; the card has to
    // keep working and say the risk was not rated.
    runtime.stdout.write(`${JSON.stringify({ method: 'approval/requested', params: request })}\n`);
    // A level this build does not know is not a level it may show.
    runtime.stdout.write(
      `${JSON.stringify({
        method: 'approval/requested',
        params: { ...request, riskLevel: 'catastrophic', reversible: true },
      })}\n`,
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(approvals[0]).toMatchObject({ riskLevel: 'high', reversible: false });
    expect(approvals[1]?.['riskLevel']).toBeUndefined();
    expect(approvals[1]?.['reversible']).toBeUndefined();
    expect(approvals[2]?.['riskLevel']).toBeUndefined();
    expect(approvals[2]?.['reversible']).toBe(true);
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

  it('deletes a thread only on a runtime that says it can', async () => {
    const capabilities = {
      threads: true,
      turns: true,
      streaming: true,
      approvals: true,
      tools: true,
      mcp: true,
      checkpoints: false,
      worktrees: false,
      models: true,
    };
    const capable = fakeRuntime(8, {
      initializeExtra: { capabilities: { ...capabilities, threadDelete: true } },
    });
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: capable.spawn,
    });
    await client.deleteThread('thread-1');
    expect(capable.requests.map((request) => request.method)).toEqual([
      'initialize',
      'thread/delete',
    ]);
    expect(capable.requests[1]?.params).toEqual({ threadId: 'thread-1' });
    await client.dispose();

    const older = fakeRuntime();
    const olderClient = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: older.spawn,
    });
    await expect(olderClient.deleteThread('thread-1')).rejects.toThrow(/cannot delete/u);
    expect(older.requests.map((request) => request.method)).toEqual(['initialize']);
    await olderClient.dispose();
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
    const runtime = fakeRuntime(8, { omitTranscriptTruncated: true });
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
      const runtime = fakeRuntime(8, { provider });
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

  it('asks the host to re-resolve reachability only when told to refresh', async () => {
    const runtime = fakeRuntime();
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });

    await client.listLocalModels();
    await client.listLocalModels({ refresh: true });

    expect(
      runtime.requests
        .filter((request) => request['method'] === 'model/list')
        .map((request) => request['params']),
    ).toEqual([{}, { refresh: true }]);
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
    const runtime = fakeRuntime(8, { ignoreMethods: ['shutdown'] });
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
    const runtime = fakeRuntime(8, {
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
    const runtime = fakeRuntime(8, { exitOnShutdown: false });
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
  it('names the missing binary, the setting, and the required version on ENOENT', async () => {
    const enoent = Object.assign(new Error('spawn agi ENOENT'), { code: 'ENOENT' });
    const spawn = vi.fn(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdin: PassThrough;
        stdout: PassThrough;
        stderr: PassThrough;
        pid?: number;
        kill: () => boolean;
      };
      child.stdin = new PassThrough();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = () => true;
      setImmediate(() => child.emit('error', enoent));
      return child as unknown as ChildProcessWithoutNullStreams;
    }) as unknown as SpawnLocalRuntime;

    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn,
    });

    await expect(client.initialize()).rejects.toThrow(/AGI_CLI_NOT_FOUND/u);
    await expect(client.initialize()).rejects.toThrow(/agiWorkforce\.cliPath/u);
    await expect(client.initialize()).rejects.toThrow(/1\.7\.1/u);
    await expect(client.initialize()).rejects.toThrow(/not on the PATH/u);
  });

  it('says the path does not exist when the setting points at a file', async () => {
    const enoent = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });
    const spawn = vi.fn(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdin: PassThrough;
        stdout: PassThrough;
        stderr: PassThrough;
        kill: () => boolean;
      };
      child.stdin = new PassThrough();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = () => true;
      setImmediate(() => child.emit('error', enoent));
      return child as unknown as ChildProcessWithoutNullStreams;
    }) as unknown as SpawnLocalRuntime;

    const client = new LocalRuntimeClient({
      cliPath: '/opt/missing/agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn,
    });

    await expect(client.initialize()).rejects.toThrow(/No file exists at "\/opt\/missing\/agi"/u);
  });

  it('refuses an empty cliPath with a message that names the setting', async () => {
    const client = new LocalRuntimeClient({
      cliPath: '   ',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: vi.fn() as unknown as SpawnLocalRuntime,
    });

    await expect(client.initialize()).rejects.toThrow(/agiWorkforce\.cliPath is empty/u);
  });

  it('explains an unrunnable binary instead of surfacing a bare EACCES', async () => {
    const denied = Object.assign(new Error('spawn EACCES'), { code: 'EACCES' });
    const spawn = vi.fn(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdin: PassThrough;
        stdout: PassThrough;
        stderr: PassThrough;
        kill: () => boolean;
      };
      child.stdin = new PassThrough();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = () => true;
      setImmediate(() => child.emit('error', denied));
      return child as unknown as ChildProcessWithoutNullStreams;
    }) as unknown as SpawnLocalRuntime;

    const client = new LocalRuntimeClient({
      cliPath: '/opt/agi/agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn,
    });

    await expect(client.initialize()).rejects.toThrow(/AGI_CLI_NOT_EXECUTABLE/u);
    await expect(client.initialize()).rejects.toThrow(/execute permission/u);
  });
  it('validates every protocol 8 response against its schema before returning it', async () => {
    const runtime = fakeRuntime();
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });

    expect(await client.accountStatus()).toMatchObject({ signedIn: true, source: 'cli' });
    const login = await client.startAccountLogin();
    expect(login.loginId).toBe('login-1');
    expect(await client.waitForAccountLogin(login.loginId, 5_000)).toMatchObject({
      outcome: 'completed',
    });
    expect((await client.accountToken()).token).toBe('fixture-token');
    const instructions = await client.contextInstructions('/workspace/apps/web');
    expect(instructions.files.map((file) => file.kind)).toEqual(['AGENTS.md', 'CLAUDE.md']);
    expect((await client.listSkills()).skills[0]?.scope).toBe('user');
    expect((await client.setSkillEnabled('release-notes', false)).skills[0]?.enabled).toBe(false);
    expect(await client.setProjectSkillConsent(true)).toMatchObject({ consented: true });
    expect((await client.listPlugins()).plugins[0]?.id).toBe('reviewer');
    expect((await client.setPluginEnabled('reviewer', false)).plugins[0]?.enabled).toBe(false);
    expect((await client.listMcpServers()).servers[0]?.status).toBe('needs_auth');
    expect(await client.loginMcpServer('github', 5_000)).toMatchObject({ status: 'authorized' });
    expect((await client.listHooks()).hooks[0]?.scope).toBe('user');
    expect((await client.readSettings()).permissionMode).toBe('ask');
    expect((await client.writeSettings({ defaultEffort: 'low' })).defaultEffort).toBe('low');
    expect((await client.listCommands()).commands[0]?.runnable).toBe(true);
    expect(await client.runCommand('skills')).toMatchObject({ kind: 'skills' });
    await expect(client.accountLogout()).resolves.toBeUndefined();

    const sent = runtime.requests.map((request) => request.method);
    expect(sent).toContain('account/status');
    expect(sent).toContain('settings/write');
    expect(
      runtime.requests.find((request) => request.method === 'initialize')?.params,
    ).toMatchObject({ protocolVersion: 8 });

    await client.dispose();
  });

  it('rejects a protocol 8 answer that does not match its declared shape', async () => {
    const runtime = fakeRuntime(8, { malformedV8: true });
    const client = new LocalRuntimeClient({
      cliPath: 'agi',
      cwd: '/workspace',
      clientVersion: '0.3.0',
      spawn: runtime.spawn,
    });

    await expect(client.accountStatus()).rejects.toThrow();
    await expect(client.accountToken()).rejects.toThrow();
    await expect(client.contextInstructions()).rejects.toThrow();
    await expect(client.listSkills()).rejects.toThrow();
    await expect(client.listPlugins()).rejects.toThrow();
    await expect(client.listMcpServers()).rejects.toThrow();
    await expect(client.listHooks()).rejects.toThrow();
    await expect(client.readSettings()).rejects.toThrow();
    await expect(client.listCommands()).rejects.toThrow();
    await expect(client.runCommand('skills')).rejects.toThrow();

    await client.dispose();
  });
});
