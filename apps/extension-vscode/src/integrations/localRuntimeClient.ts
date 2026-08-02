import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { type Readable, type Writable } from 'node:stream';
import { z } from 'zod';
import type {
  AppServerCapabilities,
  AppServerNotification,
  ApprovalResponseParams,
  InitializeResponse,
  LocalModelListResponse,
  ThreadListParams,
  ThreadListResponse,
  ThreadReadResponse,
  ThreadStartParams,
  ThreadSummary,
  TurnInterruptParams,
  TurnSteerParams,
  TurnStartParams,
  TurnSummary,
} from '@agiworkforce/types';

const MAX_LINE_BYTES = 4 * 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const SHUTDOWN_ACK_TIMEOUT_MS = 7_000;
const SHUTDOWN_EXIT_TIMEOUT_MS = 2_000;
const HARD_KILL_TIMEOUT_MS = 2_000;
const SUPPORTED_PROTOCOL_VERSION = 7;
const MINIMUM_SUPPORTED_CLI_VERSION = [1, 7, 1] as const;
const MINIMUM_SUPPORTED_CLI_VERSION_LABEL = MINIMUM_SUPPORTED_CLI_VERSION.join('.');
const AGENT_EVENT_SCHEMA_VERSION = 3;

const errorSchema = z.object({
  code: z.number().int(),
  message: z.string(),
  data: z.unknown().optional(),
});

const responseSchema = z.object({
  jsonrpc: z.literal('2.0').optional(),
  id: z.union([z.string(), z.number(), z.null()]),
  result: z.unknown().optional(),
  error: errorSchema.optional(),
});

const acknowledgedResponseSchema = z.object({ acknowledged: z.literal(true) }).strict();

const notificationSchema = z.object({
  jsonrpc: z.literal('2.0').optional(),
  method: z.string().min(1),
  params: z.unknown().optional(),
});

const capabilitiesSchema = z.object({
  threads: z.boolean(),
  turns: z.boolean(),
  streaming: z.boolean(),
  approvals: z.boolean(),
  tools: z.boolean(),
  mcp: z.boolean(),
  checkpoints: z.boolean(),
  worktrees: z.boolean(),
  models: z.boolean(),
});

const initializeResponseSchema = z.object({
  serverInfo: z.object({ name: z.string(), title: z.string(), version: z.string() }),
  protocolVersion: z.number().int().positive(),
  capabilities: capabilitiesSchema,
});

const legacyInitializeResponseSchema = z.object({
  serverInfo: z.object({
    name: z.string(),
    version: z.string(),
  }),
  capabilities: z.object({
    streaming: z.boolean(),
    tools: z.boolean(),
  }),
});

const threadSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().max(500),
  model: z.string().min(1).max(200).optional(),
  cwd: z.string().min(1).max(16_384).optional(),
  provider: z
    .string()
    .min(1)
    .max(200)
    .refine(
      (value) =>
        Array.from(value).every((character) => {
          const codePoint = character.codePointAt(0) ?? 0;
          return codePoint > 0x1f && (codePoint < 0x7f || codePoint > 0x9f);
        }),
      { message: 'Provider metadata contains control characters' },
    )
    .optional(),
  trustMode: z.enum(['local', 'byok', 'managed', 'unknown']),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.enum(['cli', 'vscode']),
  status: z.enum(['idle', 'running', 'awaiting_approval', 'archived', 'failed']),
});

const threadStartResponseSchema = z.object({ thread: threadSummarySchema });
const threadListResponseSchema = z.object({
  threads: z.array(threadSummarySchema),
  nextCursor: z.string().optional(),
});
const threadReadResponseSchema = z.object({
  thread: threadSummarySchema,
  messages: z
    .array(
      z.object({
        role: z.string().min(1).max(40),
        text: z.string().max(1_000_000),
      }),
    )
    .max(10_000),
  transcriptTruncated: z.boolean(),
});
const localModelListResponseSchema = z.object({
  models: z.array(
    z.object({
      id: z.string().min(1),
      provider: z.enum(['ollama', 'lmstudio']),
    }),
  ),
});
const turnSummarySchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  status: z.enum(['running', 'completed', 'interrupted', 'failed']),
});
const turnStartResponseSchema = z.object({ turn: turnSummarySchema });

