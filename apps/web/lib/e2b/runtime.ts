/**
 * E2B executor factory — the live @e2b/code-interpreter binding.
 *
 * Gated + fail-closed: returns null unless E2B is configured (see ./gate.ts). When
 * configured, creates a resource-bounded sandbox session and returns an E2BExecutor
 * that proxies runCode / file ops to it. A failure at any step (SDK missing, sandbox
 * create error, op error) fails CLOSED — the router surfaces an explicit error to the
 * model, never a silent no-op and never a provider-native fallback.
 *
 * VERIFICATION NOTE: there is no E2B key in this environment, so the live sandbox
 * round-trip is unverified here — that step is the operator's once `E2B_API_KEY` is
 * set. The binding is typed against @e2b/code-interpreter@2.6.1 (confirmed against the
 * installed package's `dist/index.d.ts`, not assumed from docs/training data) and
 * defensive (optional chaining + try/catch) so an API-shape surprise degrades to
 * fail-closed.
 *
 * Session scope: when an authenticated tenant/user/conversation scope is passed, ONE
 * sandbox + one code-context per language is reused across every execution-tool call in
 * that owned conversation (state persists — variables/imports survive across turns).
 * The scoped mapping lives in Redis (./session-store.ts) so it survives across serverless
 * invocations without allowing a conversation id alone to resume another user's sandbox.
 * `pauseE2BSession()` (called by the tool loop at turn end)
 * stops billing while preserving state; the next request's `getE2BExecutor()` resumes
 * it via `Sandbox.connect()`, which auto-resumes a paused sandbox. `killE2BSession()`
 * (called on conversation delete, or as a safety net) releases it for good.
 *
 * Without a `conversationId` (e.g. a bare API caller with no conversation), the
 * executor is ephemeral: one sandbox per call, killed by the caller's `dispose()` —
 * byte-for-byte the original Phase-B-scaffold behavior.
 */
import 'server-only';

import { getPlanMaxSandboxes, getPlanSandboxTtlMs } from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { SubscriptionService } from '@/lib/services/subscription-service';
import {
  MAX_EXECUTION_OUTPUT_BYTES,
  type CommandExecutionResult,
  type E2BExecutor,
  type ExecutionResult,
  type SandboxFileEntry,
} from './types';
import { e2bExecutionEnabled } from './gate';
import {
  E2B_COMPUTE_RATE_ENV,
  meterSandboxComputeInterval,
  sandboxComputeIsPriceable,
} from './compute-metering';
import {
  CHAT_SANDBOX_NETWORK_ACCESS,
  getE2BSession,
  saveE2BSession,
  deleteE2BSession,
  withUserSandboxLock,
  type E2BSession,
  type StoredContext,
  type E2BSessionScope,
} from './session-store';

const E2B_SANDBOX_TIMEOUT_MS = 60_000;

const E2B_CONVERSATION_TIMEOUT_MS = 10 * 60_000;
const E2B_COMMAND_TIMEOUT_MS = 60_000;
const ALL_OUTBOUND_TRAFFIC = '0.0.0.0/0';
const TRUSTED_CODE_HOSTS = [
  'github.com',
  'api.github.com',
  'raw.githubusercontent.com',
  'objects.githubusercontent.com',
  'registry.npmjs.org',
  'npmjs.com',
  'pypi.org',
  'files.pythonhosted.org',
] as const;

/**
 * GOV-4: the per-user sandbox allowance and conversation lifetime are plan
 * dimensions (`BILLING_PLAN_PRODUCT_LIMITS.maxSandboxes` / `.sandboxTtlMs`).
 * Plans grant 0–5 slots under the absolute five-per-user safety ceiling.
 *
 * The old implementation granted the same five slots and flat 10-minute
 * lifetime to every tier, including Free. The catalog now denies unsupported
 * tiers, gives Basic fewer slots, and scales lifetime with the plan while
 * preserving that hard ceiling.
 *
 * Only scoped (authenticated) sandboxes are counted and enforced; ephemeral
 * bare-API sandboxes self-dispose within `E2B_SANDBOX_TIMEOUT_MS`.
 */
function resolveSandboxLimits(planTier: string | null | undefined): {
  maxSandboxes: number;
  ttlMs: number;
} {
  return {
    maxSandboxes: getPlanMaxSandboxes(planTier),
    ttlMs: getPlanSandboxTtlMs(planTier),
  };
}