const outputDeltaEventSchema = z.object({
  threadId: z.string().min(1),
  turnId: z.string().min(1),
  delta: z.string(),
});
const turnTerminalEventSchema = z.object({
  threadId: z.string().min(1),
  turnId: z.string().min(1),
  status: z.enum(['completed', 'failed']),
  response: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  error: z.string().nullable().optional(),
});
const approvalRequestedEventSchema = z.object({
  threadId: z.string().min(1),
  turnId: z.string().min(1),
  requestId: z.string().min(1),
  kind: z.string(),
  summary: z.string(),
  detail: z.string(),
});
const turnInterruptedEventSchema = z.object({
  threadId: z.string().min(1),
  turnId: z.string().min(1),
  status: z.literal('interrupted'),
});
const mcpStatusEventSchema = z.object({
  threadId: z.string().min(1),
  message: z.string().nullable().optional(),
});
const toolCategorySchema = z.enum([
  'web-search',
  'web-fetch',
  'code-execution',
  'filesystem',
  'shell',
  'skill',
  'memory',
  'connector',
  'mcp',
  'computer-use',
  'artifact',
  'other',
]);
const toolExecutionStartSchema = z.object({
  type: z.literal('tool-execution-start'),
  toolCallId: z.string().min(1),
  name: z.string().min(1),
  category: toolCategorySchema,
  summary: z.string().min(1),
  input: z.unknown(),
});
const toolExecutionEndSchema = z.object({
  type: z.literal('tool-execution-end'),
  toolCallId: z.string().min(1),
  name: z.string().min(1),
  output: z.unknown(),
  isError: z.boolean(),
  elapsedMs: z.number().int().nonnegative().optional(),
});
const progressUpdateSchema = z.object({
  type: z.literal('progress-update'),
  progressId: z.string().min(1),
  summary: z.string().min(1),
  detail: z.string().optional(),
  status: z.enum(['running', 'completed', 'failed']),
});
const agentEventEnvelopeSchema = z.object({
  schemaVersion: z.literal(AGENT_EVENT_SCHEMA_VERSION),
  sessionId: z.string().min(1),
  turnId: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  emittedAtMs: z.number().int().nonnegative(),
  event: z.discriminatedUnion('type', [
    toolExecutionStartSchema,
    toolExecutionEndSchema,
    progressUpdateSchema,
  ]),
});

export type LocalRuntimeEvent =
  | ({ type: 'output_delta' } & z.infer<typeof outputDeltaEventSchema>)
  | ({ type: 'turn_completed' } & z.infer<typeof turnTerminalEventSchema>)
  | ({ type: 'turn_failed' } & z.infer<typeof turnTerminalEventSchema>)
  | ({ type: 'turn_interrupted' } & z.infer<typeof turnInterruptedEventSchema>)
  | ({ type: 'approval_requested' } & z.infer<typeof approvalRequestedEventSchema>)
  | ({
      type: 'tool_execution_start';
      threadId: string;
      turnId: string;
      sequence: number;
      emittedAtMs: number;
    } & Omit<z.infer<typeof toolExecutionStartSchema>, 'type'>)
  | ({
      type: 'tool_execution_end';
      threadId: string;
      turnId: string;
      sequence: number;
      emittedAtMs: number;
    } & Omit<z.infer<typeof toolExecutionEndSchema>, 'type'>)
  | ({
      type: 'progress_update';
      threadId: string;
      turnId: string;
      sequence: number;
      emittedAtMs: number;
    } & Omit<z.infer<typeof progressUpdateSchema>, 'type'>)
  | ({
      type: 'mcp_status';
      status: 'loading' | 'ready' | 'unavailable';
    } & z.infer<typeof mcpStatusEventSchema>)
  | { type: 'runtime_disconnected'; error: string };

function parseRuntimeEvent(notification: AppServerNotification): LocalRuntimeEvent | undefined {
  if (notification.method === 'turn/output_delta') {
    const parsed = outputDeltaEventSchema.safeParse(notification.params);
    return parsed.success ? { type: 'output_delta', ...parsed.data } : undefined;
  }
  if (notification.method === 'turn/completed' || notification.method === 'turn/failed') {
    const parsed = turnTerminalEventSchema.safeParse(notification.params);
    if (!parsed.success) return undefined;
    return {
      type: notification.method === 'turn/completed' ? 'turn_completed' : 'turn_failed',
      ...parsed.data,
    };
  }
  if (notification.method === 'approval/requested') {
    const parsed = approvalRequestedEventSchema.safeParse(notification.params);
    return parsed.success ? { type: 'approval_requested', ...parsed.data } : undefined;
  }
  if (notification.method === 'turn/agent_event') {
    const parsed = agentEventEnvelopeSchema.safeParse(notification.params);
    if (!parsed.success) return undefined;
    const { sessionId: threadId, turnId, sequence, emittedAtMs, event } = parsed.data;
    if (event.type === 'tool-execution-start') {
      return {
        type: 'tool_execution_start',
        threadId,
        turnId,
        sequence,
        emittedAtMs,
        toolCallId: event.toolCallId,
        name: event.name,
        category: event.category,
        summary: event.summary,
        input: event.input,
      };
    }
    if (event.type === 'tool-execution-end') {
      return {
        type: 'tool_execution_end',
        threadId,
        turnId,
        sequence,
        emittedAtMs,
        toolCallId: event.toolCallId,
        name: event.name,
        output: event.output,
        isError: event.isError,
        elapsedMs: event.elapsedMs,
      };
    }
    return {
      type: 'progress_update',
      threadId,
      turnId,
      sequence,
      emittedAtMs,
      progressId: event.progressId,
      summary: event.summary,
      detail: event.detail,
      status: event.status,
    };
  }
  if (notification.method === 'turn/interrupted') {
    const parsed = turnInterruptedEventSchema.safeParse(notification.params);
    return parsed.success ? { type: 'turn_interrupted', ...parsed.data } : undefined;
  }
  if (
    notification.method === 'mcp/loading' ||
    notification.method === 'mcp/ready' ||
    notification.method === 'mcp/unavailable'
  ) {
    const parsed = mcpStatusEventSchema.safeParse(notification.params);
    if (!parsed.success) return undefined;
    return {
      type: 'mcp_status',
      status: notification.method.slice('mcp/'.length) as 'loading' | 'ready' | 'unavailable',
      ...parsed.data,
    };
  }
  return undefined;
}

export class LocalRuntimeProtocolError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = 'LocalRuntimeProtocolError';
  }
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

class JsonlConnection {
  private readonly pending = new Map<string, PendingRequest>();
  private readonly notificationListeners = new Set<(value: AppServerNotification) => void>();
  private buffer = '';
  private nextId = 1;
  private closed = false;

  constructor(
    input: Readable,
    private readonly output: Writable,
    private readonly onClose?: (error: Error) => void,
  ) {
    input.setEncoding('utf8');
    input.on('data', (chunk: string) => this.acceptChunk(chunk));
    input.on('error', (error) => this.close(error));
    input.on('end', () => this.close(new Error('AGI local runtime closed stdout')));
    output.on('error', (error) => this.close(error));
  }

  onNotification(listener: (value: AppServerNotification) => void): { dispose(): void } {
    this.notificationListeners.add(listener);
    return { dispose: () => this.notificationListeners.delete(listener) };
  }