async function resolveScopePlanTier(scope: E2BSessionScope): Promise<string | null> {
  if (scope.planTier) return scope.planTier;
  try {
    const subscription = await SubscriptionService.getSubscription(scope.userId);
    return subscription?.plan_tier ?? 'free';
  } catch (err) {
    logger.error(
      { err, userId: scope.userId },
      '[e2b] plan lookup failed; refusing to create managed compute (fail-closed)',
    );
    return null;
  }
}

type E2BLanguage = 'python' | 'javascript' | 'typescript' | 'r' | 'java' | 'bash';

function mapLanguage(language: string): E2BLanguage {
  const l = language.trim().toLowerCase();
  if (l === 'node' || l === 'js' || l === 'javascript') return 'javascript';
  if (l === 'ts' || l === 'typescript') return 'typescript';
  if (l === 'r' || l === 'java' || l === 'bash' || l === 'python') return l;
  return 'python';
}

async function importSandbox(): Promise<typeof import('@e2b/code-interpreter').Sandbox | null> {
  try {
    const { Sandbox } = await import('@e2b/code-interpreter');
    return Sandbox;
  } catch (err) {
    logger.warn({ err }, '[e2b] @e2b/code-interpreter unavailable; fail-closed');
    return null;
  }
}

async function countUserSandboxes(
  Sandbox: NonNullable<Awaited<ReturnType<typeof importSandbox>>>,
  userId: string,
  stopAt: number,
): Promise<number> {
  const paginator = Sandbox.list({
    query: { metadata: { userId }, state: ['running', 'paused'] },
  });
  let count = 0;
  while (paginator.hasNext && count < stopAt) {
    const page = await paginator.nextItems();
    count += page.length;
  }
  return count;
}

const fail = (err: unknown): ExecutionResult => ({
  ok: false,
  output: '',
  error: err instanceof Error ? err.message : String(err),
});

function scopeAttribution(scope: E2BSessionScope): {
  conversationId?: string;
  codeSessionId?: string;
} {
  return {
    ...(scope.conversationId ? { conversationId: scope.conversationId } : {}),
    ...(scope.resource?.kind === 'code_session' ? { codeSessionId: scope.resource.id } : {}),
  };
}

function scopeLog(scope: E2BSessionScope | undefined): Record<string, string | undefined> {
  return {
    conversationId: scope?.conversationId,
    resourceKind: scope?.resource?.kind,
    resourceId: scope?.resource?.id,
  };
}

function createNetworkOptions(scope: E2BSessionScope | undefined): {
  allowInternetAccess?: boolean;
  network?: { allowOut?: string[]; denyOut?: string[] };
} {
  // A sandbox with no declared policy inherits the chat-sandbox default
  // ('trusted': a github/npm/pypi allowlist over deny-all egress) rather than the
  // SDK's internet-open default. This covers both a scope-less sandbox and a
  // scoped chat conversation that declares no networkAccess, so execute_code can
  // still install packages while arbitrary exfiltration stays blocked.
  const networkAccess = scope?.networkAccess ?? CHAT_SANDBOX_NETWORK_ACCESS;
  if (networkAccess === 'full') return { allowInternetAccess: true };
  if (networkAccess === 'trusted') {
    return {
      network: {
        allowOut: [...TRUSTED_CODE_HOSTS],
        denyOut: [ALL_OUTBOUND_TRAFFIC],
      },
    };
  }
  return { allowInternetAccess: false };
}

function updateNetworkOptions(scope: E2BSessionScope): {
  allowInternetAccess?: boolean;
  allowOut?: string[];
  denyOut?: string[];
} {
  if (scope.networkAccess === 'full') return { allowInternetAccess: true };
  if (scope.networkAccess === 'trusted') {
    return {
      allowOut: [...TRUSTED_CODE_HOSTS],
      denyOut: [ALL_OUTBOUND_TRAFFIC],
    };
  }
  return { allowInternetAccess: false };
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value;
  const bytes = Buffer.from(value, 'utf8').subarray(0, maxBytes);
  return `${bytes.toString('utf8')}\n[output truncated]`;
}

function commandResult(
  stdoutValue: unknown,
  stderrValue: unknown,
  exitCodeValue: unknown,
  errorValue?: unknown,
): CommandExecutionResult {
  const perStreamLimit = Math.floor(MAX_EXECUTION_OUTPUT_BYTES / 2);
  const stdout = truncateUtf8(typeof stdoutValue === 'string' ? stdoutValue : '', perStreamLimit);
  const stderr = truncateUtf8(typeof stderrValue === 'string' ? stderrValue : '', perStreamLimit);
  const exitCode = Number.isInteger(exitCodeValue) ? Number(exitCodeValue) : 1;
  const error =
    typeof errorValue === 'string' && errorValue.trim()
      ? errorValue
      : exitCode === 0
        ? undefined
        : `Command exited with status ${exitCode}`;
  return {
    ok: exitCode === 0,
    output: [stdout, stderr].filter(Boolean).join('\n') || '(no output)',
    stdout,
    stderr,
    exitCode,
    ...(error ? { error } : {}),
  };
}