  async request(
    method: string,
    params: unknown,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  ): Promise<unknown> {
    if (this.closed) throw new Error('AGI local runtime connection is closed');
    const id = this.nextId++;
    const key = String(id);
    const response = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(key);
        reject(new Error(`AGI local runtime request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(key, { resolve, reject, timer });
    });

    try {
      await this.writeLine(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    } catch (error) {
      const pending = this.pending.get(key);
      if (pending !== undefined) {
        clearTimeout(pending.timer);
        this.pending.delete(key);
        pending.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
    return response;
  }

  close(error = new Error('AGI local runtime connection closed')): void {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.notificationListeners.clear();
    this.onClose?.(error);
  }

  private acceptChunk(chunk: string): void {
    this.buffer += chunk;
    if (Buffer.byteLength(this.buffer, 'utf8') > MAX_LINE_BYTES && !this.buffer.includes('\n')) {
      this.close(new Error('AGI local runtime emitted an oversized JSONL frame'));
      return;
    }

    let newline = this.buffer.indexOf('\n');
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (Buffer.byteLength(line, 'utf8') > MAX_LINE_BYTES) {
        this.close(new Error('AGI local runtime emitted an oversized JSONL frame'));
        return;
      }
      if (line !== '') this.acceptLine(line);
      newline = this.buffer.indexOf('\n');
    }
  }

  private acceptLine(line: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      this.close(new Error('AGI local runtime emitted malformed JSON'));
      return;
    }

    const response = responseSchema.safeParse(parsed);
    if (response.success && response.data.id === null) {
      const protocolError = response.data.error;
      this.close(
        protocolError === undefined
          ? new Error('AGI local runtime emitted a response without a request id')
          : new LocalRuntimeProtocolError(
              protocolError.message,
              protocolError.code,
              protocolError.data,
            ),
      );
      return;
    }
    if (response.success) {
      const pending = this.pending.get(String(response.data.id));
      if (pending === undefined) return;
      clearTimeout(pending.timer);
      this.pending.delete(String(response.data.id));
      if (response.data.error !== undefined) {
        pending.reject(
          new LocalRuntimeProtocolError(
            response.data.error.message,
            response.data.error.code,
            response.data.error.data,
          ),
        );
      } else {
        pending.resolve(response.data.result);
      }
      return;
    }

    const notification = notificationSchema.safeParse(parsed);
    if (!notification.success) {
      this.close(new Error('AGI local runtime emitted an invalid protocol message'));
      return;
    }
    const value = notification.data as AppServerNotification;
    for (const listener of this.notificationListeners) listener(value);
  }

  private writeLine(line: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.output.write(`${line}\n`, (error) => {
        if (error !== null && error !== undefined) reject(error);
        else resolve();
      });
    });
  }
}

export type SpawnLocalRuntime = (
  command: string,
  args: readonly string[],
  options: Parameters<typeof nodeSpawn>[2],
) => ChildProcessWithoutNullStreams;

export type TerminateLocalRuntimeTree = (child: ChildProcessWithoutNullStreams) => Promise<void>;

export interface LocalRuntimeClientOptions {
  cliPath: string | (() => string);
  cwd: string;
  clientVersion: string;
  spawn?: SpawnLocalRuntime;
  terminateProcessTree?: TerminateLocalRuntimeTree;
}

export class LocalRuntimeClient {
  private child?: ChildProcessWithoutNullStreams;
  private connection?: JsonlConnection;
  private childExitPromise?: Promise<void>;
  private initializePromise?: Promise<InitializeResponse>;
  private disposePromise?: Promise<void>;
  private restartPromise?: Promise<void>;
  private readonly notificationListeners = new Set<(value: AppServerNotification) => void>();
  private readonly eventListeners = new Set<(value: LocalRuntimeEvent) => void>();
  private stderrTail = '';
  private disposed = false;

  constructor(private readonly options: LocalRuntimeClientOptions) {}

  initialize(): Promise<InitializeResponse> {
    if (this.initializePromise !== undefined) return this.initializePromise;
    const attempt = this.initializeOnce();
    this.initializePromise = attempt;
    void attempt.catch((error: unknown) => {
      if (this.initializePromise !== attempt) return;
      this.resetProcess(error instanceof Error ? error : new Error(String(error)), true);
    });
    return attempt;
  }

  async startThread(params: ThreadStartParams): Promise<ThreadSummary> {
    const connection = await this.readyConnection();
    const result = await connection.request('thread/start', params);
    return threadStartResponseSchema.parse(result).thread as ThreadSummary;
  }

  async listThreads(params: ThreadListParams): Promise<ThreadListResponse> {
    const connection = await this.readyConnection();
    return threadListResponseSchema.parse(
      await connection.request('thread/list', params),
    ) as ThreadListResponse;
  }

  async listLocalModels(): Promise<LocalModelListResponse> {
    const connection = await this.readyConnection();
    return localModelListResponseSchema.parse(
      await connection.request('model/list', {}),
    ) as LocalModelListResponse;
  }

  async resumeThread(threadId: string): Promise<ThreadSummary> {
    const connection = await this.readyConnection();
    const result = await connection.request('thread/resume', { threadId });
    return threadStartResponseSchema.parse(result).thread as ThreadSummary;
  }

  async readThread(threadId: string): Promise<ThreadReadResponse> {
    const connection = await this.readyConnection();
    return threadReadResponseSchema.parse(
      await connection.request('thread/read', { threadId }),
    ) as ThreadReadResponse;
  }

  async archiveThread(threadId: string): Promise<void> {
    const connection = await this.readyConnection();
    await connection.request('thread/archive', { threadId });
  }

  async startTurn(params: TurnStartParams): Promise<TurnSummary> {
    const connection = await this.readyConnection();
    const result = await connection.request('turn/start', params);
    return turnStartResponseSchema.parse(result).turn as TurnSummary;
  }

  async interruptTurn(params: TurnInterruptParams): Promise<void> {
    const connection = await this.readyConnection();
    await connection.request('turn/interrupt', params);
  }

  async steerTurn(params: TurnSteerParams): Promise<TurnSummary> {
    const connection = await this.readyConnection();
    const result = await connection.request('turn/steer', params);
    return turnStartResponseSchema.parse(result).turn as TurnSummary;
  }

  async respondToApproval(params: ApprovalResponseParams): Promise<void> {
    const connection = await this.readyConnection();
    await connection.request('approval/respond', params);
  }

  onNotification(listener: (value: AppServerNotification) => void): { dispose(): void } {
    this.notificationListeners.add(listener);
    return { dispose: () => this.notificationListeners.delete(listener) };
  }

  onEvent(listener: (value: LocalRuntimeEvent) => void): { dispose(): void } {
    this.eventListeners.add(listener);
    return { dispose: () => this.eventListeners.delete(listener) };
  }

  restart(): Promise<void> {
    if (this.restartPromise !== undefined) return this.restartPromise;
    const restart = (async () => {
      await this.disposeProcess(true);
      this.disposed = false;
      delete this.disposePromise;
      await this.initialize();
    })();
    this.restartPromise = restart;
    void restart.then(
      () => {
        if (this.restartPromise === restart) delete this.restartPromise;
      },
      () => {
        if (this.restartPromise === restart) delete this.restartPromise;
      },
    );
    return restart;
  }

  dispose(): Promise<void> {
    return this.disposeProcess(false);
  }

  private disposeProcess(preserveListeners: boolean): Promise<void> {
    if (this.disposePromise !== undefined) return this.disposePromise;
    this.disposed = true;
    if (!preserveListeners) this.notificationListeners.clear();
    const restartError = new Error('AGI local runtime process is restarting');
    for (const listener of this.eventListeners) {
      listener({ type: 'runtime_disconnected', error: restartError.message });
    }
    if (!preserveListeners) this.eventListeners.clear();
    const connection = this.connection;
    const child = this.child;
    const childExitPromise = this.childExitPromise;
    if (connection === undefined || child === undefined || childExitPromise === undefined) {
      this.resetProcess(restartError, true);
      this.disposePromise = Promise.resolve();
      return this.disposePromise;
    }

    this.disposePromise = this.shutdownProcess(connection, child, childExitPromise, restartError);
    return this.disposePromise;
  }

  private async shutdownProcess(
    connection: JsonlConnection,
    child: ChildProcessWithoutNullStreams,
    childExitPromise: Promise<void>,
    restartError: Error,
  ): Promise<void> {
    let graceful = false;
    try {
      const result = await connection.request('shutdown', {}, SHUTDOWN_ACK_TIMEOUT_MS);
      acknowledgedResponseSchema.parse(result);
      await waitWithTimeout(
        childExitPromise,
        SHUTDOWN_EXIT_TIMEOUT_MS,
        'AGI local runtime acknowledged shutdown but did not exit',
      );
      graceful = true;
    } catch {
      const terminateProcessTree =
        this.options.terminateProcessTree ?? terminateLocalRuntimeProcessTree;
      await waitWithTimeout(
        terminateProcessTree(child),
        HARD_KILL_TIMEOUT_MS,
        'AGI local runtime process-tree termination timed out',
      );
      await waitWithTimeout(
        childExitPromise,
        HARD_KILL_TIMEOUT_MS,
        'AGI local runtime did not exit after process-tree termination',
      );
    } finally {
      if (this.connection === connection || this.child === child) {
        this.resetProcess(restartError, !graceful);
      }
    }
  }

  private async initializeOnce(): Promise<InitializeResponse> {
    const connection = this.ensureProcess();
    const rawResult = await connection.request('initialize', {
      clientInfo: {
        name: 'agi_vscode',
        title: 'AGI for VS Code',
        version: this.options.clientVersion,
      },
    });
    const parsedResult = initializeResponseSchema.safeParse(rawResult);
    if (!parsedResult.success) {
      if (legacyInitializeResponseSchema.safeParse(rawResult).success) {
        throw new Error(
          `Installed AGI CLI does not support developer-session protocol ${SUPPORTED_PROTOCOL_VERSION}. Update the AGI CLI or set agiWorkforce.cliPath to a current binary.`,
        );
      }
      throw new Error('Installed AGI CLI returned an invalid developer-session handshake');
    }
    const result = parsedResult.data as InitializeResponse;
    if (result.protocolVersion !== SUPPORTED_PROTOCOL_VERSION) {
      throw new Error(
        `Installed AGI CLI uses developer-session protocol ${result.protocolVersion}; this extension requires exactly protocol ${SUPPORTED_PROTOCOL_VERSION}. Install a compatible AGI CLI or update the extension.`,
      );
    }
    if (!isSupportedCliVersion(result.serverInfo.version)) {
      throw new Error(
        `Installed AGI CLI reports version ${JSON.stringify(result.serverInfo.version)}; version ${MINIMUM_SUPPORTED_CLI_VERSION_LABEL} or newer is required for protocol ${SUPPORTED_PROTOCOL_VERSION}.`,
      );
    }
    if (
      !result.capabilities.threads ||
      !result.capabilities.turns ||
      !result.capabilities.streaming ||
      !result.capabilities.approvals ||
      !result.capabilities.models
    ) {
      throw new Error('Installed AGI CLI does not support the required developer-session protocol');
    }
    return result;
  }

  private async readyConnection(): Promise<JsonlConnection> {
    await this.initialize();
    const connection = this.connection;
    if (connection === undefined) throw new Error('AGI local runtime did not initialize');
    return connection;
  }

  private ensureProcess(): JsonlConnection {
    if (this.disposed) throw new Error('AGI local runtime client is disposed');
    if (this.connection !== undefined) return this.connection;
    const spawnRuntime = this.options.spawn ?? (nodeSpawn as SpawnLocalRuntime);
    const cliPath =
      typeof this.options.cliPath === 'function' ? this.options.cliPath() : this.options.cliPath;
    const child = spawnRuntime(cliPath, ['app-server'], {
      cwd: this.options.cwd,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      detached: process.platform !== 'win32',
    });
    this.stderrTail = '';
    this.child = child;
    let resolveChildExit!: () => void;
    const childExitPromise = new Promise<void>((resolve) => {
      resolveChildExit = resolve;
    });
    this.childExitPromise = childExitPromise;
    const connection = new JsonlConnection(child.stdout, child.stdin, (error) => {
      if (this.child === child) this.resetProcess(error, !this.disposed);
    });
    this.connection = connection;
    connection.onNotification((notification) => {
      for (const listener of this.notificationListeners) listener(notification);
      const event = parseRuntimeEvent(notification);
      if (event !== undefined) {
        for (const listener of this.eventListeners) listener(event);
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      this.stderrTail = `${this.stderrTail}${chunk}`.slice(-64 * 1024);
    });
    child.once('error', (error) => {
      if (child.pid === undefined) resolveChildExit();
      if (this.child === child && this.connection === connection) {
        this.resetProcess(error);
      }
    });
    child.once('exit', (code, signal) => {
      resolveChildExit();
      const detail = this.stderrTail.trim();
      const suffix = detail === '' ? '' : `: ${detail}`;
      if (this.child === child && this.connection === connection) {
        this.resetProcess(
          new Error(`AGI local runtime exited (${signal ?? String(code ?? 'unknown')})${suffix}`),
        );
      }
    });
    return connection;
  }

  private resetProcess(error: Error, terminate = false): void {
    const connection = this.connection;
    const child = this.child;
    const hadProcess = connection !== undefined || child !== undefined;
    delete this.connection;
    delete this.child;
    delete this.childExitPromise;
    delete this.initializePromise;
    connection?.close(error);
    if (terminate && child !== undefined) {
      const terminateProcessTree =
        this.options.terminateProcessTree ?? terminateLocalRuntimeProcessTree;
      void terminateProcessTree(child).catch(() => child.kill('SIGKILL'));
    }
    if (hadProcess) {
      for (const listener of this.eventListeners) {
        listener({ type: 'runtime_disconnected', error: error.message });
      }
    }
  }
}

function isSupportedCliVersion(version: string): boolean {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u);
  if (match === null) return false;
  const parts = match.slice(1, 4).map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part))) return false;
  for (const [index, minimum] of MINIMUM_SUPPORTED_CLI_VERSION.entries()) {
    const part = parts[index] ?? 0;
    if (part > minimum) return true;
    if (part < minimum) return false;
  }
  return match[4] === undefined;
}

async function waitWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function terminateLocalRuntimeProcessTree(
  child: ChildProcessWithoutNullStreams,
): Promise<void> {
  const processId = child.pid;
  if (processId === undefined || !Number.isSafeInteger(processId) || processId <= 0) {
    child.kill('SIGKILL');
    return;
  }

  if (process.platform !== 'win32') {
    try {
      process.kill(-processId, 'SIGKILL');
      return;
    } catch {
      child.kill('SIGKILL');
      return;
    }
  }

  await new Promise<void>((resolve, reject) => {
    const killer = nodeSpawn('taskkill', ['/PID', String(processId), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    killer.once('error', reject);
    killer.once('exit', () => resolve());
  });
}

export type { AppServerCapabilities };