export async function pauseE2BSession(scope: E2BSessionScope): Promise<void> {
  const session = await getE2BSession(scope);
  if (!session) return;
  const Sandbox = await importSandbox();
  if (!Sandbox) return;
  try {
    await Sandbox.pause(session.sandboxId);
  } catch (err) {
    logger.warn({ err, ...scopeLog(scope) }, '[e2b] pause failed');
  }
  await closeBillableInterval(scope, session, 'pause');
}

async function closeBillableInterval(
  scope: E2BSessionScope,
  session: E2BSession,
  reason: 'pause' | 'kill' | 'reclaim',
): Promise<void> {
  const startedAtMs = session.activeSinceMs;
  if (typeof startedAtMs !== 'number') return;

  await meterSandboxComputeInterval({
    userId: scope.userId,
    sandboxId: session.sandboxId,
    ...scopeAttribution(scope),
    startedAtMs,
    endedAtMs: Date.now(),
    reason,
  });

  if (reason === 'pause') {
    const { activeSinceMs: _closed, ...rest } = session;
    await saveE2BSession(scope, rest);
  }
}

export { closeBillableInterval };

async function releaseUnreachableSandbox(
  scope: E2BSessionScope,
  session: E2BSession,
): Promise<void> {
  await closeBillableInterval(scope, session, 'kill');
  try {
    const Sandbox = await importSandbox();
    if (Sandbox) await Sandbox.kill(session.sandboxId);
  } catch (err) {
    logger.warn(
      { err, sandboxId: session.sandboxId, ...scopeLog(scope) },
      '[e2b] unreachable sandbox could not be released; the reclaim sweeper is the backstop',
    );
  }
  await deleteE2BSession(scope);
}

/**
 * Permanently release the conversation's sandbox (conversation deleted, or an idle
 * safety net). Best-effort; also clears the Redis mapping so nothing tries to resume a
 * killed sandbox.
 */
export async function killE2BSession(scope: E2BSessionScope): Promise<void> {
  const session = await getE2BSession(scope);
  if (!session) {
    await deleteE2BSession(scope);
    return;
  }
  await closeBillableInterval(scope, session, 'kill');
  try {
    const Sandbox = await importSandbox();
    if (Sandbox) await Sandbox.kill(session.sandboxId);
  } catch (err) {
    logger.warn({ err, ...scopeLog(scope) }, '[e2b] kill failed');
  } finally {
    await deleteE2BSession(scope);
  }
}

export async function getE2BExecutor(scope?: E2BSessionScope): Promise<E2BExecutor | null> {
  if (!e2bExecutionEnabled()) return null;

  if (!sandboxComputeIsPriceable()) {
    logger.error(
      { env: E2B_COMPUTE_RATE_ENV, ...(scope ? scopeLog(scope) : {}) },
      '[e2b] sandbox compute has no configured price; refusing to provision (fail-closed)',
    );
    return null;
  }

  const conversationId = scope?.conversationId;
  const codeSessionId = scope?.resource?.kind === 'code_session' ? scope.resource.id : undefined;

  const Sandbox = await importSandbox();
  if (!Sandbox) return null;
  const SandboxCtor = Sandbox;

  type SandboxInstance = InstanceType<typeof Sandbox>;

  const existingSession = scope ? await getE2BSession(scope) : null;

  let planTier: string | null = null;
  let maxSandboxes: number | null = null;
  let planTtlMs = 0;
  if (scope) {
    planTier = await resolveScopePlanTier(scope);
    if (planTier === null) return null;
    const limits = resolveSandboxLimits(planTier);
    maxSandboxes = limits.maxSandboxes;
    planTtlMs = limits.ttlMs;
    if (maxSandboxes !== null && maxSandboxes <= 0) {
      logger.warn(
        { userId: scope.userId, planTier, ...scopeLog(scope) },
        '[e2b] plan does not include managed sandboxes; refusing (fail-closed)',
      );
      return null;
    }
    if (planTtlMs <= 0) {
      logger.warn(
        { userId: scope.userId, planTier, ...scopeLog(scope) },
        '[e2b] plan grants no managed sandbox lifetime; refusing (fail-closed)',
      );
      return null;
    }
  }

  const sandboxTimeoutMs = scope
    ? planTtlMs || E2B_CONVERSATION_TIMEOUT_MS
    : E2B_SANDBOX_TIMEOUT_MS;
  const metadata: Record<string, string> = {};
  if (conversationId) metadata['conversationId'] = conversationId;
  if (codeSessionId) metadata['codeSessionId'] = codeSessionId;
  if (scope?.userId) metadata['userId'] = scope.userId;
  const template = scope?.templateId?.trim() || null;
  const createOpts = scope
    ? {
        timeoutMs: sandboxTimeoutMs,
        lifecycle: { onTimeout: 'pause' as const },
        metadata,
        ...createNetworkOptions(scope),
      }
    : { timeoutMs: sandboxTimeoutMs, metadata, ...createNetworkOptions(scope) };

  async function createFresh(): Promise<SandboxInstance | null> {
    const create = async (): Promise<SandboxInstance | null> => {
      try {
        // Sandbox.create is overloaded: (opts) uses the SDK's default image,
        // (template, opts) picks one. The id reaching here has already been
        // matched against the account's catalogue, so it is never client text.
        const sandbox = template
          ? await SandboxCtor.create(template, createOpts)
          : await SandboxCtor.create(createOpts);
        return sandbox as SandboxInstance;
      } catch (err) {
        logger.warn({ err, template }, '[e2b] sandbox create failed; fail-closed');
        return null;
      }
    };

    if (!scope?.userId || maxSandboxes === null) return create();

    const limit = maxSandboxes;
    const guarded = await withUserSandboxLock(scope, async () => {
      try {
        const live = await countUserSandboxes(SandboxCtor, scope.userId, limit);
        if (live >= limit) {
          logger.warn(
            { userId: scope.userId, live, limit, planTier, ...scopeLog(scope) },
            '[e2b] per-user sandbox quota reached; refusing new sandbox (fail-closed)',
          );
          return null;
        }
      } catch (err) {
        logger.error(
          { err, userId: scope.userId, planTier },
          '[e2b] sandbox quota check failed; refusing new sandbox (fail-closed)',
        );
        return null;
      }
      return create();
    });

    if (!guarded.locked) {
      logger.warn(
        { userId: scope.userId, ...scopeLog(scope) },
        '[e2b] could not serialise sandbox creation; refusing (fail-closed)',
      );
      return null;
    }
    return guarded.result ?? null;
  }

  let sandbox: SandboxInstance;
  let sandboxId: string;
  const contexts: Record<string, StoredContext> = { ...(existingSession?.contexts ?? {}) };
  let activeSinceMs: number | undefined;

  if (scope && existingSession) {
    try {
      sandbox = (await Sandbox.connect(existingSession.sandboxId, {
        timeoutMs: sandboxTimeoutMs,
      })) as SandboxInstance;
      sandboxId = existingSession.sandboxId;
    } catch (err) {
      logger.warn(
        { err, sandboxId: existingSession.sandboxId, ...scopeLog(scope) },
        '[e2b] resume failed; releasing the unreachable sandbox before creating a fresh one',
      );
      await releaseUnreachableSandbox(scope, existingSession);
      for (const key of Object.keys(contexts)) delete contexts[key];
      const fresh = await createFresh();
      if (!fresh) return null;
      sandbox = fresh;
      sandboxId = fresh.sandboxId;
    }
  } else {
    const fresh = await createFresh();
    if (!fresh) return null;
    sandbox = fresh;
    sandboxId = fresh.sandboxId;
  }

  if (scope?.resource?.kind === 'code_session') {
    try {
      await sandbox.updateNetwork(updateNetworkOptions(scope));
    } catch (err) {
      logger.error(
        { err, userId: scope.userId, codeSessionId, networkAccess: scope.networkAccess },
        '[e2b] code-session network policy could not be enforced; refusing executor',
      );
      try {
        await Sandbox.pause(sandboxId);
      } catch {
        // The plan timeout remains the billing and lifecycle backstop.
      }
      return null;
    }
  }

  async function persistSession(): Promise<void> {
    if (!scope) return;
    const session: E2BSession = {
      sandboxId,
      contexts,
      ...(activeSinceMs !== undefined ? { activeSinceMs } : {}),
      ...(scope.networkAccess ? { networkAccess: scope.networkAccess } : {}),
    };
    await saveE2BSession(scope, session);
  }

  activeSinceMs = Date.now();
  await persistSession();

  async function getContext(language: E2BLanguage): Promise<StoredContext> {
    const cached = contexts[language];
    if (cached) return cached;
    const ctx = await sandbox.createCodeContext({ language });
    const stored: StoredContext = { id: ctx.id, language: ctx.language, cwd: ctx.cwd };
    contexts[language] = stored;
    await persistSession();
    return stored;
  }

  return {
    async runCode({ language, code }): Promise<ExecutionResult> {
      try {
        const lang = mapLanguage(language);
        const context = conversationId ? await getContext(lang) : undefined;
        const execution = context
          ? await sandbox.runCode(code, {
              context: { id: context.id, language: context.language, cwd: context.cwd },
            })
          : await sandbox.runCode(code, { language: lang });
        const stdout = (execution.logs?.stdout ?? []).join('');
        const stderr = (execution.logs?.stderr ?? []).join('');
        if (execution.error) {
          const traceback = execution.error.traceback ? `\n${execution.error.traceback}` : '';
          return {
            ok: false,
            output: stdout,
            error: `${execution.error.name}: ${execution.error.value}${traceback}`,
          };
        }
        const output = [stdout, stderr, execution.text ?? ''].filter(Boolean).join('\n');
        const pngResults = ((execution.results ?? []) as Array<{ png?: unknown }>)
          .map((r) => r?.png)
          .filter((png): png is string => typeof png === 'string' && png.length > 0);
        return {
          ok: true,
          output: output || '(no output)',
          ...(pngResults.length > 0 ? { pngResults } : {}),
        };
      } catch (err) {
        return fail(err);
      }
    },
    async writeFile({ path, content }): Promise<ExecutionResult> {
      try {
        await sandbox.files.write(path, content);
        return { ok: true, output: `Wrote ${path}` };
      } catch (err) {
        return fail(err);
      }
    },
    async createFolder({ path }): Promise<ExecutionResult> {
      try {
        await sandbox.files.makeDir(path);
        return { ok: true, output: `Created ${path}` };
      } catch (err) {
        return fail(err);
      }
    },
    async runCommand({ command, cwd, timeoutMs }): Promise<CommandExecutionResult> {
      try {
        const result = await sandbox.commands.run(command, {
          ...(cwd ? { cwd } : {}),
          timeoutMs: Math.min(
            E2B_COMMAND_TIMEOUT_MS,
            Math.max(1_000, timeoutMs ?? E2B_COMMAND_TIMEOUT_MS),
          ),
        });
        return commandResult(result.stdout, result.stderr, result.exitCode, result.error);
      } catch (err) {
        const commandError = err as {
          stdout?: unknown;
          stderr?: unknown;
          exitCode?: unknown;
          error?: unknown;
          message?: unknown;
        };
        return commandResult(
          commandError.stdout,
          commandError.stderr,
          commandError.exitCode,
          commandError.error ?? commandError.message,
        );
      }
    },
    async listFiles(path): Promise<SandboxFileEntry[] | null> {
      try {
        const entries = await sandbox.files.list(path);
        return entries.map((e) => ({
          path: e.path,
          name: e.name,
          isDir: e.type === 'dir',
          byteSize: typeof e.size === 'number' ? e.size : 0,
        }));
      } catch (err) {
        logger.warn({ err, path }, '[e2b] listFiles failed');
        return null;
      }
    },
    async readFileBytes(path): Promise<Uint8Array | null> {
      try {
        return await sandbox.files.read(path, { format: 'bytes' });
      } catch (err) {
        logger.warn({ err, path }, '[e2b] readFileBytes failed');
        return null;
      }
    },
    async pause(): Promise<void> {
      if (!scope) return;
      const intervalStartedAtMs = activeSinceMs;
      activeSinceMs = undefined;
      try {
        await persistSession();
      } catch (err) {
        logger.warn({ err, ...scopeLog(scope) }, '[e2b] persistSession before pause failed');
      }
      try {
        await Sandbox.pause(sandboxId);
      } catch (err) {
        logger.warn({ err, ...scopeLog(scope) }, '[e2b] pause (live handle) failed');
      }
      if (intervalStartedAtMs !== undefined) {
        await meterSandboxComputeInterval({
          userId: scope.userId,
          sandboxId,
          ...scopeAttribution(scope),
          startedAtMs: intervalStartedAtMs,
          endedAtMs: Date.now(),
          reason: 'pause',
        });
      }
    },
    async dispose(): Promise<void> {
      if (scope) {
        await persistSession();
        return;
      }
      try {
        await sandbox.kill();
      } catch (err) {
        logger.warn({ err }, '[e2b] sandbox kill failed');
      }
      // GOV-5: an ephemeral sandbox has no authenticated scope, so its seconds
      // cannot be attributed to a ledger. It is instead bounded to
      // E2B_SANDBOX_TIMEOUT_MS and killed here — the exposure is one minute of
      // compute per bare-API call, not an open-ended meter.
    },
  };
}
